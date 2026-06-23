/**
 * Google Drive 同步：原圖 + 純文字 .txt 備份。
 * - 資料夾按「事件時間日期」{YYYY-MM-DD}，建在 root folder 下
 * - 同組檔名共用前綴 {date}_{recordId}，人眼可辨識為一組
 * - 原圖保留完整 EXIF（含 GPS）當存檔，Drive 私密所以 OK
 * - 冪等：同名先查再 update/create，支援重新同步覆寫
 */
import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { extname } from 'node:path';
import { DateTime } from 'luxon';
import { requireEnv, TZ } from './config.ts';
import type { AirtableRecord, ResolvedTimestamp } from './types.ts';
import type { DownloadedPhoto } from './download.ts';

const seq = (i: number): string => String(i + 1).padStart(2, '0');
const escQuery = (s: string): string => s.replace(/'/g, "\\'");
const toStream = (data: Buffer | string): Readable => Readable.from([data]);

let cached: drive_v3.Drive | null = null;

export function getDrive(): drive_v3.Drive {
  if (cached) return cached;
  const auth = new google.auth.OAuth2(
    requireEnv('GDRIVE_CLIENT_ID'),
    requireEnv('GDRIVE_CLIENT_SECRET'),
  );
  auth.setCredentials({ refresh_token: requireEnv('GDRIVE_REFRESH_TOKEN') });
  cached = google.drive({ version: 'v3', auth });
  return cached;
}

/** 在 parent 下找/建子資料夾，回 folderId */
async function ensureFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const q =
    `name='${escQuery(name)}' and '${parentId}' in parents and ` +
    `mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, supportsAllDrives: true });
  const found = res.data.files?.[0]?.id;
  if (found) return found;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

/** 在 folder 下，同名則覆寫內容、否則新建 */
async function upsertFile(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
  mimeType: string,
  body: Buffer | string,
): Promise<void> {
  const q = `name='${escQuery(name)}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, supportsAllDrives: true });
  const existing = res.data.files?.[0]?.id;
  const media = { mimeType, body: toStream(body) };
  if (existing) {
    await drive.files.update({ fileId: existing, media, supportsAllDrives: true });
  } else {
    await drive.files.create({ requestBody: { name, parents: [parentId] }, media, fields: 'id', supportsAllDrives: true });
  }
}

function buildTxt(
  record: AirtableRecord,
  ts: ResolvedTimestamp,
  photoNames: string[],
): string {
  const eventTime = DateTime.fromISO(ts.iso).toFormat('yyyy-MM-dd HH:mm');
  const uploadTime = DateTime.fromISO(record.createdTime).setZone(TZ).toFormat('yyyy-MM-dd HH:mm');
  const sourceLabel = ts.source === 'exif-median' ? 'EXIF中位數' : '手動';
  const header = [
    `事件時間: ${eventTime} (UTC+8)`,
    `上傳時間: ${uploadTime} (UTC+8)`,
    `關鍵事件: ${record.keyEvents.join(', ') || '（無）'}`,
    `照片: ${photoNames.join(', ') || '（無）'}`,
    `時間來源: ${sourceLabel}`,
    '---',
  ].join('\n');
  return `${header}\n${record.description}\n`;
}

/** 同步一筆 record 到 Drive：原圖 + .txt */
export async function syncRecordToDrive(
  record: AirtableRecord,
  photos: DownloadedPhoto[],
  ts: ResolvedTimestamp,
): Promise<void> {
  const drive = getDrive();
  const rootId = requireEnv('GDRIVE_ROOT_FOLDER_ID');
  const date = DateTime.fromISO(ts.iso).toFormat('yyyy-MM-dd');
  const folderId = await ensureFolder(drive, rootId, date);
  const prefix = `${date}_${record.recordId}`;

  const photoNames: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const ext = extname(photos[i].filename) || '.jpg';
    const name = `${prefix}_${seq(i)}${ext}`;
    photoNames.push(name);
    await upsertFile(drive, folderId, name, photos[i].type || 'image/jpeg', photos[i].buffer);
  }

  await upsertFile(drive, folderId, `${prefix}.txt`, 'text/plain; charset=utf-8', buildTxt(record, ts, photoNames));
}
