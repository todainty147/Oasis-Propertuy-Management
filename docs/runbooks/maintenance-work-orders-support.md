# Maintenance / Work Orders / Contractor Support Guide

## Purpose

Use this guide for tenant maintenance requests, work order lifecycle, contractor assignment/visibility, preferred suppliers, quote flow, and contractor portal issues.

## Scope and current status

Maintenance and work orders are customer-facing operational workflows. AI suggestions and contractor recommendations are support aids, not guaranteed decisions.

## Critical invariants

- Tenant sees only their own property/request context.
- Contractor sees only assigned or authorized work orders.
- Preferred supplier intelligence must not leak across accounts.
- Work order state should move through supported workflow actions.
- Attachments must remain account and work-order scoped.

## Key files

- `src/pages/MaintenanceInboxPage.jsx`
- `src/pages/WorkOrderDetails.jsx`
- `src/pages/ContractorPortal.jsx`
- `src/services/maintenanceService.js`
- `src/services/workOrderService.js`
- `src/services/contractorWorkOrderService.js`
- `src/services/contractorRecommendationService.js`
- `supabase/maintenance_*.sql`
- `supabase/work_order_*.sql`
- `supabase/contractor_*.sql`
- `docs/runbooks/support-contractor-access.md`
- `docs/runbooks/ai-maintenance-triage-operations.md`

## Data model / RPCs / functions

Relevant objects include maintenance requests, work orders, work order assignments, contractor directory rows, ratings/preferred supplier signals, attachments, and workflow status helpers.

## Normal operation

1. Tenant or manager creates maintenance request.
2. Manager triages and creates/assigns work order.
3. Contractor sees authorized job and updates status/quotes where allowed.
4. Attachments and financials remain scoped to the account/work order.

## Common failure modes

- Tenant cannot create request: tenant account/property linkage or portal permission issue.
- Contractor cannot see work order: assignment, contractor user link, or account mismatch.
- Status stuck: workflow action not allowed for current state/role.
- Recommendation missing: insufficient account history, provider failure, or quota issue.
- Attachment missing: storage policy/path mismatch.

## Triage checklist

1. Confirm account, property, tenant, request, work order, and contractor ids.
2. Verify tenant/contractor `user_id` linkage.
3. Inspect current work order status and allowed actions.
4. Check assignment and contractor account ownership.
5. Check attachment storage path and RLS if files are involved.
6. For AI/recommendations, check quota/provider runbook.

## Safe operator actions

- Reassign contractor through supported UI/RPC.
- Ask manager to move status using allowed workflow action.
- Re-link contractor/tenant user when invite evidence supports it.

## Unsafe actions / never do

- Do not expose another account’s contractor history.
- Do not manually skip workflow guards.
- Do not move work orders by direct SQL unless engineering owns a migration/fix.

## Customer-safe wording

“We are checking the request, work order, assignment, and portal permissions. Contractor recommendations are assistance signals and may fall back when data is unavailable.”

## Escalation

Escalate for cross-account visibility, broken workflow guards, contractor access to unassigned jobs, or repeated attachment storage failures.

## Recovery / rollback notes

Use supported reassignment/status actions. Preserve history for status mistakes.

## Verification after fix

- Correct actor can see intended work order/request.
- Incorrect actor remains denied.
- Status/action history reflects the supported action.

## Related tests

- Maintenance, work-order, contractor, attachment, and AI triage tests under `tests/security` and `tests/e2e`.
