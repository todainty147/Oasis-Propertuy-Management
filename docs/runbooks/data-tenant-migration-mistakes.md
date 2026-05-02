# Data Runbook: Tenant Migration Mistakes

## Purpose

Repair tenant rows moved to the wrong account/property or imported with broken user linkage.

## Common Symptoms

- tenant sees the wrong dashboard/property
- finance snapshot is empty or belongs to another account
- work orders or maintenance requests reference the wrong tenant
- support says “this tenant disappeared after a migration”

## Probable Causes

- tenant row moved without moving linked payments/requests/documents
- `tenants.user_id` linked to the wrong auth user
- tenant was assigned to the wrong property or account during import

## Required Access / Tools

- SQL access
- source account id
- target account id if a move was intended
- tenant id and user id

## Diagnosis

1. Inspect the tenant row:

```sql
select id, account_id, user_id, property_id, status, archived_at
from public.tenants
where id = 'TENANT_UUID'::uuid;
```

2. Check linked rows:
   - `payments.tenant_id`
   - `maintenance_requests.reported_by_tenant_id`
   - `documents.tenant_id`
3. Confirm the correct account/property from business context before editing anything.

## Safe Remediation

- if the tenant should remain in the same account, correct `property_id` and linked child rows only within that account
- if the tenant truly moved accounts, treat it as a controlled migration:
  - update the tenant row
  - update linked child rows carefully
  - verify no old account surfaces still reference the tenant
- if `user_id` is wrong, correct only after confirming the auth identity with support

## Do Not Self-Remediate When

- the move crosses accounts and child-row ownership is unclear
- multiple tenants share one auth user unexpectedly
- the migration touched contracts/payments without a reconciliation source

## Post-Fix Verification

- tenant can sign in and see only the intended property/account-scoped data
- finance/activity feeds resolve correctly
- no other tenant or account lost access unexpectedly

## Related Files

- [dashboardService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/dashboardService.js)
- [financeService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/financeService.js)
- [tenantTimelineService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/tenantTimelineService.js)
