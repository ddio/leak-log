/**
 * 網頁的資料來源：build 時直接 import content/entries.json（pipeline 產生、commit 進 repo）。
 * 也提供資源路徑工具（補上 baseURL / 站台絕對網址）。
 */
import entriesData from '~~/content/entries.json'

export interface ProcessedPhoto {
  web: string
  thumb: string
}

export interface Entry {
  id: string
  eventTimestamp: string
  uploadDate: string
  title: string
  description: string
  keyEvents: string[]
  photos: ProcessedPhoto[]
  timestampSource: 'exif-median' | 'manual'
}

const entries = entriesData as Entry[]

/** 全部紀錄（已依事件時間新到舊排序） */
export function useEntries(): Entry[] {
  return entries
}

/** 單筆，找不到回 undefined */
export function useEntry(id: string): Entry | undefined {
  return entries.find((e) => e.id === id)
}

/** 站台內資源路徑（補 baseURL），給 <img src> 用 */
export function useAssetUrl(path: string): string {
  const base = useRuntimeConfig().app.baseURL
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}

/** 完整絕對網址，給 OG image / 分享連結用 */
export function useAbsoluteUrl(path: string): string {
  const site = useRuntimeConfig().public.siteUrl
  return site.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}
