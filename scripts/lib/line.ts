/**
 * LINE 推播共用：訊息組裝、push API。notify-line（正式）與 notify-test（開發測試）
 * 共用同一套，確保格式一致。
 */
import { SITE_URL } from './config.ts';

const LINE_PUSH = 'https://api.line.me/v2/bot/message/push';

/** 永久連結：https://ddio.github.io/leak-log/r/{id} */
export function recordUrl(id: string): string {
  return `${SITE_URL}r/${id}`;
}

export interface NotifyItem {
  id: string;
  title: string;
}

/** 逐筆組成 text 訊息（LINE 單次 push 上限 5 則），呼叫端自行決定順序。 */
export function buildMessages(items: NotifyItem[]): { type: 'text'; text: string }[] {
  return items.slice(0, 5).map((it) => ({
    type: 'text',
    text: `💧 漏水紀錄更新\n${it.title || '(無標題)'}\n${recordUrl(it.id)}`,
  }));
}

/** Push 到單一目標（group/user id）。失敗丟錯，由呼叫端決定要不要吞。 */
export async function pushTo(token: string, to: string, messages: object[]): Promise<void> {
  const res = await fetch(LINE_PUSH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    throw new Error(`LINE push ${to} 失敗 ${res.status}: ${await res.text()}`);
  }
}
