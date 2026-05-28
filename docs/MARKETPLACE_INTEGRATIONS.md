# Marketplace Integrations

Current status: Checkatrade now has a real outbound transport seam with execution-state handling, while Fixly and MyHammer remain manual handoff flows.

## What exists today

- Work orders support an explicit fulfilment route:
  - `internal`
  - `marketplace`
  - `hybrid`
  - `undecided`
- Marketplace handoffs persist in Supabase through secured RPCs.
- Marketplace lifecycle changes write to:
  - `external_marketplace_jobs`
  - `external_marketplace_events`
  - `activity_log`
  - manager notifications
- Actionable marketplace states also surface into `command_center_items`
  - ready to submit
  - failed
  - manual follow-up
  - quote received
- The browser UI can call the authenticated `submit-marketplace-handoff` Edge Function for Checkatrade.
- The Edge Function now:
  - validates account/provider rollout state
  - enforces idempotent submission keys per marketplace job
  - attempts the configured provider HTTP submission
  - records submission outcomes back into:
    - `external_marketplace_jobs`
    - `external_marketplace_events`
    - `activity_log`
    - manager notifications
  - classifies failures into:
    - `failed` for retryable transport/provider errors
    - `manual_follow_up` when retries are exhausted or the failure is non-retryable

## Important limitation

The transport is now real, but OASIS still does **not** pretend the provider contract is universally production-ready by default.

Live submission only happens when all of these are true:

- the account has Checkatrade enabled
- `live_submission_enabled` is `true`
- `external_submission_url` is configured
- the Edge environment has `CHECKATRADE_API_KEY`
- the Edge environment has `CHECKATRADE_API_SECRET`

If any of those are missing, OASIS keeps manual handoff as the safe fallback.

## Account-level configuration

There is no settings UI for marketplace providers yet. Account-level rollout is configured through the secured RPC / SQL layer.

Example SQL:

```sql
select *
from public.upsert_marketplace_integration_setting(
  'ACCOUNT_ID'::uuid,
  'checkatrade',
  true,
  jsonb_build_object(
    'live_submission_enabled', false
  )
);
```

Example rollout-only configuration with a future provider endpoint placeholder:

```sql
select *
from public.upsert_marketplace_integration_setting(
  'ACCOUNT_ID'::uuid,
  'checkatrade',
  true,
  jsonb_build_object(
    'live_submission_enabled', true,
    'external_submission_url', 'https://api.staging.checkatrade.com/v1/affiliate-job/jobs',
    'provider_account_reference', 'acct_123',
    'trade_category_map', jsonb_build_object(
      'plumbing', 667,
      'electrician', 123
    ),
    'default_preferred_start_id', 'WITHIN_2_WEEKS',
    'urgency_to_preferred_start_map', jsonb_build_object(
      'high', 'URGENT',
      'medium', 'WITHIN_2_WEEKS',
      'low', 'FLEXIBLE'
    ),
    'max_api_attempts', 3,
    'request_timeout_ms', 15000
  )
);
```

Optional non-secret configuration keys:

- `static_headers`
  - extra non-secret headers to attach to the provider request
- `provider_account_reference`
  - passed into the outbound request body as account context
- `trade_category_map`
  - maps OASIS trade-category labels like `plumbing` or `electrician` to Checkatrade numeric `categoryId` values
- `default_category_id`
  - fallback numeric Checkatrade category if no per-trade mapping exists
- `default_preferred_start_id`
  - fallback Checkatrade preferred-start option like `WITHIN_2_WEEKS`
- `urgency_to_preferred_start_map`
  - maps OASIS urgency values like `high` / `medium` / `low` to Checkatrade preferred-start options
- `max_api_attempts`
  - default `3`
- `request_timeout_ms`
  - default `15000`

## What the portal does with that setting

- If Checkatrade is not enabled for the account:
  - the panel keeps manual handoff available
  - the API submit button is disabled
- If Checkatrade is enabled for the account but live transport is not fully configured:
  - the panel surfaces rollout-ready messaging
  - the operator still gets a safe manual fallback
- If Checkatrade is fully configured:
  - the panel can call the live Edge transport
  - successful submission moves the handoff to `submitted`
  - retryable provider failures move the handoff to `failed`
  - exhausted or non-retryable failures move the handoff to `manual_follow_up`

## Required Edge secrets

- `CHECKATRADE_API_KEY`
- `CHECKATRADE_API_SECRET`
- optional: `CHECKATRADE_API_TIMEOUT_MS`

Secrets stay in the Edge environment, not in `marketplace_integration_settings`.

## Checkatrade authentication model

Checkatrade’s affiliate job API uses a `key + secret` pair and HMAC-SHA256 signing, not a simple bearer token.

OASIS now prepares requests using:

- `Date: <ISO-8601 timestamp>`
- `Digest: SHA-256=<base64 body digest>`
- `Authorization: Signature keyId="...",algorithm="hmac-sha256",headers="(request-target) date content-type digest",signature="..."`

The signature is calculated from a replay-resistant signing string:

```text
(request-target): post /v1/affiliate-job/jobs
date: <ISO-8601 timestamp>
content-type: application/json
digest: SHA-256=<base64 body digest>
```

This keeps the transport aligned with an HTTP-signature style `key + secret` integration and avoids signing only a reusable timestamp.

## Current Checkatrade field mapping

When OASIS submits a live Checkatrade job, it now shapes the outbound body to their `/jobs` contract:

- `categoryId`
  - from `request_payload.categoryId` / `category_id`, otherwise `trade_category_map`, otherwise `default_category_id`
- `description`
  - from the marketplace handoff description
- `email`
  - from the handoff contact email
- `phone`
  - from the handoff contact phone
- `firstName` / `lastName`
  - split from the handoff contact name
- `postcode`
  - from the handoff postcode
- `preferredStart`
  - from `request_payload.preferredStart`, otherwise `urgency_to_preferred_start_map`, otherwise `default_preferred_start_id`
- `address`
  - included only when OASIS has enough property context to send it safely

If any Checkatrade-required fields are still missing, OASIS does not send a live request. The handoff is moved to `manual_follow_up` with validation guidance instead.

## Matched trades storage

After a successful submission Checkatrade returns a list of matched trades (contractor profiles). OASIS stores these in `external_marketplace_job_trades` via the service-role RPC `edge_store_marketplace_job_trades`.

The RPC is a bulk-replace: it deletes all existing trades for the job then inserts the new batch atomically. This means resubmitting a job overwrites any previously stored trades — consistent with the Checkatrade result for the latest submission attempt.

Direct table access is blocked by an `USING (false)` RLS policy. All reads go through `list_marketplace_job_trades(account_id, marketplace_job_id)` and all writes go through `edge_store_marketplace_job_trades(account_id, marketplace_job_id, work_order_id, trades_jsonb)`.

The `edge_store_marketplace_job_trades` function validates that `p_trades` is a JSON array before touching any stored data. Passing a non-array (including `null`) raises `p_trades must be a JSON array` and leaves existing trades intact.

Applied via `supabase/checkatrade_job_trades.sql`.

## Idempotency and retries

- OASIS sends a stable idempotency key per marketplace job submission attempt
- if a job is already in `submitted` state with provider references, the Edge Function returns the existing submission result instead of re-submitting
- retryable transport/provider failures stay in `failed` until `max_api_attempts` is exhausted
- once retry policy is exhausted, the job moves to `manual_follow_up`

## Deployment steps

Complete these in order once Checkatrade has issued your affiliate API credentials.

### 1. Apply the database migrations

```bash
supabase db push
```

This runs all pending migrations, including:

- `supabase/checkatrade_job_trades.sql` — creates `external_marketplace_job_trades`, its RLS policy, and the `list_marketplace_job_trades` / `edge_store_marketplace_job_trades` RPCs.
- `supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql` — adds `assigned_at`, `acknowledged_at`, `acknowledgement_due_at`, and `acknowledgement_status` to the `work_orders_with_flags` view.

If you prefer to apply them manually, run each file against the target database:

```bash
psql "$DATABASE_URL" -f supabase/checkatrade_job_trades.sql
psql "$DATABASE_URL" -f supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql
```

### 2. Set the Edge Function secrets

Secrets are stored in the Supabase project — never in code or `marketplace_integration_settings`.

```bash
supabase secrets set CHECKATRADE_API_KEY=your-api-key
supabase secrets set CHECKATRADE_API_SECRET=your-api-secret
supabase secrets set CHECKATRADE_ENV=staging
supabase secrets set CHECKATRADE_SUBMISSION_URL=https://api-staging.checkatrade.com/v1/affiliate-job/jobs
```

Switch to production values once Checkatrade confirms your integration is ready to go live:

```bash
supabase secrets set CHECKATRADE_ENV=production
supabase secrets set CHECKATRADE_SUBMISSION_URL=https://api.checkatrade.com/v1/affiliate-job/jobs
```

### 3. Deploy the Edge Function

```bash
supabase functions deploy submit-marketplace-handoff
```

### 4. Enable Checkatrade for an account

Run this SQL once per account you want to go live. Replace `ACCOUNT_ID`, `acct_ref`, and the `trade_category_map` values with real data verified against the Checkatrade category API.

```sql
select *
from public.upsert_marketplace_integration_setting(
  'ACCOUNT_ID'::uuid,
  'checkatrade',
  true,
  jsonb_build_object(
    'live_submission_enabled',    true,
    'external_submission_url',    'https://api.checkatrade.com/v1/affiliate-job/jobs',
    'provider_account_reference', 'acct_ref',
    'trade_category_map', jsonb_build_object(
      'plumbing',   667,
      'electrical', 126
    ),
    'default_preferred_start_id', 'WITHIN_2_WEEKS',
    'urgency_to_preferred_start_map', jsonb_build_object(
      'high',   'URGENT',
      'medium', 'WITHIN_2_WEEKS',
      'low',    'FLEXIBLE'
    ),
    'max_api_attempts',   3,
    'request_timeout_ms', 15000
  )
);
```

Set `live_submission_enabled` to `false` during initial testing — the Edge Function will run in dry-run mode and return `liveSubmissionAvailable: false` without calling Checkatrade.

### 5. Verify

Open a work order in the maintenance inbox and navigate to the External Marketplace panel. If everything is wired up correctly you should see:

- the Checkatrade category picker
- the postcode pre-filled from the property
- the **Submit to Checkatrade** button enabled
- after submission: the matched trades list (name + profile link)
