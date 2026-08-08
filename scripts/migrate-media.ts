/**
 * 一次性遷移：content/entries.json 的 photos[] → media[]（npx tsx scripts/migrate-media.ts）
 *
 * 舊格式每筆是 { web, thumb }，新格式是帶 kind/seq 的 MediaItem。
 * 既有紀錄都沒有影片，所以 seq 就是原本的陣列位置 +1，index 完全不變 ——
 * 已經分享出去的 /view?r=…&p=… 連結、public/img 底下的檔案路徑都不受影響。
 *
 * 可重複執行：已經是新格式的紀錄會直接跳過。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { ENTRIES_JSON } from './lib/config.ts';
import type { Entry, PhotoMedia } from './lib/types.ts';

/** 舊格式的一筆 */
interface LegacyEntry extends Omit<Entry, 'media'> {
  media?: Entry['media'];
  photos?: { web: string; thumb: string }[];
}

const entries = JSON.parse(await readFile(ENTRIES_JSON, 'utf8')) as LegacyEntry[];

let migrated = 0;
const out: Entry[] = entries.map((e) => {
  const { photos, ...rest } = e;
  if (rest.media) return rest as Entry; // 已是新格式
  const media: PhotoMedia[] = (photos ?? []).map((p, i) => ({
    kind: 'photo',
    seq: i + 1,
    web: p.web,
    thumb: p.thumb,
  }));
  migrated++;
  return { ...rest, media } as Entry;
});

await writeFile(ENTRIES_JSON, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`遷移 ${migrated} 筆（共 ${out.length} 筆）`);
