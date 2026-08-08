/**
 * Pipeline 共用型別。
 * 流程：AirtableRecord → (下載+解析+處理) → Entry（寫進 content/entries.json，給網頁用）
 */

/** Airtable 附件。照片與影片混放在同一個「照片」欄位，靠 mime type 分流 */
export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  /** mime type，例 image/jpeg、video/mp4 */
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
  /** 保留 Airtable 上的附件順序 —— 序號、Drive 檔名、網頁排序都靠它 */
  attachments: AirtableAttachment[];
  /** Airtable createdTime = 上傳時間 */
  createdTime: string;
}

/**
 * 事件時間的來源。
 * 'exif-median' 是沿用的舊名，實際語意是「拍攝時間中位數」：
 * 照片取 EXIF DateTimeOriginal、影片取 mp4 creation_time，兩者混在同一組取中位數。
 * 不改字串是為了不動已存檔的 entries.json。
 */
export type TimestampSource = 'exif-median' | 'manual';

/** 時間解析結果 */
export interface ResolvedTimestamp {
  /** ISO 字串，帶 +08:00 */
  iso: string;
  source: TimestampSource;
}

/**
 * seq = 該附件在 record 內的 1-based 序號，照片與影片共用同一個計數器。
 * 因此和 Drive 上的檔名編號一致，網頁顯示的「檔名」也直接由它產生。
 */
export interface PhotoMedia {
  kind: 'photo';
  seq: number;
  /** 例 img/recABC/web/01.jpg（長邊≤2048） */
  web: string;
  /** 例 img/recABC/thumb/01.jpg（長邊~600） */
  thumb: string;
}

/** 影片的網頁副本：720p H.264，metadata 全清（含可能的 GPS） */
export interface VideoMedia {
  kind: 'video';
  seq: number;
  /** 例 img/recABC/video/03.mp4 */
  src: string;
  /** 封面幀，例 img/recABC/video/03.jpg（長邊~600） */
  poster: string;
  /** 長度（秒，取到小數一位） */
  duration: number;
  /** 轉檔後的實際尺寸 */
  width: number;
  height: number;
}

/** 處理後的單一媒體，路徑相對站台根（不含 baseURL，前綴由網頁/OG 邏輯補上） */
export type MediaItem = PhotoMedia | VideoMedia;

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
  /** 照片與影片混合，依 seq 排序（= Airtable 附件順序） */
  media: MediaItem[];
  timestampSource: TimestampSource;
}
