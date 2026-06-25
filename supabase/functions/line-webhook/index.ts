// LINE webhook —— 維護 line_groups（群清單的唯一 source of truth）。
//
// LINE 沒有「列出 bot 加入哪些群」的 API，只能靠這支 webhook 收 join/leave event
// 自己記帳。另接幾個群內指令（訂閱 / 取消訂閱）讓管理員直接在 LINE 控制推播開關。
//
// 安全：LINE 不會帶 Supabase JWT，故此 function 必須以 verify_jwt=false 部署；
// 改由我們自己驗 X-Line-Signature（HMAC-SHA256）。
//
// 自動注入的環境變數：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（service role 繞 RLS）。
// 需手動設的 secret：LINE_CHANNEL_SECRET、LINE_CHANNEL_ACCESS_TOKEN。
// 選用：GROUP_ALLOWLIST（逗號分隔的 groupId 白名單；設了的話，非白名單群一加入就自動退出）。

import { createClient } from 'npm:@supabase/supabase-js@2';

const LINE_API = 'https://api.line.me/v2/bot';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

// ---- LINE 簽章驗證（Web Crypto HMAC-SHA256 → base64） ----
async function verifySignature(secret: string, rawBody: string, signature: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

// ---- LINE Messaging API 小工具 ----
function lineHeaders(): HeadersInit {
  return { Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' };
}

async function getGroupSummary(groupId: string): Promise<{ groupName?: string; pictureUrl?: string }> {
  try {
    const res = await fetch(`${LINE_API}/group/${groupId}/summary`, { headers: lineHeaders() });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

async function getMemberCount(groupId: string): Promise<number | null> {
  try {
    const res = await fetch(`${LINE_API}/group/${groupId}/members/count`, { headers: lineHeaders() });
    if (!res.ok) return null;
    const { count } = await res.json();
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

async function leaveGroup(groupId: string): Promise<void> {
  await fetch(`${LINE_API}/group/${groupId}/leave`, { method: 'POST', headers: lineHeaders() });
}

async function replyText(replyToken: string, text: string): Promise<void> {
  if (!replyToken) return;
  await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: lineHeaders(),
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

// ---- line_groups 維護 ----
function allowlist(): string[] {
  return env('GROUP_ALLOWLIST').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 確保群存在於 line_groups（status=joined），並刷新 name/picture/member_count。 */
async function upsertGroup(groupId: string): Promise<void> {
  const [summary, count] = await Promise.all([getGroupSummary(groupId), getMemberCount(groupId)]);
  await db.from('line_groups').upsert(
    {
      group_id: groupId,
      name: summary.groupName ?? null,
      picture_url: summary.pictureUrl ?? null,
      member_count: count,
      status: 'joined',
      left_at: null,
    },
    { onConflict: 'group_id' },
  );
}

async function markLeft(groupId: string): Promise<void> {
  await db.from('line_groups').update({ status: 'left', left_at: new Date().toISOString() }).eq('group_id', groupId);
}

async function setNotify(groupId: string, enabled: boolean): Promise<void> {
  await db.from('line_groups').update({ notify_enabled: enabled }).eq('group_id', groupId);
}

async function refreshMemberCount(groupId: string): Promise<void> {
  const count = await getMemberCount(groupId);
  if (count !== null) await db.from('line_groups').update({ member_count: count }).eq('group_id', groupId);
}

// ---- 單一 event 處理（純邏輯，方便日後抽出測試） ----
// deno-lint-ignore no-explicit-any
async function handleEvent(ev: any): Promise<void> {
  const groupId: string | undefined = ev?.source?.groupId;
  if (ev?.source?.type !== 'group' || !groupId) return; // 只管群組；1:1/room 先略過

  switch (ev.type) {
    case 'join': {
      // 被拉進群。非白名單（若有設）直接退出，不記帳。
      if (allowlist().length && !allowlist().includes(groupId)) {
        await leaveGroup(groupId);
        return;
      }
      await upsertGroup(groupId);
      return;
    }
    case 'leave': {
      await markLeft(groupId);
      return;
    }
    case 'memberJoined':
    case 'memberLeft': {
      await refreshMemberCount(groupId);
      return;
    }
    case 'message': {
      // 先確保有這筆群（webhook 可能晚於 join 才開），再認指令
      await upsertGroup(groupId);
      if (ev.message?.type !== 'text') return;
      const text = String(ev.message.text ?? '').trim();
      if (text === '訂閱' || text === '開啟通知') {
        await setNotify(groupId, true);
        await replyText(ev.replyToken, '✅ 已開啟此群的漏水紀錄推播。');
      } else if (text === '取消訂閱' || text === '關閉通知') {
        await setNotify(groupId, false);
        await replyText(ev.replyToken, '🔕 已關閉此群的推播。輸入「訂閱」可重新開啟。');
      }
      return;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok'); // 健康檢查 / GET 探活

  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature') ?? '';
  const secret = env('LINE_CHANNEL_SECRET');

  if (!secret || !(await verifySignature(secret, rawBody, signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  let events: unknown[] = [];
  try {
    events = JSON.parse(rawBody).events ?? [];
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // 逐一處理；單一 event 失敗不影響其他，且一律回 200（LINE 失敗會重送）。
  await Promise.allSettled(events.map(handleEvent));
  return new Response('ok');
});
