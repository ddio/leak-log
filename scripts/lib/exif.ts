/**
 * 事件時間解析。
 * 規則（全程 UTC+8）：
 *   1. 讀各圖 EXIF DateTimeOriginal（EXIF 無時區，一律視為 UTC+8）
 *   2. 有 ≥1 個 EXIF 且最大-最小 < 2hr → 取中位數
 *   3. 否則（無 EXIF / 跨度 ≥2hr / 0 張圖）→ 用手動事件時間
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
): Promise<ResolvedTimestamp | null> {
  const exifTimes: number[] = [];
  for (const b of buffers) {
    const t = await readExifTime(b);
    if (t) exifTimes.push(t.toMillis());
  }

  if (exifTimes.length > 0) {
    exifTimes.sort((a, b) => a - b);
    const spread = exifTimes[exifTimes.length - 1] - exifTimes[0];
    if (spread < TWO_HOURS_MS) {
      const iso = DateTime.fromMillis(median(exifTimes), { zone: TZ }).toISO();
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
