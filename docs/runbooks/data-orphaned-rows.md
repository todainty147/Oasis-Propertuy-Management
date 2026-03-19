# Data Runbook: Orphaned Rows

## Purpose

Repair rows that no longer point cleanly at the expected account, property, tenant, contractor, or work-order chain.

## Common Symptoms

- dashboard or finance snapshot omits an expected row
- work order exists but contractor/tenant/property references look broken
- a document or payment appears detached from the expected account scope

## Probable Causes

- partial manual SQL edits
- bad imports
- failed migrations
- historical schema drift

## Required Access / Tools

- SQL access
- account id and entity ids from the ticket
- integration/schema docs if needed

## Diagnosis

1. Confirm the target `account_id`.
2. Inspect the row and its parent references.
3. Verify each foreign-key-like business link points back to the same account.

Examples:

```sql
select id, account_id, property_id, tenant_id
from public.payments
where id = 'PAYMENT_UUID'::uuid;
```

```sql
select id, account_id, property_id, maintenance_request_id, contractor_user_id
from public.work_orders
where id = 'WORK_ORDER_UUID'::uuid;
```

## Safe Remediation

- prefer fixing the smallest incorrect row
- keep all linked rows on the same `account_id`
- if the correct parent row is unclear, stop and escalate
- record the before/after values in the ticket

## Do Not Self-Remediate When

- multiple accounts appear mixed together
- you would need broad bulk updates without a reconciliation source of truth
- the repair touches security-sensitive ownership rows without product approval

## Post-Fix Verification

- the row appears in the expected account-scoped UI
- cross-account visibility is still blocked
- key snapshots/feeds now include the repaired data only in the correct account

## Related Files

- [baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
- [SECURITY_COVERAGE_MATRIX.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/SECURITY_COVERAGE_MATRIX.md)
