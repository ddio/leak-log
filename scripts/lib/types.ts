/**
 * Pipeline 共用型別。
 * 流程：AirtableRecord → (下載+解析+處理) → Entry（寫進 content/entries.json，給網頁用）
 */

/** Airtable 附件（照片） */
export interface AirtablePhoto {
  id: string;
  url: string;
  filename: string;
  /** mime type，例 image/jpeg */
  type: string;
}

/** 從 Airtable 撈出、待處理的一筆投稿 */
export interface AirtableRecord {
  recordId: string;
  title: string;
  description: string;
  /** 手動事件時間 fallback，ISO 字串或 null */
  manualTimestamp: string | null;
  keyEvents: string[];
  photos: AirtablePhoto[];
  /** Airtable createdTime = 上傳時間 */
  createdTime: string;
}

/** 事件時間的來源 */
export type TimestampSource = 'exif-median' | 'manual';

/** 時間解析結果 */
export interface ResolvedTimestamp {
  /** ISO 字串，帶 +08:00 */
  iso: string;
  source: TimestampSource;
}

/** 處理後的單張照片，路徑相對站台根（不含 baseURL，前綴由網頁/OG 邏輯補上） */
export interface ProcessedPhoto {
  /** 例 img/recABC/web/01.jpg（長邊≤2048） */
  web: string;
  /** 例 img/recABC/thumb/01.jpg（長邊~600） */
  thumb: string;
}

/** 寫進 content/entries.json 的一筆，網頁直接消費 */
export interface Entry {
  /** Airtable record id，當永久連結 slug */
  id: string;
  /** 事件時間 ISO +08:00，時間軸排序依據 */
  eventTimestamp: string;
  /** 上傳時間 ISO */
  uploadDate: string;
  title: string;
  /** 純文字描述，保留換行 */
  description: string;
  keyEvents: string[];
  photos: ProcessedPhoto[];
  timestampSource: TimestampSource;
}
