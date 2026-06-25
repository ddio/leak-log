-- pg_cron 排程：每 2 分鐘叫 poll-and-dispatch（→ 查 Airtable → 有未同步就觸發 sync.yml）。
--
-- 前置（一次性、密鑰不寫進這支檔）：
--   1. 設 Edge Function secret： CRON_SECRET = <某個隨機字串>
--   2. 在 Vault 建同值的一筆： select vault.create_secret('<同一字串>', 'cron_secret');
--   x-cron-secret 由 cron job 執行時從 Vault 讀，與 function 端比對；不符回 401。
--
-- 擴充已於 0001 之後另一支 migration 啟用（pg_cron / pg_net）。

select cron.schedule(
  'leaklog-poll',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://yougbqqtttrghlviquoq.supabase.co/functions/v1/poll-and-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 解除排程（需要時）： select cron.unschedule('leaklog-poll');
-- 看執行結果：       select * from cron.job_run_details order by start_time desc limit 10;
