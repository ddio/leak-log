/**
 * 事件時間解析。
 * 規則（全程 UTC+8）：
 *   1. 讀各圖 EXIF DateTimeOriginal（EXIF 無時區，一律視為 UTC+8），
 *      影片的拍攝時間由呼叫端從 mp4 metadata 讀好後一起傳進來（已帶時區）
 *   2. 有 ≥1 個拍攝時間且最大-最小 < 2hr → 取中位數
 *   3. 否則（都讀不到 / 跨度 ≥2hr / 沒有任何附件）→ 用手動事件時間
 *   4. 兩者皆無 → 回 null（orchestrator 標記同步錯誤、跳過）
 */
import exifr from 'exifr';
import { DateTime } from 'luxon';
import { TZ } from './config.ts';
import type { ResolvedTimestamp } from './types.ts';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** 讀單張 EXIF 拍攝時間，視為 UTC+8。讀不到回 null */
async function readExifTime(buffer: Buffer): Promise<DateTime | null> {
  try {
    // reviveValues:false → 回原始字串 'YYYY:MM:DD HH:MM:SS'，自己用 UTC+8 解讀，
    // 不依賴 exifr/Node 的本機時區，行為可預測。
    const out = (await exifr.parse(buffer, {
      reviveValues: false,
      pick: ['DateTimeOriginal', 'CreateDate'],
    })) as Record<string, string> | undefined;
    const raw = out?.DateTimeOriginal ?? out?.CreateDate;
    if (!raw) return null;
    const dt = DateTime.fromFormat(raw.trim(), 'yyyy:MM:dd HH:mm:ss', { zone: TZ });
    return dt.isValid ? dt : null;
  } catch {
    return null;
  }
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function resolveTimestamp(
  buffers: Buffer[],
  manualTimestamp: string | null,
  videoTimes: DateTime[] = [],
): Promise<ResolvedTimestamp | null> {
  // 照片與影片的拍攝時間混在同一組取中位數。兩邊都轉成絕對毫秒才比較：
  // EXIF 視為 UTC+8、mp4 creation_time 本來就是 UTC，換算後可以直接混用。
  const shotTimes: number[] = videoTimes.map((t) => t.toMillis());
  for (const b of buffers) {
    const t = await readExifTime(b);
    if (t) shotTimes.push(t.toMillis());
  }

  if (shotTimes.length > 0) {
    shotTimes.sort((a, b) => a - b);
    const spread = shotTimes[shotTimes.length - 1] - shotTimes[0];
    if (spread < TWO_HOURS_MS) {
      const iso = DateTime.fromMillis(median(shotTimes), { zone: TZ }).toISO();
      if (iso) return { iso, source: 'exif-median' };
    }
    // 跨度 ≥2hr → 不自動猜，落到手動
  }

  if (manualTimestamp) {
    const dt = DateTime.fromISO(manualTimestamp).setZone(TZ);
    const iso = dt.toISO();
    if (dt.isValid && iso) return { iso, source: 'manual' };
  }

  return null;
}
