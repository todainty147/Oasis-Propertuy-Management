# AI Lease Auditor Operations

Use this when a lease audit is missing, findings are not saving, overall risk is not updating, the lease list is not loading, or a user cannot access the auditor.

## What this slice does

The Lease Auditor (`/compliance/leases`) is a manual-entry review tool. It does not yet perform automated AI clause scanning — that requires text extraction infrastructure not yet built (see L-028 in the limitations doc). What it does:

- Lists all active leases for the account
- Shows the latest audit status per lease (pending / processing / complete / failed / stale)
- Lets managers create an audit record and add findings (clause reference, risk level, category, explanation)
- Automatically computes `overall_risk` on the audit as findings are added or dismissed
- Shows renewal and expiry countdown per lease

Requires **pro** plan or above (the highest compliance gate in the suite).

## Runtime pieces

Required migrations (apply in order):

```
supabase/compliance_suite_phase0.sql
supabase/account_entitlements.sql
supabase/compliance_security_hardening.sql
supabase/compliance_hardening_phase7.sql
```

Services:

- [src/services/leaseAuditService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/leaseAuditService.js)
- [src/services/leaseService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/leaseService.js)

Page:

- [src/pages/compliance/LeaseAuditorPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/compliance/LeaseAuditorPage.jsx)

Known open limitations:

- [docs/COMPLIANCE_SUITE_LIMITATIONS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/COMPLIANCE_SUITE_LIMITATIONS.md) — L-028 (no AI extraction yet), L-004 (no document text column)

## First checks

```sql
select public.account_subscription_plan('<account_id>');
select public.account_feature_required_plan('ai_lease_auditor');
-- expected: 'pro'
```

The page shows `FeatureAccessCard` for growth and starter plans. This is expected — the Lease Auditor is pro-only.

## Lease list is empty

The lease list reads from `public.leases` (via `listLeases`).

Inspect leases:

```sql
select id, property_id, tenant_id, lease_start_date, lease_end_date,
       renewal_status, created_at
from public.leases
where account_id = '<account_id>'
order by lease_start_date desc
limit 20;
```

If rows exist but the UI shows none, confirm the authenticated user has a manage role for the account. Tenants and contractors cannot see this page.

The lease list loads in pages of 50 and has a "Load more" button (Phase 6). If only the first 50 are visible, scroll to the bottom and load more.

## Audit status column shows no badge for a lease

The page calls `get_latest_audits_by_lease` to batch-load the most recent audit per lease. If the column is blank, no audit has been created for that lease yet.

Create an audit from the "Start audit" action in the lease row.

Inspect existing audits:

```sql
select id, lease_id, status, overall_risk, note, created_at, updated_at
from public.lease_audits
where account_id = '<account_id>'
order by created_at desc
limit 20;
```

## Finding is saved but overall_risk is not updating

`recomputeOverallRisk` runs after every `createLeaseAuditFinding`, `dismissLeaseAuditFinding`, and `restoreLeaseAuditFinding`. It queries active findings for the audit and writes the highest `risk_level` back to `lease_audits.overall_risk`.

If `overall_risk` remains null after adding a finding, the Phase 6 fix has not been deployed.

Manually verify the finding was saved:

```sql
select id, audit_id, clause_ref, risk_level, category, dismissed_at, created_at
from public.lease_audit_findings
where account_id = '<account_id>'
  and audit_id = '<audit_id>'
order by created_at desc;
```

Check the audit row:

```sql
select id, lease_id, status, overall_risk, updated_at
from public.lease_audits
where id = '<audit_id>';
```

If findings exist but `overall_risk = null`, re-apply `compliance_security_hardening.sql` (which contains the Phase 5/6 RPCs) and retry.

## Finding cannot be dismissed or restored

Dismiss and restore are RPC calls that enforce `ai_lease_auditor` entitlement. A 403 here means the account plan is below pro.

```
assert_account_feature_access: feature 'ai_lease_auditor' not available on plan 'growth'
```

Upgrade the account to pro, or use a pro test account.

## Audit status stuck at "processing"

The audit status moves to `processing` when a manager updates it manually. There is no background job that transitions it back. Managers must explicitly set the status to `complete` from the audit detail view.

If a manager set the status to `processing` and wants to revert:

```sql
-- Safe: only the RPC path enforces entitlement; direct update for support/root use only
update public.lease_audits
set status = 'pending', updated_at = now()
where id = '<audit_id>'
  and account_id = '<account_id>';
```

## "No active lease for this tenant" or renewal data looks wrong

Lease expiry and renewal countdown are derived from `lease_end_date` and `renewal_status` in the `leases` table. If dates are wrong:

```sql
select id, tenant_id, lease_start_date, lease_end_date,
       renewal_status, renewal_in_progress
from public.leases
where account_id = '<account_id>'
  and id = '<lease_id>';
```

Correct the dates via the Properties → Tenant Details page in the app, or directly:

```sql
update public.leases
set lease_end_date = '<new_date>', updated_at = now()
where id = '<lease_id>'
  and account_id = '<account_id>';
```

## "AI audit" button is missing

The AI clause scanning button is not built yet (L-028). There is no `generate-lease-audit` edge function. All findings must be added manually. This is expected until the document text extraction pipeline is extended to feed extracted lease text into an AI auditor function.
