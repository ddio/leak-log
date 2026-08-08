/**
 * 下載 Airtable 附件原檔（照片與影片）。
 * 注意：Airtable 附件 URL 數小時就失效，所以 pipeline 一開始就要立刻抓下來。
 * 保留陣列順序（= 附件順序 = seq 來源，第一張照片當封面 / OG 顯圖）。
 */
import type { AirtableAttachment } from './types.ts';

export interface DownloadedFile {
  filename: string;
  type: string;
  buffer: Buffer;
}

export async function downloadAttachments(
  attachments: AirtableAttachment[],
): Promise<DownloadedFile[]> {
  const out: DownloadedFile[] = [];
  for (const a of attachments) {
    const res = await fetch(a.url);
    if (!res.ok) {
      throw new Error(`下載附件失敗 ${a.filename} (${res.status})`);
    }
    out.push({
      filename: a.filename,
      type: a.type,
      buffer: Buffer.from(await res.arrayBuffer()),
    });
  }
  return out;
}
