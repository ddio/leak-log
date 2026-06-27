-- 解除 0003 的 pg_cron 排程：每 2 分鐘 poll-and-dispatch 會打爆免費 Airtable 的
-- 每月 1000 次 API 上限（每 2 分一次 GET ≈ 21,600 次/月）。
--
-- sync.yml 自己有整點排程會輪詢 Airtable，poll 這層只是降低延遲，對 Airtable 配額
-- 是純損耗，故移除。未來若改用 Airtable webhook 主動推送再考慮恢復。
--
-- 對應 cron job 由 0003 的 cron.schedule('leaklog-poll', ...) 建立。

select cron.unschedule('leaklog-poll')
where exists (select 1 from cron.job where jobname = 'leaklog-poll');
