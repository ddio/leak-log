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

/** 依「事件日期」分組（list 須已倒序；同日連續所以掃一遍即可） */
export interface DayGroup {
  key: string
  monthDay: string
  weekday: string
  entries: Entry[]
}
export function groupByDay(list: Entry[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const e of list) {
    const key = dateKey(e.eventTimestamp)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.entries.push(e)
    } else {
      groups.push({
        key,
        monthDay: formatMonthDay(e.eventTimestamp),
        weekday: formatWeekday(e.eventTimestamp),
        entries: [e],
      })
    }
  }
  return groups
}

/** header 用統計：總則數、追蹤天數（首筆到末筆事件日跨度）、最後更新 */
export function useStats(list: Entry[]): { total: number; trackedDays: number; lastUpdated: string | null } {
  if (list.length === 0) return { total: 0, trackedDays: 0, lastUpdated: null }
  const times = list.map((e) => new Date(e.eventTimestamp).getTime())
  const span = Math.max(...times) - Math.min(...times)
  return {
    total: list.length,
    trackedDays: Math.round(span / 86400000) + 1,
    lastUpdated: list[0].eventTimestamp, // list 倒序，第一筆最新
  }
}

/** 把全站照片依紀錄倒序攤平成一維（無照片的紀錄不進入） */
export interface FlatPhoto {
  globalIndex: number
  entry: Entry
  photoIndex: number
  web: string
  thumb: string
}
export function flattenPhotos(list: Entry[]): FlatPhoto[] {
  const out: FlatPhoto[] = []
  for (const e of list) {
    for (let i = 0; i < e.photos.length; i++) {
      out.push({ globalIndex: out.length, entry: e, photoIndex: i, web: e.photos[i].web, thumb: e.photos[i].thumb })
    }
  }
  return out
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
