/**
 * content/entries.json 的讀寫。網頁直接消費這份檔案，commit 進 repo 當自包含存檔
 * （半年後 Airtable 清掉或免費額度到期，網站仍能重建）。
 * 以 recordId 為 key upsert，存檔依事件時間新到舊排序。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { ENTRIES_JSON, CONTENT_DIR } from './config.ts';
import type { Entry, AirtableRecord, ResolvedTimestamp, ProcessedPhoto } from './types.ts';

export async function loadEntries(): Promise<Entry[]> {
  try {
    return JSON.parse(await readFile(ENTRIES_JSON, 'utf8')) as Entry[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export function buildEntry(
  record: AirtableRecord,
  ts: ResolvedTimestamp,
  photos: ProcessedPhoto[],
): Entry {
  return {
    id: record.recordId,
    eventTimestamp: ts.iso,
    uploadDate: record.createdTime,
    title: record.title,
    description: record.description,
    keyEvents: record.keyEvents,
    photos,
    timestampSource: ts.source,
  };
}

/** 以 id 取代既有或新增，回傳新陣列（新到舊排序） */
export function upsertEntry(entries: Entry[], entry: Entry): Entry[] {
  const next = entries.filter((e) => e.id !== entry.id);
  next.push(entry);
  // 所有 eventTimestamp 皆為 +08:00 同格式，字串比較即等於時序比較
  next.sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp));
  return next;
}

export async function saveEntries(entries: Entry[]): Promise<void> {
  await mkdir(CONTENT_DIR, { recursive: true });
  await writeFile(ENTRIES_JSON, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}
