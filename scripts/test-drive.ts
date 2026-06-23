/**
 * 一次性測試：用 OAuth refresh token 驗證能否寫入指定的 Google Drive 資料夾。
 * 流程：讀 .env → 用 token 取得 access token → 讀根資料夾名稱 → 上傳 test.txt → 刪除。
 * 全部成功 = token + scope + 資料夾權限整條鏈都通。
 *
 * 執行：npm run test:drive
 */
import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'node:stream';

function need(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ 缺少環境變數 ${name}（請在 .env 填好）`);
    process.exit(1);
  }
  return v.trim();
}

const CLIENT_ID = need('GDRIVE_CLIENT_ID');
const CLIENT_SECRET = need('GDRIVE_CLIENT_SECRET');
const REFRESH_TOKEN = need('GDRIVE_REFRESH_TOKEN');
const ROOT_FOLDER_ID = need('GDRIVE_ROOT_FOLDER_ID');

async function main() {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });

  // 1) 確認 token 能換到 access token
  console.log('① 用 refresh token 換 access token …');
  try {
    await auth.getAccessToken();
    console.log('   ✅ token 有效');
  } catch (e: any) {
    console.error('   ❌ 換 token 失敗 — 通常是 client id/secret/refresh token 不符，或 OAuth app 還在 Testing（token 已 7 天過期）。');
    console.error('   原始錯誤：', e?.response?.data ?? e?.message ?? e);
    process.exit(1);
  }

  const drive = google.drive({ version: 'v3', auth });

  // 2) 讀根資料夾，確認 ID 正確且有讀取權限（順便印出名稱讓你核對）
  console.log('② 讀取根資料夾 metadata …');
  let folderName = '(未知)';
  try {
    const meta = await drive.files.get({
      fileId: ROOT_FOLDER_ID,
      fields: 'id, name, mimeType, owners(emailAddress)',
      supportsAllDrives: true,
    });
    folderName = meta.data.name ?? '(無名稱)';
    const owner = meta.data.owners?.[0]?.emailAddress ?? '(未知)';
    console.log(`   ✅ 資料夾名稱：「${folderName}」 owner：${owner}`);
    if (meta.data.mimeType !== 'application/vnd.google-apps.folder') {
      console.warn('   ⚠️ 這個 ID 不是資料夾，請確認 GDRIVE_ROOT_FOLDER_ID。');
    }
  } catch (e: any) {
    console.error('   ❌ 讀不到這個資料夾 — ID 錯，或這顆 token 的帳號對該資料夾沒有權限。');
    console.error('   原始錯誤：', e?.response?.data ?? e?.message ?? e);
    process.exit(1);
  }

  // 3) 上傳一個測試檔到該資料夾
  console.log('③ 上傳 test.txt 到資料夾 …');
  let fileId: string;
  try {
    const res = await drive.files.create({
      requestBody: {
        name: `leak-log-write-test-${process.pid}.txt`,
        parents: [ROOT_FOLDER_ID],
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(['leak-log write test — 可安全刪除']),
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });
    fileId = res.data.id!;
    console.log(`   ✅ 上傳成功 id=${fileId}`);
    console.log(`   連結：${res.data.webViewLink ?? '(無)'}`);
  } catch (e: any) {
    console.error('   ❌ 上傳失敗 — 若是 quota 錯誤，代表用的是 service account（個人 OAuth 不會有此問題）；若是權限錯誤，代表 token 帳號對資料夾無寫入權。');
    console.error('   原始錯誤：', e?.response?.data ?? e?.message ?? e);
    process.exit(1);
  }

  // 4) 刪掉測試檔，保持資料夾乾淨
  console.log('④ 刪除測試檔 …');
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    console.log('   ✅ 已刪除');
  } catch (e: any) {
    console.warn(`   ⚠️ 刪除失敗，請手動到資料夾刪掉測試檔 id=${fileId}`);
    console.warn('   原始錯誤：', e?.response?.data ?? e?.message ?? e);
  }

  console.log(`\n🎉 全部通過：token / scope / 資料夾「${folderName}」寫入權限都正常，pipeline 可以放心用這組設定。`);
}

main().catch((e) => {
  console.error('未預期錯誤：', e);
  process.exit(1);
});
