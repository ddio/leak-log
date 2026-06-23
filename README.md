# leak-log · 漏水紀錄

長期、多人協作的住處漏水點觀察紀錄。協作者透過 Airtable 表單上傳照片與文字，
經 CI/CD 自動產出靜態網站，並把原始照片與文字備份到 Google Drive。

**網站：** <https://ddio.github.io/leak-log/>

## 運作架構

```
Airtable 表單投稿
      │
      ▼
GitHub Actions（每 15 分鐘 cron 輪詢 + 手動觸發）
      │  scripts/sync.ts
      ├─ 撈「已同步」未勾的 record，下載原圖
      ├─ 由 EXIF 解析事件時間（多張取中位數，否則用手動時間）
      ├─ 去除 GPS、壓成 web(≤2048px) + thumb，寫進 public/img/
      ├─ 原圖 + 純文字 .txt 同步到 Google Drive（每日一資料夾）
      ├─ 更新 content/entries.json，回寫 Airtable「已同步」
      ▼
nuxt generate → 部署 GitHub Pages
```

時間全程以 UTC+8 計。後端不主動推送（Airtable 免費方案無法），改由 cron 拉取；
所以投稿後最多約 15 分鐘上線。

## 網站三個畫面

| 路由 | 說明 |
|---|---|
| `/` | 時間軸首頁，依日分組、倒序，關鍵事件 vs 例行紀錄 |
| `/r/{recordId}` | 單則分享頁，含 OG 卡，方便貼到 IM |
| `/view` | 照片檢視 Lightbox，全站照片連續瀏覽 + 鍵盤導覽（`?r=&p=` 帶入起點） |

## 技術棧

- **網站**：Nuxt 3（static generate）→ GitHub Pages
- **Pipeline**：TypeScript（tsx 直跑）、sharp（壓圖/去 EXIF）、exifr（讀 EXIF）、luxon（時區）、googleapis（Drive）
- **資料來源**：Airtable（表單 + REST API）
- **備份**：Google Drive（個人帳號 OAuth refresh token）
- **CI/CD**：GitHub Actions（`.github/workflows/sync.yml`）

## 專案結構

```
scripts/
  sync.ts            # pipeline 主流程（npm run sync）
  test-drive.ts      # 一次性 Drive 連線測試
  lib/               # airtable / download / exif / images / drive / entries / config / types
content/entries.json # 產出的網站資料（自包含存檔）
public/img/          # 處理後的 web/thumb 圖片
pages/               # index(時間軸) / r/[id](分享頁) / view(Lightbox)
components/          # SiteFooter 等
composables/ utils/  # 資料 helper 與格式化
```

## 本機開發

```bash
npm install
cp .env.example .env   # 填入金鑰（見下）

npm run sync           # 從 Airtable 同步到 Drive + entries.json + 圖片
npm run dev            # 本機預覽網站
npm run generate       # 產出靜態檔到 .output/public
npm run test:drive     # 驗證 Google Drive 連線
```

### 環境變數

機密值放本機 `.env` 或 GitHub Actions Secrets；base/table/folder ID 非機密。

| 變數 | 說明 |
|---|---|
| `AIRTABLE_API_KEY` | Airtable PAT（機密） |
| `AIRTABLE_BASE_ID` / `AIRTABLE_TABLE_ID` | 目標 base / table |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` / `GDRIVE_REFRESH_TOKEN` | Google OAuth（機密） |
| `GDRIVE_ROOT_FOLDER_ID` | Drive 根資料夾 |

> OAuth 同意畫面須設為 Production，否則 refresh token 7 天過期。

## 隱私

- 上線照片一律**移除 GPS 等 EXIF**，並壓到長邊 ≤ 2048px。
- 原始檔（含 EXIF）只存在私人的 Google Drive，不上公開站。

## 授權

- **程式碼**：MIT License（見 [`LICENSE`](./LICENSE)）
- **內容資料**（紀錄文字、照片等）：CC BY-SA 4.0（見 [`DATA-LICENSE.md`](./DATA-LICENSE.md)）
