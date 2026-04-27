# Marketplace Integrations

Current status: Checkatrade API rollout is scaffolded, while Fixly and MyHammer remain manual handoff flows.

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
- The browser UI can call the authenticated `submit-marketplace-handoff` Edge Function for Checkatrade.

## Important limitation

The Checkatrade provider transport is **not live yet**.

The current Edge Function phase does **not** submit jobs to Checkatrade. It only:

- verifies the caller is a manager/root for the target account
- verifies the target marketplace handoff exists
- verifies Checkatrade is enabled for that account
- returns rollout-state feedback and a prepared payload shape

Manual handoff remains the safe operational path until the live provider transport is implemented.

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
    'live_submission_enabled', false,
    'external_submission_url', 'https://provider.example.test/submit'
  )
);
```

## What the portal does with that setting

- If Checkatrade is not enabled for the account:
  - the panel keeps manual handoff available
  - the API submit button is disabled
- If Checkatrade is enabled for the account:
  - the panel surfaces rollout-ready messaging
  - the API scaffold button can be called
  - the result still directs operators to manual handoff until live transport ships

## Deployment note

This phase requires:

- `supabase/marketplace_integrations.sql` applied to the environment
- `supabase/functions/submit-marketplace-handoff/index.ts` deployed to the project

No direct provider credentials are consumed by this phase yet because live provider transport is intentionally not implemented.
