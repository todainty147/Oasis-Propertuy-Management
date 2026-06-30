# Regulatory Monitoring Operations Runbook

## Purpose

Regulatory Monitoring tracks selected regulatory sources, detects opaque source changes, and creates internal candidates for review. It does not automatically update customer obligations or replace legal review.

## Scope and current status

- VS-1: review-gated candidate to canonical change/rule loop.
- VS-2: source register and operator-triggered source check.
- VS-2.5: scheduled trigger over the same source-check helper.
- Monitoring output remains internal until Gate A and Gate B complete.

## Critical invariants

- Candidates are internal-only detection/review objects.
- Scheduled and operator source checks share the same fetch/SSRF/hash helper.
- Scheduler uses `CRON_SECRET` and boxed service-role RPCs; it does not mint a root user session.
- `CRON_SECRET` is the scheduler authentication secret. It is not the same as `AUTOMATION_ALL_ACCOUNTS_SECRET`, which is scoped to the operational automation all-accounts flow.
- Scheduled detection stops at `regulatory_change_candidate.status = new`.
- No Gate A, Gate B, RPE, obligation, notification, or customer write is performed by scheduler RPCs.
- Source content is treated as opaque data, not legal interpretation.

## Key files

- `src/services/regulatoryMonitoringService.js`
- `supabase/regulatory_monitoring_vs1_intake.sql`
- `supabase/regulatory_monitoring_vs2_sources.sql`
- `supabase/regulatory_monitoring_vs2_5_scheduled.sql`
- `supabase/functions/check-regulatory-source/index.ts`
- `supabase/functions/check-regulatory-sources-scheduled/index.ts`
- `supabase/functions/_shared/regulatorySourceCheck.ts`
- `tests/security/regulatoryMonitoringVs1Contracts.test.js`
- `tests/security/regulatoryMonitoringVs2Contracts.test.js`
- `tests/security/regulatoryMonitoringVs25Contracts.test.js`

## Data model / RPCs / functions

Objects include `regulatory_change_candidate`, `regulatory_change`, `impact_rule`, `regulatory_source`, `regulatory_source_scheduled_run`, operator source-check RPCs, scheduled boxed RPCs, and provenance events.

### Deployment checklist

Apply the database overlays in dependency order:

```bash
npm run db:apply:repo
```

The repo apply script includes the Monitoring overlays:

1. `supabase/regulatory_monitoring_vs1_intake.sql`
2. `supabase/regulatory_monitoring_vs2_sources.sql`
3. `supabase/regulatory_monitoring_vs2_5_scheduled.sql`

Deploy both Monitoring Edge Functions:

```bash
npx supabase functions deploy check-regulatory-source
npx supabase functions deploy check-regulatory-sources-scheduled
```

`supabase/functions/_shared/regulatorySourceCheck.ts` is shared code bundled by those deployments; it is not deployed as a standalone function.

If using the cron deployment helper, `scripts/deployCronFunctions.js` deploys the scheduled Monitoring function as part of the cron function set:

```bash
npm run functions:cron:deploy -- --project-ref <project-ref> --secret "<cron-secret>"
```

The operator-triggered function `check-regulatory-source` is not a cron function and should still be deployed explicitly when changed.

Deploy the frontend/app if `src/services/regulatoryMonitoringService.js` or any UI consumer changes.

### Secret configuration

Set the standard Supabase Edge Function secrets used by the project:

```bash
npx supabase secrets set \
  SUPABASE_URL="https://<project-ref>.supabase.co" \
  SUPABASE_ANON_KEY="<anon-key>" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  ALLOWED_APP_ORIGINS="https://<app-domain>"
```

Set the shared scheduled-function secret:

```bash
npx supabase secrets set CRON_SECRET="<cron-secret>"
```

The cron request must send the same value as either:

```text
x-cron-secret: <cron-secret>
```

or:

```text
Authorization: Bearer <cron-secret>
```

Do not substitute `AUTOMATION_ALL_ACCOUNTS_SECRET` for `CRON_SECRET`. `AUTOMATION_ALL_ACCOUNTS_SECRET` is a separate automation-specific secret and does not authenticate the regulatory source scheduler.

Set the Monitoring-specific fetch controls:

```bash
npx supabase secrets set \
  REGULATORY_SOURCE_ALLOWED_HOSTS="www.gov.uk,gov.uk,legislation.gov.uk" \
  REGULATORY_SOURCE_FETCH_TIMEOUT_MS="10000" \
  REGULATORY_SOURCE_MAX_BYTES="1048576" \
  REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES="120"
```

Only include hostnames, not full URLs or paths. Include both apex and `www` forms when a source may redirect between them.

Monitoring environment variables:

| Secret / env var | Required for | Purpose | Default / notes |
|---|---|---|---|
| `SUPABASE_URL` | Both functions | Supabase project URL | Required |
| `SUPABASE_ANON_KEY` | `check-regulatory-source` | Verifies operator JWT path | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | `check-regulatory-sources-scheduled` | Calls boxed scheduler RPCs | Required; server-side only |
| `ALLOWED_APP_ORIGINS` | `check-regulatory-source` | CORS for operator-triggered calls | Required for browser use |
| `CRON_SECRET` | `check-regulatory-sources-scheduled` | Authenticates scheduled trigger | Required; distinct from `AUTOMATION_ALL_ACCOUNTS_SECRET` |
| `REGULATORY_SOURCE_ALLOWED_HOSTS` | Both functions | SSRF/redirect allowlist | Defaults to `www.gov.uk,gov.uk,legislation.gov.uk` |
| `REGULATORY_SOURCE_FETCH_TIMEOUT_MS` | Both functions | Fetch timeout | Defaults to `10000`; clamped by function guard |
| `REGULATORY_SOURCE_MAX_BYTES` | Both functions | Max downloaded bytes | Defaults to `1048576`; clamped by function guard |
| `REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES` | Scheduled function | Marks stale running jobs failed before new run | Defaults to `120`; clamped by function guard |

For the currently proposed source list, use hostnames only:

```bash
npx supabase secrets set REGULATORY_SOURCE_ALLOWED_HOSTS="www.gov.uk,gov.uk,legislation.gov.uk,www.planningportal.co.uk,planningportal.co.uk,www.housing-ombudsman.org.uk,housing-ombudsman.org.uk,www.housing.org.uk,housing.org.uk"
```

Notes on the proposed URLs:

- `https://www.gov.uk/browse/housing-local-services` and `https://www.gov.uk/government/collections/regulatory-standards-for-landlords` require `www.gov.uk` and usually also `gov.uk` for redirect tolerance.
- `https://www.planningportal.co.uk/` requires `www.planningportal.co.uk`; include `planningportal.co.uk` if redirects may use the apex host.
- `https://www.housing-ombudsman.org.uk/centre-for-learning/key-topics/awaabs-law/` requires `www.housing-ombudsman.org.uk`; include `housing-ombudsman.org.uk` if redirects may use the apex host.
- `https://www.housing.org.uk/` requires `www.housing.org.uk`; include `housing.org.uk` if redirects may use the apex host.

### Cron setup

Schedule the function endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/check-regulatory-sources-scheduled
```

Send either:

```text
x-cron-secret: <cron-secret>
```

or:

```text
Authorization: Bearer <cron-secret>
```

The scheduler may use `POST` with an empty JSON body:

```json
{}
```

The scheduled path must only call the scheduled Edge Function. It must not call operator-only RPCs, Gate A/B approval RPCs, RPE evaluation RPCs, obligation reconciliation RPCs, or customer notification/export paths.

## Normal operation

1. A root/internal operator creates or reviews a candidate.
2. Gate A creates a reviewed regulatory change.
3. Gate B creates an approved impact rule.
4. Operator or scheduler checks selected source content.
5. If the source hash changes, a new internal candidate is created for review.

## Common failure modes

- Fetch failed: DNS, timeout, HTTP error, content-type/size guard, or SSRF guard.
- Source inactive: checks should be rejected.
- Hash changed: candidate should be created or deduplicated.
- Duplicate candidate: idempotency should return existing candidate linkage.
- Scheduler stuck running: stale run should be marked failed before new run.
- Candidate leaked: customer-facing surfaces must not reference candidate or scheduled run internals.

## Triage checklist

1. Confirm source id, account id, source status, and trigger type.
2. Check latest `regulatory_source` status and hash fields.
3. Check scheduled run status if trigger was scheduled.
4. Read provenance events for source checked, change detected, candidate created, and scheduled run events.
5. Confirm no downstream rule/evaluation/obligation write occurred from the scheduler.

## Safe operator actions

- Re-run operator source check as a root operator.
- Mark a stale scheduled run failed through the approved scheduler path.
- Review or reject candidates through Gate A/Gate B workflows.

## Unsafe actions / never do

- Do not create approved rules directly from a detected source change.
- Do not bypass SSRF guards or fetch unapproved URLs.
- Do not expose candidates to landlord/tenant/contractor surfaces.
- Do not use service-role scheduled RPCs from a browser session.

## Customer-safe wording

“Tenaqo tracks selected sources and can flag detected changes for internal review. A detected change is not applied to customer obligations until it is reviewed and approved.”

## Escalation

Escalate for SSRF guard bypass suspicion, scheduler authentication failures, duplicate candidates that are not idempotent, candidate leakage, or any downstream customer-impacting write from monitoring.

## Recovery / rollback notes

Disable or set source status inactive if a source is unsafe/noisy. Preserve source check and candidate history.

## Verification after fix

- Source check records success or safe failure.
- Changed hash creates or links one candidate.
- Scheduler run reaches completed, failed, or skipped.
- Customer surfaces do not show internal candidate/scheduler data.

## Related tests

- `tests/security/regulatoryMonitoringVs1Contracts.test.js`
- `tests/security/regulatoryMonitoringVs2Contracts.test.js`
- `tests/security/regulatoryMonitoringVs25Contracts.test.js`
- `tests/security/scheduledFunctionObservabilityContracts.test.js`
