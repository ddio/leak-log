/**
 * 日期格式化。eventTimestamp 是帶 +08:00 的 ISO；一律以 Asia/Taipei 顯示。
 * 用原生 Intl，不把 luxon 帶進前端 bundle。
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** 設計稿用的斜線格式：2026/06/08 */
export function formatDateSlash(iso: string): string {
  return formatDate(iso).replace(/-/g, '/')
}

/** 設計稿用的斜線格式：2026/06/08 18:10 */
export function formatDateTimeSlash(iso: string): string {
  return formatDateTime(iso).replace(/-/g, '/')
}

/** 時間軸用：MM/DD */
export function formatMonthDay(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso)).replace(/-/g, '/')
}

/** 時間軸用：HH:MM */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** 星期：週一…週日 */
export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  }).format(new Date(iso))
}

/** 兩位數序號檔名標：01.jpg */
export function seqName(index: number, ext = '.jpg'): string {
  return String(index + 1).padStart(2, '0') + ext
}

/** 影片長度：18.1 → 0:18 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 穩定的分日 key（Asia/Taipei）：2026-06-23 */
export function dateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}
