-- LINE bot 後台用表
-- 用途：LINE 沒有「列出所有群組」的 API，bot 加群只能靠 webhook 的 join/leave event
-- 自己記帳。這幾張表就是群組清單的唯一 source of truth，Supabase 的 Table Editor
-- 直接當後台用（勾 notify_enabled 控制要不要推播）。
--
-- 套用方式：貼進 Supabase SQL Editor 執行，或用 supabase CLI 套這支 migration。

-- ---------------------------------------------------------------------------
-- 1) 群組清單（需求 1 + 2 + 3）
-- ---------------------------------------------------------------------------
create table if not exists public.line_groups (
  group_id          text primary key,                -- 需求1：LINE source.groupId
  name              text,                            -- 需求1：群名（GET /v2/bot/group/{id}/summary）
  picture_url       text,                            -- 群大頭貼（同上 summary，順手記）
  member_count      integer,                         -- 需求1：人數（GET .../members/count，所有帳號可用）
  notify_enabled    boolean     not null default false, -- 需求2：管理員主動勾選才推（opt-in）
  status            text        not null default 'joined', -- joined | left
  joined_at         timestamptz not null default now(),   -- 被邀請進群的時間
  left_at           timestamptz,                     -- 退群 / 被踢時間（軟刪除，不真的刪列）
  last_notified_at  timestamptz,                     -- 需求3：最後一筆通知時間
  last_notified_url text,                            -- 需求3：最後一筆通知網址（/r/{id}）
  last_notified_title text,                          -- 後台可讀性：最後一筆通知的紀錄標題（可選）
  updated_at        timestamptz not null default now(),
  constraint line_groups_status_chk check (status in ('joined', 'left'))
);

comment on table  public.line_groups is 'LINE bot 加入的群組清單；唯一 source of truth，靠 webhook join/leave 維護';
comment on column public.line_groups.notify_enabled is '管理員在 Table Editor 勾選；notify-line 只推 status=joined 且此欄為 true 的群';

-- ---------------------------------------------------------------------------
-- 2) 群成員名稱（需求 1 的「成員名稱」— best-effort）
-- 注意：GET /v2/bot/group/{id}/members/ids 需「已驗證或付費」帳號，未驗證會回 403。
-- 抓不到就讓這張表空著，不影響其他功能。人數一律用 line_groups.member_count。
-- ---------------------------------------------------------------------------
create table if not exists public.line_group_members (
  group_id     text not null references public.line_groups(group_id) on delete cascade,
  user_id      text not null,                        -- LINE userId（群內）
  display_name text,                                 -- GET .../member/{userId} 的 displayName
  updated_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- updated_at 自動更新
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_line_groups_touch on public.line_groups;
create trigger trg_line_groups_touch
  before update on public.line_groups
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_line_group_members_touch on public.line_group_members;
create trigger trg_line_group_members_touch
  before update on public.line_group_members
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS：開啟但不建任何 policy。
-- → Edge Functions 用 service_role key 連線（繞過 RLS）；後台 Table Editor 用 owner
--   身分也繞過 RLS。等於「只有伺服端與後台能讀寫，anon/public 一律擋」。
-- ---------------------------------------------------------------------------
alter table public.line_groups        enable row level security;
alter table public.line_group_members enable row level security;
