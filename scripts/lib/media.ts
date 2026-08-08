/**
 * 媒體共用小工具：附件分類、序號補零、record 輸出目錄清理。
 * images.ts（照片）與 videos.ts（影片）都要用，抽出來避免互相 import。
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IMG_DIR } from './config.ts';

export const isImage = (type: string): boolean => type.startsWith('image/');
export const isVideo = (type: string): boolean => type.startsWith('video/');

/** 1-based 序號補零：1 → '01' */
export const seqPad = (seq: number): string => String(seq).padStart(2, '0');

/**
 * 清掉某筆 record 既有的輸出（web/thumb/video 一起）。
 * 重新同步時先清再產，才能正確處理「附件變少」的情況。
 * 注意：一定要在產出任何檔案之前呼叫一次，不能讓 images/videos 各自清。
 */
export async function clearRecordMedia(recordId: string): Promise<void> {
  await rm(join(IMG_DIR, recordId), { recursive: true, force: true });
}
