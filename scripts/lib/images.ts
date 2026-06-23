/**
 * 圖片處理（github 上的網頁副本）。
 * 先依 EXIF orientation 轉正，再輸出 JPEG —— 不呼叫 withMetadata() 即清掉全部
 * metadata（含 GPS）。每張產 web(長邊≤2048) 與 thumb(長邊~600) 兩個尺寸。
 * 原圖不經這裡處理（保留 EXIF 進 Drive 當存檔）。
 */
import sharp from 'sharp';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IMG_DIR } from './config.ts';
import type { DownloadedPhoto } from './download.ts';
import type { ProcessedPhoto } from './types.ts';

const WEB_MAX = 2048;
const THUMB_MAX = 600;
const QUALITY = 80;

const seq = (i: number): string => String(i + 1).padStart(2, '0');

/**
 * 處理一筆 record 的所有照片，輸出到 public/img/{recordId}/{web,thumb}/NN.jpg。
 * 會先清掉該 record 既有的圖片資料夾，支援重新同步覆寫（含照片數變少的情況）。
 * 回傳相對站台根的路徑（不含 baseURL）。
 */
export async function processPhotos(
  recordId: string,
  photos: DownloadedPhoto[],
): Promise<ProcessedPhoto[]> {
  const recDir = join(IMG_DIR, recordId);
  await rm(recDir, { recursive: true, force: true });
  if (photos.length === 0) return [];

  const webDir = join(recDir, 'web');
  const thumbDir = join(recDir, 'thumb');
  await mkdir(webDir, { recursive: true });
  await mkdir(thumbDir, { recursive: true });

  const out: ProcessedPhoto[] = [];
  for (let i = 0; i < photos.length; i++) {
    const n = seq(i);
    const base = sharp(photos[i].buffer).rotate(); // 轉正；之後不帶 metadata = 去 GPS

    await base
      .clone()
      .resize(WEB_MAX, WEB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(join(webDir, `${n}.jpg`));

    await base
      .clone()
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(join(thumbDir, `${n}.jpg`));

    out.push({
      web: `img/${recordId}/web/${n}.jpg`,
      thumb: `img/${recordId}/thumb/${n}.jpg`,
    });
  }
  return out;
}
