/**
 * 圖片處理（github 上的網頁副本）。
 * 先依 EXIF orientation 轉正，再輸出 JPEG —— 不呼叫 withMetadata() 即清掉全部
 * metadata（含 GPS）。每張產 web(長邊≤2048) 與 thumb(長邊~600) 兩個尺寸。
 * 原圖不經這裡處理（保留 EXIF 進 Drive 當存檔）。
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { IMG_DIR } from './config.ts';
import { seqPad } from './media.ts';
import type { DownloadedFile } from './download.ts';
import type { PhotoMedia } from './types.ts';

const WEB_MAX = 2048;
const THUMB_MAX = 600;
const QUALITY = 80;

/**
 * 處理一筆 record 的所有照片，輸出到 public/img/{recordId}/{web,thumb}/NN.jpg。
 * NN 是該附件在 record 內的序號，與影片共用同一個計數器（所以可能不連號，
 * 例如照片、影片、照片 → 01.jpg、02.mp4、03.jpg）。
 * 呼叫前必須先 clearRecordMedia()。回傳相對站台根的路徑（不含 baseURL）。
 */
export async function processPhotos(
  recordId: string,
  items: { file: DownloadedFile; seq: number }[],
): Promise<PhotoMedia[]> {
  if (items.length === 0) return [];

  const recDir = join(IMG_DIR, recordId);
  const webDir = join(recDir, 'web');
  const thumbDir = join(recDir, 'thumb');
  await mkdir(webDir, { recursive: true });
  await mkdir(thumbDir, { recursive: true });

  const out: PhotoMedia[] = [];
  for (const { file, seq } of items) {
    const n = seqPad(seq);
    const base = sharp(file.buffer).rotate(); // 轉正；之後不帶 metadata = 去 GPS

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
      kind: 'photo',
      seq,
      web: `img/${recordId}/web/${n}.jpg`,
      thumb: `img/${recordId}/thumb/${n}.jpg`,
    });
  }
  return out;
}
