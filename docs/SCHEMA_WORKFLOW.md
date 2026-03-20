# Schema Workflow

This repo does not use checked-in migrations as the primary local bootstrap source.

The current source of truth for local schema bootstrapping is:

1. [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
2. additive overlay SQL files applied after baseline when they are newer or intentionally separate, for example:
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
2. Load [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql).
3. Apply required overlays after the baseline.
4. Seed the integration harness if needed.

Example overlay order for the current repo:

1. `supabase/account_invitations_saas.sql`
2. `supabase/security_failure_observability.sql`
3. any other additive overlay you are actively testing

This is intentionally explicit. Do not assume `supabase db reset` alone reconstructs the full app schema in this repo.

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
