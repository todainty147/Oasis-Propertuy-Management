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
- `Authorization: Signature keyId="...",algorithm="hmac-sha256",signature="..."`

The signature is calculated from the documented Checkatrade signing string:

```text
date: <ISO-8601 timestamp>
```

This keeps the transport aligned with Checkatrade’s current developer documentation and avoids misrepresenting a bearer-token integration as production-ready.

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

## Idempotency and retries

- OASIS sends a stable idempotency key per marketplace job submission attempt
- if a job is already in `submitted` state with provider references, the Edge Function returns the existing submission result instead of re-submitting
- retryable transport/provider failures stay in `failed` until `max_api_attempts` is exhausted
- once retry policy is exhausted, the job moves to `manual_follow_up`

## Deployment note

This phase requires:

- `supabase/marketplace_integrations.sql` applied to the environment
- `supabase/functions/submit-marketplace-handoff/index.ts` deployed to the project
- `CHECKATRADE_API_KEY` set in the Supabase Edge Function secrets for the target project
- `CHECKATRADE_API_SECRET` set in the Supabase Edge Function secrets for the target project
