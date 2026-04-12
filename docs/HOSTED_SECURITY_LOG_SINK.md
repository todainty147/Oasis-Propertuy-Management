# Hosted Security Log Sink

This note describes the minimal in-repo path for centralized hosted aggregation of high-value OASIS security and workflow failures.

## Chosen Path

OASIS now has an opt-in Supabase-native hosted sink:

- browser/app emits scrubbed structured failures through the shared security logger
- the logger can optionally forward those events to the Edge Function:
  - `ingest-security-observability`
- the Edge Function authenticates the caller, re-scrubs payloads, validates account linkage, and inserts into:
  - `public.security_observability_events`

This keeps vendor coupling low while staying aligned with the repo's existing Supabase architecture.

## Recommended Aggregated Categories

- `rpc_security`
  - denied or unexpected failures on account/tenant scoped RPC reads
- `notification_workflow`
  - notification creation failures and recipient-scope problems
- `invite_security`
  - invite acceptance, invite eligibility, and invite delivery failures
- `contractor_workflow`
  - contractor quote/invoice/status workflow failures
- `work_order_workflow`
  - manager/member work-order transition failures
- `document_storage`
  - document metadata/read/write failures and storage preview/download/delete failures
- `security_workflow`
  - fallback bucket for security-sensitive failures that do not fit the categories above

## What Gets Stored

Each hosted event row is intentionally small:

- `category`
- `kind`
  - `authorization_denied`
  - `unexpected_security_failure`
- `surface`
- `reason`
- `outcome`
- `code`
- `guard_denied`
- `account_id`
- `actor_user_id`
- `actor_role`
- `entity_type`
- `entity_id`
- `correlation_id`
- `source`
- scrubbed `metadata`

## Redaction Boundaries

The shared logger and the Edge Function both scrub:

- invite tokens
- emails
- passwords
- access tokens
- raw payload blobs
- notification bodies
- document filenames
- original filenames
- storage paths
- signed URLs

The goal is to preserve forensic usefulness without storing sensitive business content.

## Enablement

Client-side forwarding is opt-in:

```env
VITE_ENABLE_HOSTED_SECURITY_LOG_SINK=true
VITE_HOSTED_SECURITY_LOG_FUNCTION=ingest-security-observability
```

Required deployment steps:

1. apply [security_observability_events.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/security_observability_events.sql)
2. deploy [index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/ingest-security-observability/index.ts)
3. deploy [cleanup-security-observability-events](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/cleanup-security-observability-events/index.ts) if hosted row retention should run on a schedule
4. enable `VITE_ENABLE_HOSTED_SECURITY_LOG_SINK=true` in staging/production

## Minimal Admin / Reporting Query Surface

OASIS now includes a tiny manager-safe query surface for recent hosted sink rows:

- SQL RPC:
  - `public.security_observability_event_feed(...)`
- app wrapper:
  - [securityObservabilityService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/securityObservabilityService.js)

It is intentionally narrow:
- single-account only
- manager-guarded via `assert_manage_account_access(...)`
- small filter set:
  - `category`
  - `kind`
  - `surface`
  - `limit`

This is enough for:
- admin diagnostics
- lightweight in-app reporting
- staging/production verification

without committing to a full dashboard or analytics subsystem.

The existing Security Audit page now includes a small read-only hosted-event section backed by this RPC.
That section also supports a lightweight CSV export of the currently filtered hosted rows.
It now also includes a `Copy SQL` helper that generates a manager-safe `security_observability_event_feed(...)` query matching the current UI filters.

Example SQL:

```sql
select *
from public.security_observability_event_feed(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'document_storage',
  'authorization_denied',
  null,
  50
);
```

## Staging / Production Rollout Checklist

1. Apply [security_observability_events.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/security_observability_events.sql)
2. Deploy [index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/ingest-security-observability/index.ts)
3. Confirm the Edge Function environment has:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Enable:

```env
VITE_ENABLE_HOSTED_SECURITY_LOG_SINK=true
VITE_HOSTED_SECURITY_LOG_FUNCTION=ingest-security-observability
```

5. Deploy the app
6. Trigger one known denied read and one denied write in staging
7. Verify:
   - browser/runtime logs still show the scrubbed event
   - `public.security_observability_events` receives a hosted row
   - `public.security_observability_event_feed(...)` returns that row for the target account

## Staging / Production Verification

Recommended first checks:

1. Denied manager read:
   - tenant hitting `command_center_items`
2. Invite failure:
   - invalid or expired `accept_account_invite`
3. Contractor workflow denial:
   - non-assigned contractor hitting `wo_fin_submit_quote`
4. Document/storage denial:
   - denied preview or download on a document outside scope

What to confirm in the stored row:
- `category` is set correctly
- `kind` is `authorization_denied` or `unexpected_security_failure`
- `surface` and `reason` are machine-readable
- `account_id`, `entity_type`, `entity_id`, and `correlation_id` are present when expected
- `metadata` excludes:
  - invite tokens
  - emails
  - passwords
  - filenames
  - storage paths
  - signed URLs

## Retention And Export Policy

Recommended default:

- keep hosted sink rows hot for `90` days
- review and export older windows before purge if an account is under active investigation
- purge in small batches to avoid operational spikes

Minimal in-repo helper:

- SQL function:
  - `public.cleanup_security_observability_events(p_retention_days integer default 90, p_batch_size integer default 5000)`
- Scheduled Edge Function:
  - `cleanup-security-observability-events`
  - protected by `CRON_SECRET`
  - accepts optional `retentionDays`, `batchSize`, `maxBatches`, and `dryRun`

Recommended operational pattern:

1. export any window you want to retain longer-term with a filtered SQL query or CSV export
2. run `cleanup-security-observability-events` from Supabase Cron / pg_net using the shared `CRON_SECRET`
3. use `dryRun: true` before enabling recurring cleanup in a new environment

Example export query:

```sql
select *
from public.security_observability_events
where account_id = '11111111-1111-1111-1111-111111111111'::uuid
  and created_at >= now() - interval '30 days'
order by created_at desc;
```

Example cleanup:

```sql
select public.cleanup_security_observability_events(90, 5000);
```

Example scheduled function payload:

```json
{
  "retentionDays": 90,
  "batchSize": 5000,
  "maxBatches": 5,
  "dryRun": false
}
```

## Why This Is Minimal

- no external SaaS dependency is required in this pass
- no new client secret is needed
- the sink is optional and can be rolled out only in staging/production
- local development remains quiet by default

## Remaining Gaps

- Edge Function aggregation is still application-path dependent; failures outside app/edge catch paths will not appear here
- this is not a full analytics or SIEM pipeline
- long-term alerting, trend dashboards, and archive dashboards remain future work
