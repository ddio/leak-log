/**
 * 開發測試用：把「最新（或指定）一筆紀錄」推到指定的 group/user id，
 * **不碰 line_groups / notify_enabled**，方便在開發環境驗證 LINE 推播與連結 unfurl。
 *
 * 用法：
 *   npm run notify:test -- <groupId> [recordId]
 *     groupId  必填（或設 env LINE_TEST_GROUP_ID）
 *     recordId 選填，預設取 content/entries.json 最新一筆
 *   DRY_RUN=1 只印不打。
 *
 * 需要 .env：LINE_CHANNEL_ACCESS_TOKEN。
 */
import { readFile } from 'node:fs/promises';
import { ENTRIES_JSON, requireEnv, optionalEnv } from './lib/config.ts';
import { buildMessages, pushTo, recordUrl } from './lib/line.ts';
import type { Entry } from './lib/types.ts';

const DRY_RUN = !!optionalEnv('DRY_RUN', '');

async function main(): Promise<void> {
  const groupId = process.argv[2] || optionalEnv('LINE_TEST_GROUP_ID', '');
  if (!groupId) {
    throw new Error('需要 group id：npm run notify:test -- <groupId> [recordId]（或設 LINE_TEST_GROUP_ID）');
  }
  const recordId = process.argv[3];

  const entries = JSON.parse(await readFile(ENTRIES_JSON, 'utf8')) as Entry[];
  if (entries.length === 0) throw new Error('content/entries.json 是空的，沒有可推的紀錄');

  // entries.json 依事件時間新→舊排序，entries[0] = 最新
  const entry = recordId ? entries.find((e) => e.id === recordId) : entries[0];
  if (!entry) throw new Error(`找不到紀錄 ${recordId}`);

  const messages = buildMessages([{ id: entry.id, title: entry.title }]);
  console.log(`推到 ${groupId}：${entry.title} ${recordUrl(entry.id)}${DRY_RUN ? '（DRY_RUN，只印不打）' : ''}`);

  if (!DRY_RUN) {
    await pushTo(requireEnv('LINE_CHANNEL_ACCESS_TOKEN'), groupId, messages);
    console.log('✓ 已送出');
  }
}

main().catch((e) => {
  console.error('notify-test 失敗:', e instanceof Error ? e.message : e);
  process.exit(1);
});
