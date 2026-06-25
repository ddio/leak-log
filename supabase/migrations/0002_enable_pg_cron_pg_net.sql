-- 啟用 pg_cron（真排程，不怕 Edge Function 休眠）+ pg_net（在 Postgres 內發非同步 HTTP）。
-- 免費方案可用。0003 的 cron 排程依賴這兩個。
create extension if not exists pg_cron;
create extension if not exists pg_net;
