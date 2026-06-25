// poll-and-dispatch —— 被 pg_cron 每 1–2 分叫起，查 Airtable 有沒有未同步 record，
// 有就觸發 GitHub Actions sync.yml（workflow_dispatch）。沒有就直接結束，省掉一次空跑。
//
// 去重不靠這層：sync.yml 自己「撈未同步 → 沒變更就跳過 commit」，重複觸發頂多空跑。
//
// 安全：verify_jwt=false，改用共享密鑰自保——呼叫方需帶 x-cron-secret: <CRON_SECRET>。
//
// secret / env：AIRTABLE_API_KEY、GH_DISPATCH_PAT、CRON_SECRET；
//   選用 DRY_RUN（只查不觸發）、AIRTABLE_BASE_ID / AIRTABLE_TABLE_ID（預設用現有值）。

const env = (k: string, fallback = '') => Deno.env.get(k) ?? fallback;

const AIRTABLE_API = 'https://api.airtable.com/v0';
const BASE_ID = env('AIRTABLE_BASE_ID', 'app9qIBi0OyA9LM9I');
const TABLE_ID = env('AIRTABLE_TABLE_ID', 'tbly6tnHFnzvXViZH');
// 「已同步」欄位 ID（與 scripts/lib/config.ts 的 FIELDS.synced 一致，用 ID 不怕改名）
const SYNCED_FIELD = 'fld03aEdvWRnk8nVd';

const GH_REPO = env('GH_REPO', 'ddio/leak-log');
const GH_WORKFLOW = env('GH_WORKFLOW', 'sync.yml');
const DRY_RUN = !!env('DRY_RUN');

/** 分頁掃 Airtable，只取「已同步」欄，發現任一未勾就提前回 true（輕量）。 */
async function hasUnsynced(): Promise<boolean> {
  const token = env('AIRTABLE_API_KEY');
  let offset: string | undefined;
  do {
    const url = new URL(`${AIRTABLE_API}/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', SYNCED_FIELD);
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable list 失敗 ${res.status}: ${await res.text()}`);
    const data = await res.json() as { records: { fields: Record<string, unknown> }[]; offset?: string };

    if (data.records.some((r) => r.fields?.[SYNCED_FIELD] !== true)) return true;
    offset = data.offset;
  } while (offset);
  return false;
}

/** 觸發 GitHub Actions workflow_dispatch（只在 default branch=main 生效）。 */
async function dispatchWorkflow(): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env('GH_DISPATCH_PAT')}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'leaklog-poll-and-dispatch',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );
  if (!res.ok) throw new Error(`GitHub dispatch 失敗 ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  // 共享密鑰：擋掉非 pg_cron 的亂打
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const unsynced = await hasUnsynced();
    let dispatched = false;
    if (unsynced && !DRY_RUN) {
      await dispatchWorkflow();
      dispatched = true;
    }
    return Response.json({ unsynced, dispatched, dryRun: DRY_RUN });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
