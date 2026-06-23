# LINE bot + Supabase 觸發器 — 實作計畫

> 狀態：**規劃中,尚未動工**。目的：(1) 用 Supabase pg_cron 取代被 GitHub 節流的排程,比較準地監聽 Airtable;(2) 網頁部署成功後,把該輪新同步的紀錄推到 LINE 群組。
>
> 設計取向：**server 越薄越好(設計 a)**。重活(圖片處理 / 去 GPS / Drive / entries.json / Pages 部署)全部留在現有、已驗證的 GitHub Actions `sync.yml`;Supabase 只做「可靠觸發」與「收 LINE event」,LINE 推送由 workflow 末段自己發。

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

[Edge Function: line-webhook]  ← 只為「抓 groupId / 之後收指令」而存在
```

## 為什麼用 Supabase(而非 Render 免費版)

- Render 免費 web service **閒置 15 分鐘休眠**,長駐 `setInterval` 輪詢會跟著停;要不睡得靠外部 keep-alive ping,等於又多一個外部 cron,本末倒置。Render 自家 Cron Job 是付費。
- Supabase 免費含 **pg_cron**(真排程,不怕休眠)+ **Edge Functions**(Deno/TS,on-demand)+ **Postgres**(存 groupId)。輪詢這半天生準時。

---

## 要建的元件

### 1. Edge Function `poll-and-dispatch`(Deno/TypeScript)

職責:被 pg_cron 定時叫起 → 查 Airtable 有沒有未同步 → 有就觸發 GitHub workflow。

邏輯:
1. `GET https://api.airtable.com/v0/{baseId}/{tableId}?filterByFormula=NOT({已同步})&maxRecords=1&fields[]=...`
   - base `app9qIBi0OyA9LM9I` / table `tbly6tnHFnzvXViZH`
   - 注意:用欄位**名稱**寫 filterByFormula(`已同步`),或改用 REST 不帶 filter、自己在程式判斷 `fields['已同步'] !== true`(與現有 `fetchUnsynced` 一致,較不怕改名)。
2. 若有未同步 → `POST https://api.github.com/repos/ddio/leak-log/actions/workflows/sync.yml/dispatches`,body `{"ref":"main"}`,header `Authorization: Bearer {PAT}`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`。
3. 沒有 → 直接結束(省掉一次 Actions 跑全套 build 的浪費)。

需要的環境變數(Supabase function secrets):
- `AIRTABLE_API_KEY`(讀)
- `GH_DISPATCH_PAT`(fine-grained PAT,限 `ddio/leak-log`、權限 **Actions: Read and write**)

> 註:`workflow_dispatch` 只在 default branch(main)生效——已符合。
> 去重不需要做在這層:`sync.yml` 自己會「撈未同步 → 沒變更就跳過 commit」,重複觸發頂多空跑一次。但仍建議只在「真的有未同步」時才 dispatch,避免每 1–2 分都跑全套 build。

### 2. Edge Function `line-webhook`(Deno/TypeScript)

職責:接 LINE platform 的 webhook event。主要用途是**一次性抓到 `groupId`**,之後可擴充指令。

邏輯:
1. 驗 `X-Line-Signature`(用 channel secret 做 HMAC-SHA256)。
2. 解析 events。當 `event.source.type === 'group'` 時,把 `event.source.groupId` 記下來(寫進 Supabase 一張表 `line_targets`,或先 `console.log` 撈 log 看)。
3. 回 200。

需要的環境變數:
- `LINE_CHANNEL_SECRET`(驗簽)
- `LINE_CHANNEL_ACCESS_TOKEN`(若要在 webhook 內回訊息;單純抓 groupId 可不用)
- Supabase service role(若寫 DB,Edge Function 內建可用)

LINE Developer Console 把 Webhook URL 設成此 function 的公開 URL,並開啟 "Use webhook"。

### 3. pg_cron 排程(Supabase SQL)

在 Supabase SQL editor 啟用 `pg_cron` + `pg_net`,排一條每 1–2 分鐘呼叫 `poll-and-dispatch` 的工作:

```sql
-- 啟用擴充(免費方案可用)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 每 2 分鐘打一次 Edge Function
select cron.schedule(
  'leaklog-poll',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/poll-and-dispatch',
    headers := '{"Authorization":"Bearer <anon-or-cron-secret>","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

> 把 `poll-and-dispatch` 設成需要一個共享密鑰(自訂 header)以免被人亂打;或用 Supabase 的 function JWT 驗證。

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
          LINE_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
          LINE_GROUP_ID: ${{ secrets.LINE_GROUP_ID }}
        run: node scripts/notify-line.mjs   # 讀 .sync-output.json → push 卡片
```

注意:Notify 放在 **deploy-pages 成功之後**,確保 `/r/{id}` 已上線、連結 unfurl 得出 OG 圖。

`scripts/notify-line.mjs` 做的事:
- 讀 `.sync-output.json`;空就 exit 0。
- 對最新一筆(或逐筆)組訊息,`POST https://api.line.me/v2/bot/message/push`,body `{ to: LINE_GROUP_ID, messages: [...] }`,header `Authorization: Bearer {LINE_TOKEN}`。
- 訊息可先用 text(標題 + `https://ddio.github.io/leak-log/r/{id}`),之後升級 Flex Message 帶縮圖。

---

## 需要的 Secrets / 設定總表

| 放哪 | 名稱 | 用途 |
|---|---|---|
| Supabase function | `AIRTABLE_API_KEY` | poll 讀 Airtable |
| Supabase function | `GH_DISPATCH_PAT` | 觸發 workflow_dispatch(fine-grained,限 repo、Actions RW) |
| Supabase function | `LINE_CHANNEL_SECRET` | line-webhook 驗簽 |
| Supabase function | `LINE_CHANNEL_ACCESS_TOKEN` | (選)webhook 內回訊息 |
| GitHub Secrets | `LINE_CHANNEL_ACCESS_TOKEN` | sync.yml 推群組 |
| GitHub Secrets | `LINE_GROUP_ID` | 推送目標群組 |

> **Drive 金鑰維持只在 GitHub Actions,不上 server。**

## 一次性手動設定(動工時要做)

1. LINE Developers 建 Messaging API channel;把 bot 加進目標群組。
2. 部署 `line-webhook`,在 console 設 Webhook URL + 開 "Use webhook";從群組發一則訊息 / 把 bot 拉進群,讓 webhook event 帶出 `groupId` → 記下來填 `LINE_GROUP_ID`。
3. 開 fine-grained GitHub PAT(限 `ddio/leak-log`、Actions: Read and write)。
4. Supabase 建專案、`supabase functions deploy` 兩個 function、設 function secrets、跑 pg_cron SQL。
5. (可選)保留 GitHub `schedule` cron 當 fallback——Supabase 掛掉時仍會慢慢同步。

## 已知限制 / 注意
- LINE 免費 push 約每月 200 則,本專案用量遠低於此。
- 群組 push 需 bot 仍在群內、未被封鎖。
- Supabase Edge Function 冷啟動有秒級延遲,對「每 2 分輪詢」無感。
- pg_net / pg_cron 屬非同步,失敗只進 Postgres log,需要時去 `cron.job_run_details` 查。
- workflow_dispatch 仍只能觸發 main 上的 workflow。

## 大致工序(動工順序建議)
1. `sync.ts` 輸出 `.sync-output.json` + `scripts/notify-line.mjs` + `sync.yml` 加 Notify step(可先用 `gh workflow run` 手動測,不依賴 Supabase)。
2. LINE channel + groupId 抓取(`line-webhook` function)。
3. `poll-and-dispatch` function + PAT。
4. pg_cron 排程接上,end-to-end 驗證。
5. 視情況把 GitHub `schedule` 間隔拉長或保留當 fallback。
