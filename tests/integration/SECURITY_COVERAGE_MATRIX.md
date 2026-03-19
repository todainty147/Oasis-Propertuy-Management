# OASIS Security Test Coverage Matrix

This matrix tracks the important security-sensitive database and RPC surfaces in OASIS, what currently enforces them, and whether they already have real authenticated integration coverage.

Coverage status legend:
- `Integrated` = covered by the local authenticated Supabase integration suite
- `Partial` = some enforcement exists, but no direct integration test or only adjacent coverage exists
- `Manual / app-enforced` = currently relies on app behavior, indirect RLS, or manual validation
- `Gap` = important surface with no meaningful automated security coverage yet

## Current automated integration coverage

| Surface | Type | Expected roles | Enforcement layer | Automated coverage status | Notes / known gaps | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| `dashboard_snapshot` | Read RPC | owner, admin, staff, tenant(self) | `assert_tenant_scope_access(...)` | Integrated | Cross-account deny, tenant deny, omitted tenant scope, and foreign tenant zeroed state covered | Keep current coverage |
| `finance_snapshot` | Read RPC | owner, admin, staff, tenant(self) | `assert_tenant_scope_access(...)` | Integrated | Cross-account deny, tenant deny, omitted tenant scope, and foreign tenant zeroed state covered | Keep current coverage |
| `tenant_activity_feed` | Read RPC | owner, admin, staff, tenant(self) | `assert_tenant_scope_access(...)` | Integrated | Cross-tenant deny, manager foreign-tenant empty state, and limit clamping covered | Keep current coverage |
| `command_center_items` | Read RPC | owner, admin, staff | `assert_manage_account_access(...)` | Integrated | Tenant and contractor denial covered | Keep current coverage |
| `attention_center_items` | Read RPC | owner, admin, staff | `assert_manage_account_access(...)` | Integrated | Tenant and contractor denial covered | Keep current coverage |
| `portfolio_attention_items` | Read RPC | owner, admin, staff, tenant(self) | `assert_tenant_scope_access(...)` | Integrated | Tenant self-scope and foreign-tenant empty state covered | Keep current coverage |
| `portfolio_health_snapshot` | Read RPC | owner, admin, staff, tenant(self) | `assert_tenant_scope_access(...)` | Integrated | Tenant self-scope and foreign-tenant zeroed state covered | Keep current coverage |
| `contractor_work_order_cards` | Read RPC | assigned contractor | `auth.uid()` contractor filter | Integrated | Non-contractor empty result behavior covered honestly | Keep current coverage |
| `create_notifications` | Write RPC | owner, admin, staff | RPC guard + recipient validation | Integrated | Cross-account and tenant denial covered; persisted rows asserted | Keep current coverage |
| `security_anomaly_alert_apply` | Write RPC | owner, admin, staff, root(active account) | `assert_manage_account_access(...)` + audit trail | Integrated | Contractor denial and ledger append covered | Keep current coverage |
| `work_order_set_status` | Write RPC | owner, admin, staff; tenant limited cancellation request path | RPC guard + audit triggers | Integrated | Tenant audit-only cancellation path covered | Keep current coverage |
| `contractor_update_work_order_status` | Write RPC | assigned contractor | contractor-only RPC guard | Integrated | Wrong-role and cross-account denial covered | Keep current coverage |
| `accept_account_invite` | Write RPC | invited authenticated user | invite token + email + revoke + expiry checks | Integrated | Replay, revoked, mismatch, invalid token, expiry, and persisted membership covered | Keep current coverage |
| `wo_fin_upsert_quote_draft` | Write RPC | assigned contractor | contractor-only RPC guard | Integrated | Non-assigned contractor and non-contractor denial covered | Keep current coverage |
| `wo_fin_submit_quote` | Write RPC | assigned contractor | contractor-only RPC guard | Integrated | Owner and tenant denial covered | Keep current coverage |
| `wo_fin_reject_quote` | Write RPC | owner, admin, staff | manager-only RPC guard | Integrated | Cross-account denial covered through real submitted quote flow | Keep current coverage |
| `wo_fin_approve_quote` | Write RPC | owner, admin, staff | manager-only RPC guard | Integrated | Cross-account denial covered | Keep current coverage |
| `wo_fin_upsert_invoice` | Write RPC | assigned contractor after approval | contractor-only RPC guard + quote approval precondition | Integrated | Pre-approval denial and post-approval success covered | Keep current coverage |

## Important protected surfaces with only partial or adjacent coverage

| Surface | Type | Expected roles | Enforcement layer | Automated coverage status | Notes / known gaps | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| `account_member_set_role` | Write RPC | owner, admin (within rules) | role transition RPC guard | Partial | Adjacent invite acceptance role changes are covered, but direct membership role mutation is not integration tested | Add direct role-mutation integration tests |
| `check_account_invitation_eligibility` | Read/validate RPC | owner, admin, staff, root flows | eligibility RPC guard | Partial | Acceptance path is covered; pre-invite validation matrix is not | Add invite eligibility integration tests |
| `create_landlord_invitation` | Write RPC | root account only | root operator + account guard | Partial | Root invite flow exists, but local suite does not cover landlord account creation invite security | Add root/operator invite integration tests |
| `request_security_audit_export` | Write RPC | owner, admin, staff | `assert_manage_account_access(...)` + export job RLS | Partial | Security audit UI is exercised indirectly, but export request permissions are not directly integration tested | Add export-job request integration tests |
| `preventive_maintenance_attention` | Read RPC | owner, admin, staff | manager-scoped guard | Partial | KPI dashboard exercises it in app, but no direct integration isolation tests exist | Add direct preventive maintenance RPC tests |
| `maintenance_kpi_snapshot` | Read RPC | owner, admin, staff | manager-scoped guard | Partial | App consumes it; suite does not verify isolation or edge cases directly | Add direct integration tests |
| `playbook_status_snapshot` | Read RPC | owner, admin, staff | manager-scoped guard | Partial | CI does not currently protect automation/playbook access boundaries | Add direct integration tests |
| `lease_attention_items` | Read RPC | owner, admin, staff | manager-scoped guard | Partial | Lease-sensitive feed exists, but no local integration coverage | Add direct integration tests |
| `dashboard_hub_extras` | Read RPC | owner, admin, staff, tenant(self) | account / tenant scope helpers | Partial | Similar to dashboard snapshot but not covered explicitly | Add direct integration tests |

## High-risk app flows or policy-protected tables still not directly covered

| Surface | Type | Expected roles | Enforcement layer | Automated coverage status | Notes / known gaps | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| `documents` + `create_document_stub` / `finalize_document_upload` / `delete_document_and_audit` / `set_document_tags` | App flow + write RPCs + table RLS | owner, admin, staff; tenant/member depending on flow | RPC guards + document/storage audit path | Gap | Document deletion is security-sensitive and anomaly-linked; current suite does not verify cross-account or wrong-role document writes | Add document lifecycle integration tests |
| `work_order_attachments` / maintenance attachment storage policies | Table/storage policies | owner, admin, staff, tenant uploader, assigned contractor | RLS + storage bucket policies | Gap | Attachment access is security-sensitive but currently only app/manual tested | Add table/storage integration tests for attachment metadata paths |
| `payments` write RPCs (`create_payment`, `update_payment`, `delete_payment`, `mark_payment_paid`, `mark_payment_unpaid`) | Write RPCs | owner, admin; tenant read only | RPC guards + table RLS | Gap | Finance data is high-value and not yet covered end-to-end in the integration suite | Add payment write authorization tests |
| `maintenance_requests` direct insert/update/read table flows | Table RLS + app flow | tenant(self property), owner, admin, staff | RLS policies | Gap | Tenant insert/read/update security is important; current suite only covers downstream snapshot/feed reads | Add maintenance request direct table integration tests |
| `work_order_assign_contractor` / `work_order_approve_tenant_cancellation` / `work_order_deny_tenant_cancellation` | Write RPCs | owner, admin, staff | manager-only RPC guard | Gap | Related work order paths are covered, but assignment and tenant cancellation decision flows are not | Add direct work order workflow integration tests |
| `root_list_accounts` / `root_set_account_disabled` / `root_delete_account` | Root-only write/read RPCs | root operator | root + active account model | Gap | Very sensitive admin surfaces with no local integration coverage | Add root operator integration tests |
| `create_self_serve_landlord_account` | Write RPC | authenticated signup actor | self-serve provisioning RPC | Gap | High-impact account creation path not yet covered | Add self-serve signup integration tests |
| `contractor_update_work_order` | Write RPC | assigned contractor | contractor-only RPC guard | Gap | Contractor portal uses this broader mutation path; current suite only covers the stricter status RPC | Add direct contractor update integration tests |
| `contractor_allowed_actions` / `work_order_allowed_actions` / `work_order_allowed_actions_bulk` | Read RPCs | contractor/member/tenant depending on work order | permission computation RPCs | Gap | UI depends on these for action gating; only downstream writes are covered today | Add action-gating integration tests |
| `account_invitations` direct table CRUD via RLS | Table policies | owner, admin, staff | table RLS policies | Gap | Acceptance path is covered, but invitation creation/revoke/list security is only app-driven today | Add table-level invitation CRUD integration tests |

## Covered vs uncovered summary

### Strongly covered today
- core account and tenant isolation snapshot/feed surfaces
- manager-only operational feeds
- contractor read isolation
- core notification and security-alert writes
- work order transition writes
- invite acceptance and membership security
- contractor quote / invoice workflow mutations

### Still mostly uncovered
- document lifecycle and attachment policy paths
- payments write flows
- direct maintenance request table/RLS behavior
- root operator / self-serve provisioning flows
- invitation creation/revocation/list RLS
- broader work-order permission helper RPCs and assignment flows

## Top 5 remaining high-risk gaps

1. **Document lifecycle security**  
   `create_document_stub`, `finalize_document_upload`, `set_document_tags`, and `delete_document_and_audit` touch sensitive tenant/account data and feed security audit trails, but have no direct integration coverage yet.

2. **Payment write authorization**  
   `create_payment`, `update_payment`, `delete_payment`, `mark_payment_paid`, and `mark_payment_unpaid` are financially sensitive and currently lack end-to-end authenticated mutation coverage.

3. **Attachment and storage policy enforcement**  
   `work_order_attachments` and maintenance-request attachment policies are high-risk because cross-account file access mistakes are easy to miss without real integration tests.

4. **Invitation creation / revoke / eligibility enforcement**  
   Invite acceptance is covered well, but the manager/staff invite creation and revoke table/RPC paths are still only indirectly validated through the app.

5. **Root / account-provisioning surfaces**  
   `create_landlord_invitation`, `root_list_accounts`, `root_set_account_disabled`, `root_delete_account`, and `create_self_serve_landlord_account` are privileged account-boundary surfaces with no automated integration checks yet.

## Recommended next actions

1. Add document lifecycle and attachment integration tests.
2. Add payment write-path authorization tests.
3. Add invite creation/revoke/eligibility integration tests.
4. Add work-order assignment / tenant-cancellation decision integration tests.
5. Add root/operator and self-serve provisioning integration tests.
