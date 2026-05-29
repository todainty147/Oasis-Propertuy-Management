# Schema Workflow

This repo does not use checked-in migrations as the primary local bootstrap source.

The current source of truth for local schema bootstrapping is:

1. [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
2. additive overlay SQL files applied after baseline when they are newer or intentionally separate, for example:
   - [supabase/20260315_billing.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/20260315_billing.sql)
   - [supabase/account_entitlements.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_entitlements.sql)
   - [supabase/account_invitations_saas.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_invitations_saas.sql)
   - [supabase/security_failure_observability.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/security_failure_observability.sql)
   - [supabase/performance_rpc_indexes.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_rpc_indexes.sql)

The placeholder snapshot migration [20260319114347_remote_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/migrations/20260319114347_remote_schema.sql) is intentionally not the source of truth. It exists only so the repo does not accidentally treat a stale or partial remote snapshot dump as authoritative.

## Why the old workflow was fragile

Before this cleanup:
- `baseline_schema.sql` could be manually updated without a repeatable regeneration step
- an accidental dump could be written to the placeholder snapshot migration
- shell/path differences could create stray files instead of refreshing the real baseline
- contributors could easily forget which overlay SQL files must be applied after the baseline

## Recommended local bootstrap workflow

Use this when rebuilding a local database for integration work.

1. Start local Supabase.
2. Run:

```bash
npm run db:bootstrap
```

3. Seed the integration harness if needed.

Example overlay order for the current repo:

1. `supabase/20260315_billing.sql`
2. `supabase/account_entitlements.sql`
3. `supabase/account_invitations_saas.sql`
4. `supabase/create_notifications.sql`
5. `supabase/security_denied_event_stream.sql`
6. `supabase/security_observability_events.sql`
7. `supabase/payment_write_authorization.sql`
8. `supabase/work_order_workflow_seed.sql`
9. `supabase/document_templates.sql`
10. `supabase/document_requests.sql`
11. `supabase/document_packets.sql`
12. `supabase/document_signature_readiness.sql`
13. `supabase/document_signature_docuseal.sql`
14. `supabase/storage_buckets.sql`
15. `supabase/storage_documents_policies.sql`
16. `supabase/storage_maintenance_request_attachments_policies.sql`
17. `supabase/storage_work_order_attachments_policies.sql`
18. `supabase/renters_rights_readiness.sql`
19. `supabase/renters_rights_entitlement.sql`
20. `supabase/renters_rights_phase2.sql`
21. `supabase/renters_rights_tenant_filter_fix.sql`
22. `supabase/trial_period_enforcement.sql`
23. `supabase/operator_agency_grants.sql`
24. `supabase/account_subscription_plan_hardened.sql` ← **activation gate — apply last, after verifying `select count(*) from accounts where trial_ends_at is not null` returns 0**

> The items above are the original documented bootstrap order. The full apply sequence (including all additions since then) is the authoritative source in `scripts/dbApplyRepoSql.js` → `OVERLAY_SEQUENCE`.

Recent additions (apply after `command_center_items.sql`, before `attention_center_items.sql`):

25. `supabase/rent_engine_tables.sql` — core Rent Rules Engine (rent_plans, rent_charge_rules, rent_calculation_runs, expected_charges, RPCs: activate_rent_plan, end_rent_plan, upsert_rent_charge_rules, save_calculation_run, generate_expected_charge, post_expected_charge, cancel_expected_charge)
26. `supabase/advanced_rent_models.sql` — advanced rent model tables (rent_splits, property_rooms, room_rent_assignments, utility_charges, rent_adjustments, str_booking_charges) and rent_plans column extensions (change_reason, notice_required, notice_served_at, notice_method, effective_date, extended status values)
27. `supabase/device_push_tokens.sql` — push notification device-token storage and cleanup helpers. In the full apply sequence this runs after `create_notifications.sql`, before notification trigger/grant overlays.
28. `supabase/compliance_safe_phase2.sql` — Compliance Safe evidence attachment, tenant acknowledgements, expiry metadata, tenant RLS and acknowledgement response triggers. In the full apply sequence this runs after `legal_security_phase3.sql`.

This is intentionally explicit. Do not assume `supabase db reset` alone reconstructs the full app schema in this repo.

> **Trial enforcement note:** `account_subscription_plan_hardened.sql` (item 24) replaces the live `account_subscription_plan()` function. Run the pre-deploy check before applying it in any environment that has existing accounts:
> ```sql
> select count(*) from accounts where trial_ends_at is not null;
> ```
> Existing accounts with `NULL` hit the grandfathered `else` branch and are unaffected. Only accounts created after step 22 (`trial_period_enforcement.sql`) will have a trial date set.

## Local bootstrap helper

Use:

```bash
npm run db:bootstrap
```

What it does:
- resets the local Supabase database first with `supabase db reset --local --no-seed`
- checks connectivity to the local Postgres/Supabase database
- applies [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
- applies the current required overlays in a deterministic order
- logs each step so local rebuilds are easy to audit

The reset step gives the helper a clean local starting point. `supabase db reset` alone is still not enough for this repo because the app schema depends on the explicit baseline + overlay sequence that follows.

The helper mirrors the same baseline + overlay order used by the integration workflow. It does not introduce migrations or replace the documented schema model.

Do not treat a noisy baseline replay as proof that the local database is ready. The helper intentionally replays the checked-in baseline with `ON_ERROR_STOP=0` because of expected Supabase-managed ownership and default-privilege replay warnings.

## Local verification helper

Use:

```bash
npm run db:verify
```

What it does:
- checks a small set of launch-relevant schema objects after bootstrap
- fails clearly if key tables, RPCs, or storage helpers are missing
- gives a practical confidence signal on top of the intentionally noisy baseline replay

The current verification set covers:
- billing and entitlement launch fields/functions
- invite lifecycle surface
- security denied-event and observability surfaces
- document storage access helper
- dashboard / finance / portfolio aggregate RPCs
- payment write RPCs
- system notification side-effect RPC
- documents bucket presence

## Team-standard local workflow

Use this as the official rebuild path for local schema work:

```bash
npm run db:bootstrap
npm run db:verify
npm run test:integration:seed
npm run test:integration:run
```

If you want the first three steps together:

```bash
npm run db:ready
```

`db:ready` runs:
- `npm run db:bootstrap`
- `npm run db:verify`
- `npm run test:integration:seed`

It does not replace the full integration suite.

## Production SQL apply discipline

Production SQL apply remains an operator-controlled release step. Before applying repository SQL to a hosted environment, use [release-operations-checklist.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/release-operations-checklist.md) and record the output in [release-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/release-evidence-template.md).

Do not paste production database passwords into docs, issues, screenshots, or chat. The production `db:apply:repo` command requires the full Postgres connection string at runtime, but the credential should stay in the operator's secure secret store.

## Refreshing the checked-in baseline

Prerequisites:
- local Supabase is running
- your local database already reflects the authoritative current schema you want to preserve
- the placeholder snapshot migration has not been repurposed

Refresh the baseline:

```bash
npm run schema:baseline:refresh
```

What it does:
- dumps the current local Supabase schema
- normalizes dump-only noise like `\restrict` tokens
- overwrites [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
- refuses to run if the placeholder snapshot migration has been replaced with a dump

## Checking for drift

If you want to verify that the checked-in baseline still matches your current local authoritative schema:

```bash
npm run schema:baseline:check
```

This command fails if a regenerated normalized dump differs from the checked-in baseline.

## What not to do

- Do not trust baseline replay logs alone as a readiness signal.
- Do not refresh `baseline_schema.sql` from a half-updated local database.
- Do not apply overlays in arbitrary order.
- Do not treat [supabase/migrations/20260319114347_remote_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/migrations/20260319114347_remote_schema.sql) as the app bootstrap source.
- Do not hand-edit `baseline_schema.sql` when a dump-based refresh is possible.
- Do not assume overlays are already folded into baseline unless you have explicitly refreshed it afterward.
- Do not use backslash-escaped Windows paths from WSL shells for schema dump output; use the npm script instead.

## Verifying a baseline refresh is current

After refreshing the baseline:

1. run `npm run schema:baseline:check`
2. inspect diff for the expected RPC/function changes
3. rebuild a local DB from the baseline plus required overlays
4. run:

```bash
npm run test:unit:run
npm run test:integration:seed
npm run test:integration:run
```

## Known limitations

- this repo still relies on an explicit baseline + overlay model for local bootstrap
- it does not yet have a complete migration-only rebuild path
- overlay application order still matters
- the baseline refresh script assumes local Supabase CLI access and a running local stack

That limitation is deliberate and documented. A trustworthy semi-automated workflow is better than pretending the migration path is complete when it is not.
