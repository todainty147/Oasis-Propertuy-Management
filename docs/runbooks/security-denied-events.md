# Security Runbook: Denied Events

## Purpose

Diagnose authorization failures that surface through `public.security_denied_events`, app-side structured logs, or guard-function exceptions.

## Common Symptoms

- manager-only page returns `Access denied`
- tenant sees manager feed errors
- contractor workflow mutation is rejected
- support reports “it worked before, now I’m blocked”

## Probable Causes

- wrong account selected
- missing or incorrect `account_members.role`
- tenant/contractor is linked to the wrong account
- target row belongs to a different account than the caller expects
- denial came from `assert_manage_account_access(...)` or `assert_tenant_scope_access(...)`

## Required Access / Tools

- Supabase SQL editor or psql
- Security Audit page
- access to `public.security_denied_events`
- optionally access to browser console logs for `[security-observe]`

## Diagnosis

1. Confirm the user id and active `account_id`.
2. Inspect recent denied rows:

```sql
select created_at, event, reason, actor_user_id, actor_role, account_id, entity_type, entity_id, metadata
from public.security_denied_events
where actor_user_id = 'USER_UUID'::uuid
order by created_at desc
limit 50;
```

3. If no durable row exists, check the app/browser log for `[security-observe]`.
4. If the row shows `event = assert_manage_account_access`:
   - check `account_members` for the actor and target account.
5. If the row shows `event = assert_tenant_scope_access`:
   - check tenant linkage and whether the requested `tenant_id` matches the signed-in user’s tenant.
6. If the row references `entity_type` and `entity_id`, inspect that row directly and confirm its `account_id`.

## Safe Remediation

- Fix the membership or linkage row, not the guard function.
- If the user should not have access, close the ticket as expected behavior.
- If `account_members.role` is wrong, update only the affected row on the correct `account_id`.
- If a tenant/contractor is linked to the wrong account, use the tenant/contractor-specific runbook before changing it.

## Do Not Self-Remediate When

- the denial affects a root account or cross-account ownership
- multiple accounts show the same symptom at once
- the issue involves suspicious privilege escalation
- the remediation would require broad role changes without a ticketed approval

## Post-Fix Verification

- repeat the original action in the app
- confirm the denial no longer appears
- confirm no other account gained access unexpectedly
- if the failure should remain denied, confirm the denied row still lands with the expected reason

## Related Files

- [security_denied_event_stream.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/security_denied_event_stream.sql)
- [securityFailureLogger.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/securityFailureLogger.js)
- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
