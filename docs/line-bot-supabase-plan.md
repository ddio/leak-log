# LINE bot + Supabase 觸發器 — 實作計畫

> 狀態：**已實作上線(2026-06-25)**。目的：(1) 用 Supabase pg_cron 取代被 GitHub 節流的排程,比較準地監聽 Airtable;(2) 網頁部署成功後,把該輪新同步的紀錄推到 LINE 群組。
>
> 設計取向：**server 越薄越好(設計 a)**。重活(圖片處理 / 去 GPS / Drive / entries.json / Pages 部署)全部留在現有、已驗證的 GitHub Actions `sync.yml`;Supabase 只做「可靠觸發」與「收 LINE event」,LINE 推送由 workflow 末段自己發。

## 實作現況(2026-06-25)

- **Supabase 專案**:ref `yougbqqtttrghlviquoq`(`https://yougbqqtttrghlviquoq.supabase.co`)。
- **Edge Functions(已部署,`verify_jwt=false`,各自有自驗機制)**:
  - `line-webhook` → `https://yougbqqtttrghlviquoq.supabase.co/functions/v1/line-webhook`(填進 LINE Console 的 Webhook URL)
  - `poll-and-dispatch` → 同網域 `/functions/v1/poll-and-dispatch`(pg_cron 每 2 分打,需帶 `x-cron-secret`)
- **Migrations**:`0001` 建表、`0002` 啟用 pg_cron/pg_net、`0003` cron 排程(密鑰走 Vault)。
- **pg_cron**:job `leaklog-poll`,`*/2 * * * *`;手動觸發已驗證回 `200 {"unsynced":false,"dispatched":false}`。
- **程式碼**:`scripts/sync.ts`(輸出 `.sync-output.json`)、`scripts/notify-line.ts`(`npm run notify`,用 `pg`)、`.github/workflows/sync.yml`(末段 Notify LINE)。
- **監控**:HTTP 回應看 `net._http_response`、排程看 `cron.job_run_details`、函式 log 看 Dashboard → Edge Functions → Logs(或 MCP `get_logs`)。
- **待 LINE 端驗收**:把 bot 拉進群(寫進 `line_groups`)、群內打「訂閱」(`notify_enabled=true`)、丟一筆新 Airtable 紀錄看會不會推播。

## 背景:為什麼要做這個

- GitHub Actions 的 `schedule`(cron `*/15`)實際被節流成**大約每小時一次、間隔不固定**(2026-06-23 觀測:08:00→09:27→10:43→11:49→13:07→14:06→15:21→16:20)。這是 GitHub 對排程 workflow 的已知行為(高負載丟棄、不補跑),不是 repo 設定問題。
- 想要(1)更準的輪詢、(2)上站後主動通知,於是引入一個自有的輕量 server。

## 最終架構

```
[Supabase pg_cron 每 1–2 分]
        │ 觸發(pg_net 打 HTTP)
        ▼
[Edge Function: poll-and-dispatch]
   1. 打 Airtable 撈「已同步=未勾」的 record(一次輕量 list call)
   2. 有 → POST GitHub workflow_dispatch 觸發 sync.yml;沒有 → 結束
        │
        ▼
[現有 GitHub Actions sync.yml]  ← 完全沿用
   末段新增 step:entries.json 真的有 commit 時 → push LINE
        │
        ▼
[LINE 群組]  收到本輪新同步紀錄的分享卡片 + https://ddio.github.io/leak-log/r/{id}

[Edge Function: line-webhook]  ← 收 join/leave 維護 line_groups(群清單)+ 之後收指令
```

## 為什麼用 Supabase(而非 Render 免費版)

- Render 免費 web service **閒置 15 分鐘休眠**,長駐 `setInterval` 輪詢會跟著停;要不睡得靠外部 keep-alive ping,等於又多一個外部 cron,本末倒置。Render 自家 Cron Job 是付費。
- Supabase 免費含 **pg_cron**(真排程,不怕休眠)+ **Edge Functions**(Deno/TS,on-demand)+ **Postgres**(存 groupId)。輪詢這半天生準時。

---

## 後台資料表(Supabase)

LINE 沒有「列出 bot 加入哪些群」的 API,群清單只能靠 webhook 的 `join`/`leave` event 自己記帳。這幾張表(schema 在 `supabase/migrations/0001_line_admin_tables.sql`)就是**群組清單的唯一 source of truth**,Supabase 內建的 **Table Editor 直接當後台**——勾 `notify_enabled` 控制推不推,不必另外做網頁。

| 表 | 用途 |
|---|---|
| `line_groups` | 群組清單。`group_id` / `name` / `picture_url` / `member_count` / `notify_enabled`(管理員勾選,預設 false)/ `status`(joined·left 軟刪除)/ `last_notified_at` / `last_notified_url`。 |
| `line_group_members` | 群成員名稱(best-effort)。`members/ids` 需已驗證/付費帳號,未驗證 403 → 抓不到就空著,人數一律看 `line_groups.member_count`。 |

讀寫分工:

- **`line-webhook` 寫入**:`join` → upsert 一列(status=joined、抓 summary 補 name/picture/count);`leave` → 該列 status=left + left_at;(可選)訂閱指令 → 改 `notify_enabled`。白名單以外的群可在 `join` 當下呼叫 leave API 退出。
- **`notify-line.ts` 讀取**:推播前 `select group_id from line_groups where status='joined' and notify_enabled=true`,逐群 push;push 成功後回寫 `last_notified_at` / `last_notified_url`。
- 原本寫死的單一 `LINE_GROUP_ID` secret 因此**移除**,推送目標改由這張表決定。

---

## 要建的元件

### 1. Edge Function `poll-and-dispatch`(Deno/TypeScript)

職責:被 pg_cron 定時叫起 → 查 Airtable 有沒有未同步 → 有就觸發 GitHub workflow。

先用共享密鑰自保:呼叫方需帶 `x-cron-secret: <CRON_SECRET>`,不符回 401(`CRON_SECRET` 未設時 fail-closed)。

邏輯(實作):
1. 分頁 `GET https://api.airtable.com/v0/{baseId}/{tableId}?returnFieldsByFieldId=true&pageSize=100&fields[]=fld03aEdvWRnk8nVd`,逐頁判斷 `fields['fld03aEdvWRnk8nVd'] !== true`,**發現任一未同步就提前回 true**(輕量、不抓多餘欄位;用欄位 **ID** 不怕改名,與 `FIELDS.synced` 一致)。
   - base `app9qIBi0OyA9LM9I` / table `tbly6tnHFnzvXViZH`(可用 env 覆寫)。
2. 若有未同步 → `POST https://api.github.com/repos/ddio/leak-log/actions/workflows/sync.yml/dispatches`,body `{"ref":"main"}`,header `Authorization: Bearer {PAT}`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`。
3. 沒有 → 直接結束(省掉一次 Actions 跑全套 build 的浪費)。回 JSON `{unsynced, dispatched, dryRun}`。

需要的環境變數(Supabase function secrets):
- `AIRTABLE_API_KEY`(讀)
- `GH_DISPATCH_PAT`(fine-grained PAT,限 `ddio/leak-log`、權限 **Actions: Read and write**)
- `CRON_SECRET`(共享密鑰,與 Vault `cron_secret` 同值)
- 選用 `DRY_RUN`(只查不觸發)

> 註:`workflow_dispatch` 只在 default branch(main)生效——已符合。
> 去重不需要做在這層:`sync.yml` 自己會「撈未同步 → 沒變更就跳過 commit」,重複觸發頂多空跑一次。但仍建議只在「真的有未同步」時才 dispatch,避免每 1–2 分都跑全套 build。

### 2. Edge Function `line-webhook`(Deno/TypeScript)

職責:接 LINE platform 的 webhook event,維護 `line_groups`(群清單真實來源),之後可擴充指令。

邏輯:
1. 驗 `X-Line-Signature`(用 channel secret 做 HMAC-SHA256)。
2. 解析 events(只處理 `source.type === 'group'`):
   - `join`(被拉進群)→ upsert `line_groups`(status=joined),順手打 `/summary` + `/members/count` 補 name·picture·member_count;若設了 `GROUP_ALLOWLIST` 且不在內,呼叫 `POST /v2/bot/group/{groupId}/leave` 退出、不記帳。
   - `leave` / `bot 被踢` → 該列 status=left、補 left_at。
   - `memberJoined` / `memberLeft` → 刷新 `member_count`。
   - `message` 文字 → 先 upsert 確保有這筆群(webhook 可能晚於 join),再認指令:「訂閱/開啟通知」→ `notify_enabled=true`;「取消訂閱/關閉通知」→ false;並 reply 回確認。
3. 一律回 200(單一 event 失敗不影響其他,LINE 失敗會自動重送)。

需要的環境變數:
- `LINE_CHANNEL_SECRET`(驗簽)
- `LINE_CHANNEL_ACCESS_TOKEN`(抓群 summary / 自動退群 / reply 都要)
- 選用 `GROUP_ALLOWLIST`(逗號分隔 groupId 白名單)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase **自動注入**(service role 寫 DB 繞 RLS),免設。

部署:`verify_jwt=false`(LINE 不帶 Supabase JWT,改由函式自驗 `X-Line-Signature`)。
LINE Console 把 Webhook URL 設成 `https://yougbqqtttrghlviquoq.supabase.co/functions/v1/line-webhook`,開 "Use webhook"、關 Auto-reply/Greeting、開 Allow bot to join group chats。

### 3. pg_cron 排程(Supabase SQL)

擴充啟用在 `0002_enable_pg_cron_pg_net.sql`;排程在 `0003_cron_poll_dispatch.sql`。共享密鑰**不硬編進排程定義**,改由 cron job 執行時從 **Vault** 讀:

```sql
-- 前置(一次性):
--   1. function secret： CRON_SECRET = <隨機字串>
--   2. Vault 同值：     select vault.create_secret('<同一字串>', 'cron_secret');
select cron.schedule(
  'leaklog-poll',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://yougbqqtttrghlviquoq.supabase.co/functions/v1/poll-and-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> `poll-and-dispatch` 端比對 `x-cron-secret` 與 `CRON_SECRET`,不符回 401——擋掉非 cron 的亂打。
> 監控:`select * from net._http_response order by created desc`(看 HTTP 結果)、`select * from cron.job_run_details order by start_time desc`(看排程有沒有跑)。

### 4. `sync.ts` 輸出「本輪新同步的 record」

讓 pipeline 把這一輪實際 `markSynced` 成功的 record 寫到一個小檔,給 LINE 步驟讀(比在 workflow 端猜 `entries[0]` 精準——避免有人重編舊紀錄時誤播成最新)。

整合點(`scripts/sync.ts`):
- 在迴圈成功分支(目前 `ok++` 那段,line 44 後)收集 `{ id, title, eventTimestamp }`。
- `main()` 結束前若有新同步,寫 `./.sync-output.json`(陣列)。沒有就不寫 / 寫 `[]`。
- 此檔不需 commit,只在 workflow 內當作 step 之間傳遞用(可加進 `.gitignore`)。

最新一筆 = 依 `eventTimestamp` 最新者,或就照 `entries.json` 新→舊取第一個被新增的。

### 5. `sync.yml` 末段:推 LINE

在現有 "Commit synced data" step **之後、且只在有 commit 時**加一步。建議在 commit step 設個 output 標記有沒有變更,LINE step `if:` 該標記為真才跑。

虛擬碼:
```yaml
      - name: Commit synced data
        id: commit
        run: |
          ...
          if git diff --cached --quiet; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "data: sync from airtable"
            git push
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      # build + upload-pages-artifact + deploy-pages ...(維持)

      - name: Notify LINE
        if: steps.commit.outputs.changed == 'true'
        env:
          LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}   # pg 直連，不走 supabase-js（降耦）
        run: npm run notify   # 讀 .sync-output.json + line_groups → push 卡片
```

注意:Notify 放在 **deploy-pages 成功之後**,確保 `/r/{id}` 已上線、連結 unfurl 得出 OG 圖。

`scripts/notify-line.ts` 做的事:
- 讀 `.sync-output.json`;空就 exit 0。
- 用 `pg` 連 `DATABASE_URL`(不走 supabase-js,讓 GitHub 側只認識「一個 Postgres」),查 `select group_id from line_groups where status='joined' and notify_enabled=true`,逐群 `POST https://api.line.me/v2/bot/message/push`,body `{ to: group_id, messages: [...] }`,header `Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}`;push 成功後回寫該群 `last_notified_at` / `last_notified_url` / `last_notified_title`。單一群組失敗(被踢/封鎖)不影響其他群。
- 訊息可先用 text(標題 + `https://ddio.github.io/leak-log/r/{id}`),之後升級 Flex Message 帶縮圖。

---

## 需要的 Secrets / 設定總表

| 放哪 | 名稱 | 用途 |
|---|---|---|
| Supabase function | `AIRTABLE_API_KEY` | poll 讀 Airtable |
| Supabase function | `GH_DISPATCH_PAT` | 觸發 workflow_dispatch(fine-grained,限 repo、Actions RW) |
| Supabase function | `CRON_SECRET` | poll 的共享密鑰(與 Vault `cron_secret` 同值) |
| Supabase function | `LINE_CHANNEL_SECRET` | line-webhook 驗簽 |
| Supabase function | `LINE_CHANNEL_ACCESS_TOKEN` | line-webhook 抓群 summary / 自動退群 / reply |
| Supabase Vault | `cron_secret` | cron job 執行時讀,當 `x-cron-secret`(= `CRON_SECRET`) |
| GitHub Secrets | `LINE_CHANNEL_ACCESS_TOKEN` | sync.yml 推群組 |
| GitHub Secrets | `DATABASE_URL` | notify-line 用 `pg` 直連讀寫 `line_groups`(降耦,不走 supabase-js) |

> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 給 Edge Function 寫 DB,Supabase 自動注入、免設。

> 推送目標不再用單一 `LINE_GROUP_ID`,改由 `line_groups.notify_enabled` 決定(見「後台資料表」)。
> notify-line 走 `DATABASE_URL` 而非 Supabase API,是為了讓 GitHub 側不綁 Supabase(見「相依性與本機測試策略」)。

> **Drive 金鑰維持只在 GitHub Actions,不上 server。**

## 一次性手動設定(現況)

- ✅ Supabase 專案建好、三支 migration 套用、兩個 function 部署(`verify_jwt=false`)。
- ✅ function secrets + GitHub secrets + Vault `cron_secret` 設定完成。
- ✅ pg_cron `leaklog-poll` 排程接上,手動觸發驗證回 200。
- ⏳ LINE 端驗收:建 Messaging API channel(已開)→ 填 Webhook URL `.../functions/v1/line-webhook` + 開 Use webhook → 把 bot 拉進群(`join` 寫進 `line_groups`)→ 群內打「訂閱」或在 Table Editor 勾 `notify_enabled` → 丟一筆新 Airtable 紀錄看推播。
- (可選)保留 GitHub `schedule` cron 當 fallback——Supabase 掛掉時仍會慢慢同步。

## 已知限制 / 注意
- LINE 免費 push 約每月 200 則,本專案用量遠低於此。
- 群組 push 需 bot 仍在群內、未被封鎖。
- Supabase Edge Function 冷啟動有秒級延遲,對「每 2 分輪詢」無感。
- pg_net / pg_cron 屬非同步,失敗只進 Postgres log,需要時去 `cron.job_run_details` 查。
- workflow_dispatch 仍只能觸發 main 上的 workflow。

## 相依性與本機測試策略

### 對 Supabase 綁多深(換平台時)
- 🔴 **`pg_cron` + `pg_net`(排程觸發)**:`pg_net` 是 Supabase 自家擴充,「在 Postgres 內發非同步 HTTP」幾乎只此一家。遷移 = 整個觸發機制換成一般 cron 打 HTTP。黏最緊。
- 🔴 **Edge Functions 部署/JWT 驗證/公開 URL**:handler 程式碼可攜(就是 Deno Web fetch handler),但平台層綁 Supabase。
- 🟡 **Table Editor 當後台 UI**:離開 Supabase 就得自己做一個 UI。刻意取捨,但不可攜。
- 🟢 **三張表 schema + 資料**:純標準 Postgres,`pg_dump` 可搬,完全可攜。

降耦手段(已納入設計):
- `notify-line.ts` 走 `DATABASE_URL` + `pg` 直連,不走 supabase-js → GitHub 側只認識「一個 Postgres」。
- Edge Function 把**純邏輯**(給 event / DB 做 X)和**平台膠水**(讀 env、serve handler、JWT 檢查)分檔,純邏輯才好單獨測。
- 三個對外副作用點(`poll-and-dispatch` 的 GitHub dispatch、`notify-line` 的 LINE push、`line-webhook` 的自動退群)吃一個 `DRY_RUN` 環境變數,本機只印 log 不真的打。

### 本機可測 vs 留到雲端
business logic 基本上 100% 本機可測;Supabase 只吃掉「定時觸發」與「部署驗證」這兩件本來就該在真環境才驗的事。

| 元件 | 本機可測 | 怎麼測 |
|---|---|---|
| 三張表 schema + 觸發器 | ✅ | docker `postgres:16` → 套 `0001_*.sql` → 驗 table/trigger/`updated_at` |
| `notify-line.ts` | ✅ | 連本機 PG、塞 `notify_enabled=true` 一筆,打真的 LINE 測試群(或 `DRY_RUN=1`) |
| `line-webhook` 純邏輯 | ✅ | 手刻 LINE event payload + 算好簽章 → 驗本機 PG upsert/軟刪 |
| `poll-and-dispatch` 純邏輯 | ✅ | 真讀 Airtable(唯讀);GitHub dispatch 用 `DRY_RUN` 印出來不真打 |
| `sync.ts` → `.sync-output.json` | ✅ | 既有 pipeline,本機照跑 |
| `pg_cron`/`pg_net` 定時觸發 | ❌ | 不需本機測:開發時用一行 `curl` 手動打 `poll-and-dispatch` 取代鬧鐘,下游全測得到 |
| Edge Function 部署/JWT/URL/冷啟動 | ❌ | 純平台層,部署後驗 |
| 完整 `sync.yml` 串接 + Pages unfurl/OG | ❌ | GitHub/Pages 側,實際環境驗 |

### 本機開發環境
- docker 起 Postgres、套 migration。
- `.env.local`:`DATABASE_URL`(本機)、`AIRTABLE_API_KEY`(真的、唯讀)、一個 LINE 測試 channel + 測試群、`DRY_RUN=1`(要驗整條時才關)。
- 跑 function:`supabase functions serve`(Supabase CLI 在本機跑 Deno,不碰雲)或直接 `deno test` 測純邏輯。

## 工序(已照此完成)
1. ✅ `sync.ts` 輸出 `.sync-output.json` + `scripts/notify-line.ts` + `sync.yml` 加 Notify step。
2. ✅ `line-webhook` function(維護 `line_groups`)。
3. ✅ `poll-and-dispatch` function + PAT。
4. ✅ pg_cron 排程接上,手動觸發 end-to-end 驗證(200)。
5. ⏳ 視情況把 GitHub `schedule` 間隔拉長或保留當 fallback(目前仍 `*/15` 保留)。
