# Support Runbook: Contractor Access Problems

## Purpose

Diagnose cases where a contractor cannot see the right job, cannot update status, or cannot submit quote/invoice actions.

## Common Symptoms

- contractor portal is empty
- contractor can see the job but cannot submit quote or invoice
- contractor says they were assigned but still get denied

## Probable Causes

- `work_orders.contractor_user_id` does not match the signed-in contractor
- contractor row is inactive or linked to the wrong account
- quote/invoice action is blocked by workflow state, not by raw auth
- user is signed in with the wrong auth identity

## Required Access / Tools

- contractor user id
- work order id
- SQL access
- optionally hosted observability feed

## Diagnosis

1. Check recent denied rows or hosted events for:
   - `contractor_work_order_cards`
   - `contractor_allowed_actions`
   - `wo_fin_upsert_quote_draft`
   - `wo_fin_submit_quote`
   - `wo_fin_upsert_invoice`
   - `contractor_update_work_order`
2. Inspect the work order:

```sql
select id, account_id, contractor_user_id, status, acknowledgement_status
from public.work_orders
where id = 'WORK_ORDER_UUID'::uuid;
```

3. Inspect contractor linkage:

```sql
select id, account_id, user_id, active
from public.contractors
where user_id = 'USER_UUID'::uuid;
```

4. If finance workflow is involved, inspect `work_order_financials`.

## Safe Remediation

- if assignment is wrong, fix `contractor_user_id` only on the intended work order
- if contractor linkage is wrong or inactive, fix the contractor row on the correct account
- if the quote/invoice state is invalid, move it through the supported manager/contractor workflow rather than bypassing status gates

## Do Not Self-Remediate When

- the wrong contractor may already have seen sensitive job data
- the fix would require bypassing quote approval workflow
- multiple work orders are affected and the assignment source is unclear

## Post-Fix Verification

- contractor sees only assigned jobs
- contractor can perform the intended action
- other contractors still cannot mutate that work order

## Related Files

- [ContractorPortal.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [ContractorJobDetails.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/ContractorJobDetails.jsx)
- [workOrderFinancialsService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/workOrderFinancialsService.js)
