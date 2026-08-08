/**
 * Airtable 讀寫。用 REST API + global fetch（不需 SDK）。
 * 一律用 returnFieldsByFieldId，fields 以欄位 ID 為 key。
 */
import { requireEnv, FIELDS } from './config.ts';
import type { AirtableRecord, AirtableAttachment } from './types.ts';

const API = 'https://api.airtable.com/v0';

function baseUrl(): string {
  return `${API}/${requireEnv('AIRTABLE_BASE_ID')}/${requireEnv('AIRTABLE_TABLE_ID')}`;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv('AIRTABLE_API_KEY')}`,
    'Content-Type': 'application/json',
  };
}

interface RawRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

/** 撈全表（分頁），volume 小（半年專案、免費上限 1000 筆）所以一次拉完 client-side 過濾 */
async function listAll(): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(baseUrl());
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Airtable list 失敗 ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { records: RawRecord[]; offset?: string };
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

/**
 * 關鍵事件欄位正規化成 string[]。
 * 相容兩種來源：multipleSelects（回傳陣列）與 single line text（回傳字串，
 * 以逗號 / 、/ ， 分隔多個事件）。
 */
function parseKeyEvents(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toRecord(raw: RawRecord): AirtableRecord {
  const f = raw.fields ?? {};
  const attachmentsRaw = (f[FIELDS.attachments] as Array<Record<string, string>>) ?? [];
  const attachments: AirtableAttachment[] = attachmentsRaw.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    type: a.type,
  }));
  return {
    recordId: raw.id,
    title: (f[FIELDS.title] as string) ?? '',
    description: (f[FIELDS.description] as string) ?? '',
    manualTimestamp: (f[FIELDS.manualTimestamp] as string) ?? null,
    keyEvents: parseKeyEvents(f[FIELDS.keyEvents]),
    attachments,
    createdTime: raw.createdTime,
  };
}

/** 撈出「已同步」未勾（false 或不存在）的 record */
export async function fetchUnsynced(): Promise<AirtableRecord[]> {
  const all = await listAll();
  return all.filter((r) => r.fields?.[FIELDS.synced] !== true).map(toRecord);
}

async function patch(recordId: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(baseUrl(), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  });
  if (!res.ok) {
    throw new Error(`Airtable patch ${recordId} 失敗 ${res.status}: ${await res.text()}`);
  }
}

/** 同步成功：打勾 已同步、清空 同步錯誤 */
export async function markSynced(recordId: string): Promise<void> {
  await patch(recordId, { [FIELDS.synced]: true, [FIELDS.syncError]: '' });
}

/** 同步失敗：保持未勾、寫入錯誤訊息給人看 */
export async function markError(recordId: string, message: string): Promise<void> {
  await patch(recordId, { [FIELDS.synced]: false, [FIELDS.syncError]: message });
}
