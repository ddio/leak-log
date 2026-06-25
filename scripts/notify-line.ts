/**
 * 把本輪新同步的紀錄推到 LINE 群組（GitHub Actions 末段、Pages 部署成功後才跑）。
 *
 * 流程：讀 .sync-output.json（sync.ts 產的本輪新同步清單）→ 用 pg 直連
 * DATABASE_URL 查 line_groups（status=joined 且 notify_enabled）→ 逐群 push →
 * 回寫該群 last_notified_*。
 *
 * 刻意走 pg + DATABASE_URL（不走 supabase-js），讓 GitHub 側只認識「一個 Postgres」，
 * 日後換 DB 只改連線字串。DRY_RUN=1 時只印不打（本機開發用）。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { ROOT, SITE_URL, requireEnv, optionalEnv } from './lib/config.ts';

const SYNC_OUTPUT = resolve(ROOT, '.sync-output.json');
const LINE_PUSH = 'https://api.line.me/v2/bot/message/push';
const DRY_RUN = !!optionalEnv('DRY_RUN', '');

interface SyncedItem {
  id: string;
  title: string;
  eventTimestamp: string;
}

/** 永久連結：https://ddio.github.io/leak-log/r/{id} */
function recordUrl(id: string): string {
  return `${SITE_URL}r/${id}`;
}

async function loadSynced(): Promise<SyncedItem[]> {
  try {
    const arr = JSON.parse(await readFile(SYNC_OUTPUT, 'utf8')) as SyncedItem[];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** 本輪逐筆組成 text 訊息（LINE 單次 push 上限 5 則），最新的在最前面 */
function buildMessages(items: SyncedItem[]): { type: 'text'; text: string }[] {
  return items.slice(0, 5).map((it) => ({
    type: 'text',
    text: `💧 漏水紀錄更新\n${it.title || '(無標題)'}\n${recordUrl(it.id)}`,
  }));
}

async function pushTo(token: string, groupId: string, messages: object[]): Promise<void> {
  const res = await fetch(LINE_PUSH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: groupId, messages }),
  });
  if (!res.ok) {
    throw new Error(`LINE push ${groupId} 失敗 ${res.status}: ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  const items = await loadSynced();
  if (items.length === 0) {
    console.log('本輪沒有新同步紀錄，跳過 LINE 通知');
    return;
  }
  const latest = items[0];
  const messages = buildMessages(items);

  const client = new pg.Client({ connectionString: requireEnv('DATABASE_URL') });
  await client.connect();
  try {
    const { rows } = await client.query<{ group_id: string }>(
      `select group_id from line_groups where status = 'joined' and notify_enabled = true`,
    );
    if (rows.length === 0) {
      console.log('沒有啟用推播的群組（line_groups.notify_enabled 全為 false）');
      return;
    }
    console.log(`本輪 ${items.length} 筆新同步 → 推給 ${rows.length} 個群組${DRY_RUN ? '（DRY_RUN，只印不打）' : ''}`);

    let pushed = 0;
    for (const { group_id } of rows) {
      try {
        if (DRY_RUN) {
          console.log(`  [dry-run] → ${group_id}: ${latest.title} ${recordUrl(latest.id)}`);
        } else {
          const token = requireEnv('LINE_CHANNEL_ACCESS_TOKEN');
          await pushTo(token, group_id, messages);
          await client.query(
            `update line_groups
               set last_notified_at = now(), last_notified_url = $2, last_notified_title = $3
             where group_id = $1`,
            [group_id, recordUrl(latest.id), latest.title],
          );
          console.log(`  ✓ ${group_id}`);
        }
        pushed++;
      } catch (e) {
        // 單一群組失敗（被踢/封鎖等）不影響其他群組
        console.error(`  ✗ ${group_id} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`完成：${pushed}/${rows.length} 群組`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('notify-line 致命錯誤:', e);
  process.exit(1);
});
