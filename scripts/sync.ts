/**
 * Pipeline 主流程（GitHub Actions / 本機皆可跑：npm run sync）。
 * 撈未同步 record → 逐筆 [下載→分流照片/影片→解析時間→處理媒體→Drive 同步→更新 entries.json]
 * → 成功回寫 已同步=true、失敗寫 同步錯誤。缺時間的視為可修正、跳過不算硬失敗。
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DateTime } from 'luxon';
import { fetchUnsynced, markSynced, markError } from './lib/airtable.ts';
import { downloadAttachments } from './lib/download.ts';
import { resolveTimestamp } from './lib/exif.ts';
import { isImage, isVideo, clearRecordMedia } from './lib/media.ts';
import { processPhotos } from './lib/images.ts';
import { loadVideos, transcodeVideos, cleanupVideos, type VideoSource } from './lib/videos.ts';
import { syncRecordToDrive } from './lib/drive.ts';
import { loadEntries, buildEntry, upsertEntry, saveEntries } from './lib/entries.ts';
import { ROOT } from './lib/config.ts';
import type { DownloadedFile } from './lib/download.ts';

/**
 * 本輪「實際新同步成功」的紀錄，寫到 repo 根 .sync-output.json，給 workflow 的
 * Notify LINE step 讀（比在 workflow 端猜 entries[0] 精準，避免重編舊紀錄被誤播）。
 * 不需 commit，已列入 .gitignore；只在 step 之間傳遞。
 */
const SYNC_OUTPUT = resolve(ROOT, '.sync-output.json');
interface SyncedItem {
  id: string;
  title: string;
  eventTimestamp: string;
}

const NO_TIME_MSG =
  '無法決定事件時間：照片沒有可用的 EXIF 拍攝時間、影片也讀不到拍攝時間' +
  '（或多個檔案時間差超過 2 小時），且未填「手動事件時間」。' +
  '請補填手動時間後，取消「已同步」勾選以重新處理。';

/** 依 mime type 把附件分成照片與影片，序號用附件原始順序（1-based） */
function splitAttachments(files: DownloadedFile[]): {
  images: { file: DownloadedFile; seq: number }[];
  videos: { file: DownloadedFile; seq: number }[];
} {
  const images: { file: DownloadedFile; seq: number }[] = [];
  const videos: { file: DownloadedFile; seq: number }[] = [];
  files.forEach((file, i) => {
    const seq = i + 1;
    if (isImage(file.type)) images.push({ file, seq });
    else if (isVideo(file.type)) videos.push({ file, seq });
    else console.warn(`  ↳ 略過不支援的附件 ${file.filename} (${file.type})`);
  });
  return { images, videos };
}

async function main(): Promise<void> {
  const records = await fetchUnsynced();
  console.log(`撈到 ${records.length} 筆未同步 record`);
  if (records.length === 0) return;

  let entries = await loadEntries();
  const synced: SyncedItem[] = [];
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of records) {
    const label = `${r.recordId} ${r.title || '(無標題)'}`;
    let videoSources: VideoSource[] = [];
    try {
      const dl = await downloadAttachments(r.attachments);
      const { images, videos } = splitAttachments(dl);

      // 影片先落地 + 讀 metadata 時間，但還不轉檔 —— 缺事件時間的紀錄要能直接跳過，
      // 不該白花好幾分鐘轉檔。
      videoSources = await loadVideos(videos);
      const ts = await resolveTimestamp(
        images.map((i) => i.file.buffer),
        r.manualTimestamp,
        videoSources.map((v) => v.createdAt).filter((t): t is DateTime => t !== null),
      );

      if (!ts) {
        await markError(r.recordId, NO_TIME_MSG);
        console.warn(`⚠ 跳過 ${label} — 缺事件時間`);
        skipped++;
        continue;
      }

      // 先清乾淨再產，重新同步時才不會留下上一版的殘檔（照片與影片共用同一個目錄）
      await clearRecordMedia(r.recordId);
      const photoMedia = await processPhotos(r.recordId, images);
      const videoMedia = await transcodeVideos(r.recordId, videoSources);
      const media = [...photoMedia, ...videoMedia].sort((a, b) => a.seq - b.seq);

      await syncRecordToDrive(r, dl, ts);
      entries = upsertEntry(entries, buildEntry(r, ts, media));
      await saveEntries(entries); // 每筆即存，中途失敗也不丟已完成的
      await markSynced(r.recordId);

      synced.push({ id: r.recordId, title: r.title, eventTimestamp: ts.iso });
      console.log(
        `✓ ${label} — ${photoMedia.length} 圖 / ${videoMedia.length} 影片, ` +
          `事件時間 ${ts.iso} (${ts.source})`,
      );
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
    } finally {
      await cleanupVideos(videoSources);
    }
  }

  // 本輪新同步清單寫檔（依事件時間新→舊，notify 取最新一筆當主角）。
  synced.sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp));
  await writeFile(SYNC_OUTPUT, JSON.stringify(synced, null, 2));

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
