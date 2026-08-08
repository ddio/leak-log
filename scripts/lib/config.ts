/**
 * 共用設定：環境變數讀取、Airtable 欄位 ID、站台常數、檔案路徑。
 * 所有 pipeline 模組都從這裡取設定，避免散落各處。
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** repo 根目錄（scripts/lib/ 往上兩層） */
export const ROOT = resolve(__dirname, '..', '..');

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`缺少環境變數 ${name}（請在 .env 或 GitHub Secrets 設定）`);
  }
  return v.trim();
}

export function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

/** 全程時區 UTC+8 */
export const TZ = 'Asia/Taipei';

/** Airtable Entries 表的欄位 ID（一律用 ID，不靠名稱，改名也不會壞） */
export const FIELDS = {
  title: 'fldevVSIdPz1Y1V1o',
  /** UI 上叫「照片」，實際上照片與影片混放，pipeline 依 mime type 分流 */
  attachments: 'fldsKwd7lr7NSUj9L',
  description: 'flda2dESNJdbeI8OC',
  manualTimestamp: 'fldFeqSVCgk8mzVa8',
  keyEvents: 'fldoV7r26lgdfZezh',
  synced: 'fld03aEdvWRnk8nVd',
  syncError: 'fldTfRt3f1jzfmY5I',
} as const;

/**
 * 站台網址。GitHub Pages 專案站：https://ddio.github.io/leak-log/
 * - BASE_PATH：Nuxt app.baseURL，頁面內資源前綴
 * - SITE_URL：完整站台網址，OG image / 分享連結要用絕對網址
 * 兩者皆可用 env 覆寫（之後若綁自訂網域）。
 */
export const SITE_ORIGIN = optionalEnv('SITE_ORIGIN', 'https://ddio.github.io');
export const BASE_PATH = optionalEnv('SITE_BASE_PATH', '/leak-log/');
export const SITE_URL = SITE_ORIGIN.replace(/\/$/, '') + BASE_PATH;

/** 檔案路徑 */
export const CONTENT_DIR = resolve(ROOT, 'content');
export const ENTRIES_JSON = resolve(CONTENT_DIR, 'entries.json');
/** 處理後的圖片放 public/img，Nuxt 會把 public/ 當站台根目錄 */
export const PUBLIC_DIR = resolve(ROOT, 'public');
export const IMG_DIR = resolve(PUBLIC_DIR, 'img');
