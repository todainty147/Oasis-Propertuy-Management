# Checkatrade Marketplace Operations

Use this when the Checkatrade submit button is missing or disabled, a submission is stuck in `failed` or `manual_follow_up`, matched trades are not showing after a successful submission, or the Edge Function is returning unexpected errors.

## What this slice does

The Checkatrade integration lets property managers submit a work-order job directly to Checkatrade's affiliate job API from the maintenance inbox. The flow is:

1. Manager opens a work order → External Marketplace panel → selects Checkatrade
2. Fills category, postcode, contact details; clicks **Submit to Checkatrade**
3. Browser calls `submit-marketplace-handoff` Edge Function (authenticated, `service_role` not used client-side)
4. Edge Function signs the request with HMAC-SHA256 and posts to the configured Checkatrade submission URL
5. On success, the Edge Function calls `edge_store_marketplace_job_trades` (via service-role RPC) to bulk-replace any previously returned trades
6. UI shows the matched trade cards (name + profile link)

Key tables:

- `external_marketplace_jobs` — one row per work-order handoff
- `external_marketplace_events` — lifecycle events per handoff
- `external_marketplace_job_trades` — matched trades returned by Checkatrade (RLS-locked; access only via RPCs)

Key RPCs:

- `list_marketplace_job_trades(account_id, marketplace_job_id)` — for reading matched trades (authenticated)
- `edge_store_marketplace_job_trades(account_id, marketplace_job_id, work_order_id, trades_jsonb)` — for writing matched trades (service_role only)

Required migrations (in addition to `marketplace_integrations.sql`):

```
supabase/checkatrade_job_trades.sql
supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql
```

Required Edge secrets:

```
CHECKATRADE_API_KEY
CHECKATRADE_API_SECRET
CHECKATRADE_ENV          (staging | production)
CHECKATRADE_SUBMISSION_URL
```

See [MARKETPLACE_INTEGRATIONS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/MARKETPLACE_INTEGRATIONS.md) for full deployment steps.

## First checks

Always confirm before digging further:

```sql
-- 1. Confirm account has Checkatrade enabled
select provider, enabled, config
from public.marketplace_integration_settings
where account_id = '<account_id>'
  and provider = 'checkatrade';

-- 2. Confirm work order exists and has a fulfilment route
select id, status, fulfilment_route, account_id
from public.work_orders
where id = '<work_order_id>';

-- 3. Confirm the marketplace handoff job exists
select id, provider, status, submission_key, provider_job_id, error_message, attempts, created_at
from public.external_marketplace_jobs
where work_order_id = '<work_order_id>'
order by created_at desc
limit 5;
```

## Submit button is missing or disabled

The External Marketplace panel only renders if the account has Checkatrade enabled:

```sql
select enabled, config->>'live_submission_enabled' as live_enabled
from public.marketplace_integration_settings
where account_id = '<account_id>'
  and provider = 'checkatrade';
```

- `enabled = false` → button disabled, panel shows manual handoff only
- `live_submission_enabled = false` → button shows "dry-run" mode warning; no actual API call
- Row missing entirely → account not onboarded; run the `upsert_marketplace_integration_setting` RPC in the deployment guide

The button is also disabled if required fields (postcode, description, contact) are not filled in by the manager.

## Submission fails immediately (Edge Function error)

Check Edge Function logs in the Supabase Dashboard → Edge Functions → `submit-marketplace-handoff` → Logs.

Common failure classes:

| Error string in logs | Cause | Fix |
|---|---|---|
| `Missing CHECKATRADE_API_KEY` | Secret not set | `supabase secrets set CHECKATRADE_API_KEY=...` and redeploy |
| `Missing CHECKATRADE_API_SECRET` | Secret not set | `supabase secrets set CHECKATRADE_API_SECRET=...` and redeploy |
| `live_submission_enabled is false` | Config not flipped | Update `live_submission_enabled` to `true` via RPC |
| `Marketplace job not found` | Stale job ID in request | Refresh the page and retry |
| `Missing required fields` | categoryId / postcode / description absent | Manager must fill all required fields |
| `provider returned non-2xx` | Checkatrade API rejected request | Check `error_message` column in `external_marketplace_jobs`; inspect payload logged |
| `timeout` | Network or Checkatrade latency | Wait and retry; if persistent, check `request_timeout_ms` config |

Inspect the stored error detail:

```sql
select id, status, attempts, error_message, provider_response, updated_at
from public.external_marketplace_jobs
where work_order_id = '<work_order_id>'
order by created_at desc
limit 1;
```

## Job stuck in `failed` after multiple attempts

`failed` means retryable errors occurred and `max_api_attempts` was not yet exhausted. The manager can click **Retry** in the panel.

`manual_follow_up` means either the retry limit was exhausted or the failure was classified as non-retryable (e.g. Checkatrade returned 400 / 422). The manager must handle it manually.

Check attempt count vs limit:

```sql
select attempts,
       config->>'max_api_attempts' as max_attempts
from public.external_marketplace_jobs emj
join public.marketplace_integration_settings mis
  on mis.account_id = emj.account_id
  and mis.provider = 'checkatrade'
where emj.id = '<marketplace_job_id>';
```

If `attempts >= max_attempts`, the job will never auto-retry. The only resolution is:
1. Fix the root cause (credentials, configuration, missing fields)
2. Create a new marketplace handoff for the same work order — or use the manual Checkatrade interface directly

## Matched trades not showing after successful submission

After a successful submission the Edge Function calls `edge_store_marketplace_job_trades`. Verify the trades were stored:

```sql
select id, trade_id, name, profile_url, created_at
from public.list_marketplace_job_trades('<account_id>'::uuid, '<marketplace_job_id>'::uuid);
```

If the query returns 0 rows but the job status is `submitted`:

- Checkatrade returned an empty trades array for this job — this is valid; no trades matched the category/postcode combination
- Or the Edge Function version predates `checkatrade_job_trades.sql` being applied — verify the migration was applied and redeploy the function

If the query raises `function list_marketplace_job_trades does not exist`:

```bash
psql "$DATABASE_URL" -f supabase/checkatrade_job_trades.sql
```

Then redeploy the Edge Function.

## `column work_orders_with_flags.assigned_at does not exist` (error 42703)

This PostgreSQL error appears in the maintenance inbox when the view migration has not been applied.

Apply the missing migration:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql
```

Or via `npm run db:apply:repo` against the target database.

After applying, no redeploy is needed — the view change is transparent to the app.

## `p_trades must be a JSON array` from `edge_store_marketplace_job_trades`

This error fires when the Edge Function passes a non-array value as `p_trades`. This is a bug in the Edge Function, not in user data. Apply the latest `checkatrade_job_trades.sql` and redeploy the function. The validation guard rejects the call before touching any stored trades.

## Idempotency key collision

If a submission is retried quickly and the Edge Function returns an existing result rather than posting again, check `submission_key` in `external_marketplace_jobs`. A stable key is intentional — it prevents duplicate submissions. If the trade result is genuinely stale, reset the submission key:

```sql
-- Only if you are certain the prior submission did not reach Checkatrade
update public.external_marketplace_jobs
set submission_key = null,
    status = 'pending',
    attempts = 0,
    error_message = null
where id = '<marketplace_job_id>'
  and account_id = '<account_id>';
```

Verify immediately after:

```sql
select id, status, submission_key, attempts
from public.external_marketplace_jobs
where id = '<marketplace_job_id>';
```

## Checkatrade is enabled but the panel shows "manual handoff only"

The panel degrades to manual mode when `live_submission_enabled = false` or required secrets are absent. Check:

```sql
select config
from public.marketplace_integration_settings
where account_id = '<account_id>'
  and provider = 'checkatrade';
```

If `live_submission_enabled` is `true` but the panel still shows manual mode, the `CHECKATRADE_API_KEY` or `CHECKATRADE_API_SECRET` Edge secret is not set. Add secrets and redeploy the function.
