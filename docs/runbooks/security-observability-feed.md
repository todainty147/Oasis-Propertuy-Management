# Security Runbook: Observability Feed

## Purpose

Use the hosted security observability feed to inspect recent centralized authorization and workflow failures for a single account.

## Common Symptoms

- support needs a timeline of denied events for one account
- staging/prod diagnosis requires more than browser console logs
- an engineer needs scrubbed correlation ids for escalation

## Probable Causes

- real authorization denials
- invite failures
- contractor workflow denials
- document/storage failures with app-side correlation
- unexpected backend/runtime errors on guarded surfaces

## Required Access / Tools

- manager access to the target account
- Security Audit page
- or SQL access to `public.security_observability_event_feed(...)`

## Diagnosis

1. Open `Settings -> Security Audit`.
2. Use the `Hosted Observability Events` card.
3. Filter by:
   - `Category`
   - `Kind`
   - `Surface`
   - `Limit`
4. If you need SQL parity, click `Copy SQL`.
5. If you need a file, click `Export CSV`.
6. For direct SQL:

```sql
select *
from public.security_observability_event_feed(
  'ACCOUNT_UUID'::uuid,
  null,
  null,
  null,
  50
);
```

## Safe Remediation

- do not edit hosted rows; they are append-only
- use the feed to identify the failing surface, actor role, reason code, and correlation id
- then move to the more specific runbook for remediation

## Do Not Self-Remediate When

- the feed points to cross-account anomalies or suspicious role changes
- the event category suggests a broader incident pattern
- the only evidence is in provider-side systems and the app-side correlation is incomplete

## Post-Fix Verification

- repeat the user action
- confirm the same failure no longer appears, or now appears with the correct denial reason if it should remain blocked
- export the filtered rows if the incident needs a ticket artifact

## Related Files

- [security_observability_events.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/security_observability_events.sql)
- [securityObservabilityService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/securityObservabilityService.js)
- [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md)
