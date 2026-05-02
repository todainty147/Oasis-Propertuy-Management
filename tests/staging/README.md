# Staging Security Smoke

This is a lightweight pre-release verification layer for a deployed non-local OASIS environment.

It is intentionally much smaller than the local integration suite. The goal is release confidence, not full duplication.

## What it checks

- in-account staff read access on a manager-only feed
- tenant self-scoped read access
- contractor self-scoped workflow visibility
- one critical denied write path
- one invite acceptance sanity check

Current smoke file:
- `tests/staging/securitySmoke.test.js`

## Environment assumptions

The staging environment should contain the same deterministic fixture identities and account/tenant/work-order ids used by the local integration suite:
- account A / account B
- staff A
- tenant A1
- contractor A1
- owner B

Expected env vars:
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY` when seeding the deterministic fixture users/data
- `STAGING_USER_PASSWORD`

The fixture users in staging should share the same known password value supplied via `STAGING_USER_PASSWORD`.

## Local usage

Create `.env.staging.local` from `.env.staging.example`, then run:

```bash
npm run test:staging:run
```

If your staging project does not already contain the deterministic fixture users and account data expected by the smoke suite, seed them first:

```bash
npm run staging:seed:fixtures
```

To run just the staging smoke file:

```bash
npm run test:staging:file -- tests/staging/securitySmoke.test.js
```

For the manual staging-side performance pass on deferred index candidates, use:

- [tests/staging/PERFORMANCE_EXPLAIN.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN.md)
- [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql)

## CI / release usage

The staging workflow is intended for manual release verification, not PR fan-out. Run it against the staging environment before promoting to production.

If the staging dataset drifts away from the deterministic fixture ids used here, update the staging seed process or the smoke assumptions before treating failures as app regressions.
