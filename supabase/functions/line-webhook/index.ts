// LINE webhook —— 維護 line_groups（群清單的唯一 source of truth）。
//
// LINE 沒有「列出 bot 加入哪些群」的 API，只能靠這支 webhook 收 join/leave event
// 自己記帳。bot 只負責「記錄群組」（join 或收到訊息時 upsert），**不自動開推播**——
// 要不要推由管理員在 Supabase Table Editor 手動勾 line_groups.notify_enabled。
//
// 安全：LINE 不會帶 Supabase JWT，故此 function 以 verify_jwt=false 部署；
// 改由我們自己驗 X-Line-Signature（HMAC-SHA256）。
//
// DB：走 `postgres` 直連 SUPABASE_DB_URL（Supabase 自動注入），**不走 supabase-js/
// PostgREST** —— 與 notify-line 一致，專案的 Data API 可保持關閉、攻擊面更小。
// 需手動設的 secret：LINE_CHANNEL_SECRET、LINE_CHANNEL_ACCESS_TOKEN。
// 選用：GROUP_ALLOWLIST（逗號分隔的 groupId 白名單；設了的話，非白名單群一加入就自動退出）。

import postgres from 'npm:postgres@3';

const LINE_API = 'https://api.line.me/v2/bot';
const env = (k: string) => Deno.env.get(k) ?? '';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false });

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

// ---- line_groups 維護（純 SQL，不經 PostgREST） ----
function allowlist(): string[] {
  return env('GROUP_ALLOWLIST').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 確保群存在於 line_groups（status=joined），並刷新 name/picture/member_count。 */
async function upsertGroup(groupId: string): Promise<void> {
  const [summary, count] = await Promise.all([getGroupSummary(groupId), getMemberCount(groupId)]);
  await sql`
    insert into line_groups (group_id, name, picture_url, member_count, status, left_at)
    values (${groupId}, ${summary.groupName ?? null}, ${summary.pictureUrl ?? null}, ${count}, 'joined', null)
    on conflict (group_id) do update set
      name = excluded.name,
      picture_url = excluded.picture_url,
      member_count = excluded.member_count,
      status = 'joined',
      left_at = null
  `;
}

async function markLeft(groupId: string): Promise<void> {
  await sql`update line_groups set status = 'left', left_at = now() where group_id = ${groupId}`;
}

async function refreshMemberCount(groupId: string): Promise<void> {
  const count = await getMemberCount(groupId);
  if (count !== null) await sql`update line_groups set member_count = ${count} where group_id = ${groupId}`;
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
      // 收到群訊息就確保有這筆群（webhook 可能晚於 join 才開）。
      // 不解析指令、不自動開推播——notify_enabled 由管理員在 Table Editor 手動勾。
      await upsertGroup(groupId);
      return;
    }
  }
}

Deno.serve(async (req) => {
  // GET：健康檢查（順便確認 DB 連得上）
  if (req.method !== 'POST') {
    try {
      await sql`select 1`;
      return Response.json({ ok: true, db: 'ok' });
    } catch (e) {
      return Response.json({ ok: false, db: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

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
