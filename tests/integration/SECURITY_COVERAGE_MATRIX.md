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
| `documents` + `create_document_stub` / `finalize_document_upload` / `delete_document_and_audit` / `set_document_tags` | App flow + write RPCs + table RLS | owner, admin, staff; tenant/member depending on flow | RPC guards + document/storage audit path | Partial | Cross-account document reads, tenant self-scope reads, tenant cross-scope denial, download access, wrong-account uploads, tag mutation audit, tenant/contractor tag denial, owner deletion audit, and staff/tenant delete denial are now covered. Raw client `createSignedUrl()` on the local `documents` bucket still returns `Object not found` even when the object exists and service-role download succeeds, so signed-URL behavior remains a local/provider-specific gap. | Separately investigate local `documents` signed-url behavior |
| `work_order_attachments` / maintenance attachment storage policies | Table/storage policies | owner, admin, staff, tenant uploader, assigned contractor | RLS + storage bucket policies | Partial | Assigned-contractor attachment reads, cross-work-order denial, and storage signed URL enforcement are now covered. Maintenance-request attachment policies are still not directly integration tested. | Add maintenance-request attachment integration tests |
| `payments` write RPCs (`create_payment`, `update_payment`, `delete_payment`, `mark_payment_paid`, `mark_payment_unpaid`, `void_payment`, `reopen_payment`) | Write RPCs | owner, admin; owner-only delete; tenant read only | RPC guards + table RLS + payment/ledger event triggers | Integrated | In-account owner/admin create-update-status flows, owner-only delete, admin delete denial, staff/tenant/contractor/cross-account denial, ledger cleanup, and payment event side effects are covered. | Keep current coverage |
| `maintenance_requests` direct insert/update/read table flows | Table RLS + app flow | tenant(self property), owner, admin, staff | RLS policies + tenant auto-stamp trigger | Integrated | Manager in-account read/write/delete, tenant self-property read/create with auto `reported_by_tenant_id`, tenant spoof/cross-property denial, contractor invisibility, tenant/contractor/cross-account mutation denial, and persisted unchanged state are covered. | Keep current coverage |
| `work_order_assign_contractor` / `work_order_approve_tenant_cancellation` / `work_order_deny_tenant_cancellation` | Write RPCs | owner, admin, staff | manager-only RPC guard | Gap | Related work order paths are covered, but assignment and tenant cancellation decision flows are not | Add direct work order workflow integration tests |
| `root_list_accounts` / `root_set_account_disabled` / `root_delete_account` | Root-only write/read RPCs | root operator | root + active account model | Integrated | Root list/disable/restore/delete, root self-protection, non-root denial, related-data delete denial, and audit append behavior covered | Keep current coverage |
| `create_self_serve_landlord_account` | Write RPC | authenticated signup actor | self-serve provisioning RPC | Integrated | Clean-user creation, idempotence, non-owner self-escalation denial, anonymous denial, non-root account shape, owner role assignment, and no root membership covered | Keep current coverage |
| `contractor_update_work_order` | Write RPC | assigned contractor | contractor-only RPC guard | Gap | Contractor portal uses this broader mutation path; current suite only covers the stricter status RPC | Add direct contractor update integration tests |
| `contractor_allowed_actions` / `work_order_allowed_actions` / `work_order_allowed_actions_bulk` | Read RPCs | contractor/member/tenant depending on work order | permission computation RPCs | Gap | UI depends on these for action gating; only downstream writes are covered today | Add action-gating integration tests |
| `account_invitations` direct table CRUD via RLS + `check_account_invitation_eligibility` + `create_landlord_invitation` | Table policies + eligibility/provisioning RPCs | owner, admin, staff; root owner for landlord invite path | table RLS policies + RPC guards | Integrated | Create/revoke/list account scoping, eligibility duplicate/member checks, invite acceptance, root landlord provisioning, root-only denial, owner invitation shape, duplicate landlord invite denial, existing-owner denial, and support membership behavior are covered. | Keep current coverage |

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
- attachment policy paths and local document signed-url behavior
- broader work-order permission helper RPCs and assignment flows

## Top 5 remaining high-risk gaps

1. **Attachment and storage policy enforcement**  
   Contractor attachment reads are now covered, but maintenance-request attachment policies still need direct integration coverage.

2. **Work-order assignment and tenant-cancellation decisions**  
   Work-order status changes and contractor quote/invoice paths are covered, but manager assignment and tenant-cancellation decision RPCs still need direct authorization coverage.

3. **Contractor action helper coverage**  
   The UI depends on allowed-action helper RPCs for gating, but direct helper coverage still needs to prove tenant/member/contractor outputs cannot drift from write guards.

4. **Direct account/member mutation utilities**  
   Membership role mutation, invite eligibility preflight, security audit export request, and operational manager-only read RPCs still have partial rather than direct matrix coverage.

5. **Manager-only operational snapshot RPCs**  
   Preventive maintenance, maintenance KPI, playbook status, lease attention, and dashboard hub extras still have partial coverage rather than direct isolation tests.

## Recommended next actions

1. Add maintenance-request attachment integration tests.
2. Add work-order assignment / tenant-cancellation decision integration tests.
3. Add contractor/work-order allowed-action helper integration tests.
4. Add account/member mutation and security-audit export integration tests.
5. Add manager-only operational snapshot RPC isolation tests.
