# Scheduled Functions / Observability Runbook

## Purpose

Use this when scheduled Edge Functions fail, are unauthorized, appear stuck, skip unexpectedly, or do not write expected observability events.

## Scope and current status

Scheduled jobs require `CRON_SECRET` and should write structured observability events. Some scheduled jobs are internal-only; customer-facing state must only change through the job’s approved RPC boundaries.

## Critical invariants

- Scheduled requests must authenticate with `CRON_SECRET`.
- `CRON_SECRET` is separate from module-specific automation secrets such as `AUTOMATION_ALL_ACCOUNTS_SECRET`.
- Service-role keys stay server-side only.
- Jobs record success/failure/skipped outcomes.
- Stale running jobs must be handled before a new run starts where the module defines run rows.
- Schedulers must not bypass domain-specific gates.

## Key files

- `scripts/deployCronFunctions.js`
- `supabase/functions/_shared/scheduledObservability.ts`
- `supabase/functions/check-regulatory-sources-scheduled/index.ts`
- `supabase/regulatory_monitoring_vs2_5_scheduled.sql`
- `tests/security/scheduledFunctionObservabilityContracts.test.js`
- `docs/SECURITY_OBSERVABILITY.md`
- `docs/runbooks/security-observability-feed.md`

## Data model / RPCs / functions

Relevant objects include scheduled observability events, module-specific run tables, module-specific boxed service-role RPCs, and security/failure logs.

### Functions to deploy

The cron deployment helper deploys the scheduled/background function set:

```bash
npm run functions:cron:deploy -- --project-ref <project-ref> --secret "<cron-secret>"
```

The scheduled set currently includes:

- `sync-operational-automation`
- `send-reminder-emails`
- `send-sms-notifications`
- `cleanup-security-audit-exports`
- `cleanup-security-observability-events`
- `check-regulatory-sources-scheduled`

Monitoring also has an operator-triggered function:

```bash
npx supabase functions deploy check-regulatory-source
```

That operator function is intentionally not part of the scheduled helper because it uses the logged-in user/root-operator path, not `CRON_SECRET`.

### Secret configuration

Set the shared scheduled-function secret:

```bash
npx supabase secrets set CRON_SECRET="<cron-secret>"
```

The cron request must provide the same value using either:

```text
x-cron-secret: <cron-secret>
```

or:

```text
Authorization: Bearer <cron-secret>
```

Do not confuse this with module-specific secrets. For example:

```bash
npx supabase secrets set AUTOMATION_ALL_ACCOUNTS_SECRET="<automation-secret>"
```

does not set or replace `CRON_SECRET`. Keep both secrets independent unless engineering deliberately changes the authentication model.

Module-specific scheduled functions may also need their own environment variables. For regulatory monitoring, set and verify the Monitoring secrets documented in `docs/runbooks/regulatory-monitoring-operations.md`, especially:

- `REGULATORY_SOURCE_ALLOWED_HOSTS`
- `REGULATORY_SOURCE_FETCH_TIMEOUT_MS`
- `REGULATORY_SOURCE_MAX_BYTES`
- `REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES`

## Normal operation

1. Scheduler invokes Edge Function with `CRON_SECRET`.
2. Function validates the secret.
3. Function uses boxed service-role RPCs for scoped work.
4. Function records completion/failure observability.
5. Domain read models update only within approved scope.

## Common failure modes

- Missing/incorrect `CRON_SECRET`: unauthorized or 500 configuration error.
- Stuck run: previous run remains `running`.
- Skipped job: overlap or configured guard.
- Failed job: provider/database/domain error.
- No observability event: helper not used or function exited too early.

## Triage checklist

1. Confirm scheduler name, environment, and expected cadence.
2. Check Edge Function logs for auth/config errors.
3. Check scheduled observability event for latest run.
4. Check module-specific run table if present.
5. Confirm no customer-impacting side effect bypassed product gates.

## Safe operator actions

- Rotate/update `CRON_SECRET` via secret management.
- Re-run manually with approved cron authentication in staging.
- Mark stale runs failed only through approved RPC or reviewed migration.

## Unsafe actions / never do

- Do not expose service-role key or cron secret.
- Do not call service-role RPCs from browser/client code.
- Do not manually set downstream compliance/billing/evidence state to compensate for a failed scheduler.

## Customer-safe wording

“A scheduled background check did not complete as expected. We are checking the run record and retry conditions before taking any action.”

## Escalation

Escalate for repeated unauthorized cron attempts, stuck runs that cannot be marked failed, missing observability events, or customer-impacting writes outside the intended scheduler scope.

## Recovery / rollback notes

Use module-specific recovery. For regulatory monitoring, stale running jobs are failed before new runs and scheduler output stops at internal candidate creation.

## Verification after fix

- Function logs show accepted cron auth.
- Observability event exists.
- Run record is completed, failed, or skipped.
- Domain state changed only as expected.

## Related tests

- `tests/security/scheduledFunctionObservabilityContracts.test.js`
- Module-specific scheduled contracts, such as `tests/security/regulatoryMonitoringVs25Contracts.test.js`.
