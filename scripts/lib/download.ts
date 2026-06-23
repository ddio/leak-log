/**
 * 下載 Airtable 附件原圖。
 * 注意：Airtable 附件 URL 數小時就失效，所以 pipeline 一開始就要立刻抓下來。
 * 保留陣列順序（= 附件順序，第一張當封面 / OG 顯圖）。
 */
import type { AirtablePhoto } from './types.ts';

export interface DownloadedPhoto {
  filename: string;
  type: string;
  buffer: Buffer;
}

export async function downloadPhotos(photos: AirtablePhoto[]): Promise<DownloadedPhoto[]> {
  const out: DownloadedPhoto[] = [];
  for (const p of photos) {
    const res = await fetch(p.url);
    if (!res.ok) {
      throw new Error(`下載照片失敗 ${p.filename} (${res.status})`);
    }
    out.push({
      filename: p.filename,
      type: p.type,
      buffer: Buffer.from(await res.arrayBuffer()),
    });
  }
  return out;
}
