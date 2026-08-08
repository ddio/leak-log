/**
 * 網頁的資料來源：build 時直接 import content/entries.json（pipeline 產生、commit 進 repo）。
 * 也提供資源路徑工具（補上 baseURL / 站台絕對網址）。
 */
import entriesData from '~~/content/entries.json'

export interface PhotoMedia {
  kind: 'photo'
  /** 附件在該則內的 1-based 序號，照片與影片共用同一個計數器 */
  seq: number
  web: string
  thumb: string
}

export interface VideoMedia {
  kind: 'video'
  seq: number
  src: string
  /** 封面幀大圖，給 <video poster> 用（與影片同尺寸） */
  poster: string
  /** 封面幀縮圖，給時間軸/格狀清單用 */
  thumb: string
  /** 秒 */
  duration: number
  width: number
  height: number
}

export type MediaItem = PhotoMedia | VideoMedia

export interface Entry {
  id: string
  eventTimestamp: string
  uploadDate: string
  title: string
  description: string
  keyEvents: string[]
  /** 照片與影片混合，依 seq 排序（= 投稿時的附件順序） */
  media: MediaItem[]
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

export const isPhoto = (m: MediaItem): m is PhotoMedia => m.kind === 'photo'
export const isVideo = (m: MediaItem): m is VideoMedia => m.kind === 'video'

/** 縮圖：照片與影片都有長邊 600 的 thumb，可以直接混排 */
export const mediaThumb = (m: MediaItem): string => m.thumb

/** 顯示用檔名：03.jpg / 03.mp4 */
export const mediaName = (m: MediaItem): string =>
  seqName(m.seq - 1, isPhoto(m) ? '.jpg' : '.mp4')

/**
 * 代表圖（OG 卡、分享頁 hero）。
 * OG 只吃圖片，所以優先挑第一張照片；純影片的紀錄退而用第一支影片的 poster。
 */
export function coverMedia(e: Entry): MediaItem | undefined {
  return e.media.find(isPhoto) ?? e.media[0]
}

/** 代表圖的大圖路徑（照片用 web、影片用 poster） */
export function coverImage(e: Entry): string | undefined {
  const m = coverMedia(e)
  if (!m) return undefined
  return isPhoto(m) ? m.web : m.poster
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

/**
 * 把全站媒體依紀錄倒序攤平成一維（沒有附件的紀錄不進入）。
 * mediaIndex 就是 entry.media 的 index，也是分享連結 /view?r=…&p=… 的 p。
 */
export interface FlatMedia {
  globalIndex: number
  entry: Entry
  mediaIndex: number
  item: MediaItem
}
export function flattenMedia(list: Entry[]): FlatMedia[] {
  const out: FlatMedia[] = []
  for (const e of list) {
    for (let i = 0; i < e.media.length; i++) {
      out.push({ globalIndex: out.length, entry: e, mediaIndex: i, item: e.media[i] })
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
