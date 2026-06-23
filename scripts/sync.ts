/**
 * Pipeline 主流程（GitHub Actions / 本機皆可跑：npm run sync）。
 * 撈未同步 record → 逐筆 [下載→解析時間→處理圖→Drive 同步→更新 entries.json]
 * → 成功回寫 已同步=true、失敗寫 同步錯誤。缺時間的視為可修正、跳過不算硬失敗。
 */
import { fetchUnsynced, markSynced, markError } from './lib/airtable.ts';
import { downloadPhotos } from './lib/download.ts';
import { resolveTimestamp } from './lib/exif.ts';
import { processPhotos } from './lib/images.ts';
import { syncRecordToDrive } from './lib/drive.ts';
import { loadEntries, buildEntry, upsertEntry, saveEntries } from './lib/entries.ts';

const NO_TIME_MSG =
  '無法決定事件時間：照片沒有可用的 EXIF 拍攝時間（或多張時間差超過 2 小時），' +
  '且未填「手動事件時間」。請補填手動時間後，取消「已同步」勾選以重新處理。';

async function main(): Promise<void> {
  const records = await fetchUnsynced();
  console.log(`撈到 ${records.length} 筆未同步 record`);
  if (records.length === 0) return;

  let entries = await loadEntries();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of records) {
    const label = `${r.recordId} ${r.title || '(無標題)'}`;
    try {
      const dl = await downloadPhotos(r.photos);
      const ts = await resolveTimestamp(dl.map((d) => d.buffer), r.manualTimestamp);

      if (!ts) {
        await markError(r.recordId, NO_TIME_MSG);
        console.warn(`⚠ 跳過 ${label} — 缺事件時間`);
        skipped++;
        continue;
      }

      const photos = await processPhotos(r.recordId, dl);
      await syncRecordToDrive(r, dl, ts);
      entries = upsertEntry(entries, buildEntry(r, ts, photos));
      await saveEntries(entries); // 每筆即存，中途失敗也不丟已完成的
      await markSynced(r.recordId);

      console.log(`✓ ${label} — ${dl.length} 圖, 事件時間 ${ts.iso} (${ts.source})`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await markError(r.recordId, `同步失敗: ${msg}`);
      } catch {
        /* 回寫失敗就算了，下次會再撈到 */
      }
      console.error(`✗ ${label} — ${msg}`);
      failed++;
    }
  }

  console.log(`\n完成：成功 ${ok}、跳過(缺時間) ${skipped}、失敗 ${failed}`);
  // 單筆失敗/缺時間不讓整個 job 失敗——否則後續 commit/deploy 會被略過，
  // 導致本輪已標記「已同步」的成功資料永遠不會 commit。失敗已寫進 Airtable
  // 同步錯誤欄、也印在 log；未同步的下輪 cron 會自動重試。
  // 只有系統性錯誤（fetchUnsynced 失敗等）會在 main().catch 讓 CI 失敗。
}

main().catch((e) => {
  console.error('致命錯誤:', e);
  process.exit(1);
});
