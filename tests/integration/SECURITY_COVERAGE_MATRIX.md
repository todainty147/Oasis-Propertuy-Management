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
| `account_member_set_role` | Write RPC | owner, admin (within rules) | role transition RPC guard | Integrated | Owner promotion/demotion syncs `role` and `role_id`; forbidden staff escalation covered | Keep current coverage |
| `check_account_invitation_eligibility` | Read/validate RPC | owner, admin, staff, root flows | eligibility RPC guard | Integrated | Duplicate invite, existing member, revoked-then-eligible, and effective-role drift coverage exists | Keep current coverage |
| `create_landlord_invitation` | Write RPC | root account only | root operator + account guard | Integrated | Root landlord account provisioning, support membership, owner invite, anonymous/ordinary/non-root denial, duplicate invite denial, and existing-owner denial covered | Keep current coverage |
| `request_security_audit_export` | Write RPC | owner, admin, staff | `assert_manage_account_access(...)` + export job RLS | Integrated | Manager queue, retention/label normalization, cross-account/non-manager denial, unsupported format no-write, RLS select isolation, and spoofed requester insert denial covered | Keep current coverage |
| `preventive_maintenance_attention` | Read RPC | owner, admin, staff | manager-scoped guard | Integrated | Manager success, seeded due-soon row, cross-account denial, tenant denial, and contractor denial covered | Keep current coverage |
| `maintenance_kpi_snapshot` | Read RPC | owner, admin, staff | manager-scoped guard + feature gate | Integrated | Manager success, KPI payload shape, cross-account denial, tenant denial, and contractor denial covered | Keep current coverage |
| `playbook_status_snapshot` | Read RPC | owner, admin, staff | manager-scoped guard + feature gate | Integrated | Manager success with settings/runs/executions, cross-account denial, tenant denial, and contractor denial covered | Keep current coverage |
| `lease_attention_items` | Read RPC | owner, admin, staff | manager-scoped guard | Integrated | Manager success with expiring lease row, cross-account denial, tenant denial, and contractor denial covered | Keep current coverage |
| `dashboard_hub_extras` | Read RPC | owner, admin, staff, tenant(self) | account / tenant scope helpers | Integrated | Manager success, tenant self-scope success, omitted tenant-scope denial, foreign tenant-scope denial, and tenant property scoping covered | Keep current coverage |

## High-risk app flows or policy-protected tables still not directly covered

| Surface | Type | Expected roles | Enforcement layer | Automated coverage status | Notes / known gaps | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| `documents` + `create_document_stub` / `finalize_document_upload` / `delete_document_and_audit` / `set_document_tags` | App flow + write RPCs + table RLS | owner, admin, staff; tenant/member depending on flow | RPC guards + document/storage audit path | Integrated | Cross-account document reads, tenant self-scope reads, tenant cross-scope denial, direct download allow/deny behavior, signed URL allow/deny behavior, wrong-account uploads, tag mutation audit, tenant/contractor tag denial, owner deletion audit, and staff/tenant delete denial are covered. | Keep current coverage |
| `work_order_attachments` / maintenance attachment storage policies | Table/storage policies | owner, admin, staff, tenant uploader, assigned contractor | RLS + storage bucket policies | Integrated | Work-order assigned-contractor reads, cross-work-order denial, maintenance-request tenant/manager upload-read-sign-delete, assigned-contractor read-only access, tenant foreign/closed-request denial, contractor upload/delete denial, and malformed-path denial are covered. | Keep current coverage |
| `payments` write RPCs (`create_payment`, `update_payment`, `delete_payment`, `mark_payment_paid`, `mark_payment_unpaid`, `void_payment`, `reopen_payment`) | Write RPCs | owner, admin; owner-only delete; tenant read only | RPC guards + table RLS + payment/ledger event triggers | Integrated | In-account owner/admin create-update-status flows, owner-only delete, admin delete denial, staff/tenant/contractor/cross-account denial, ledger cleanup, and payment event side effects are covered. | Keep current coverage |
| `maintenance_requests` direct insert/update/read table flows | Table RLS + app flow | tenant(self property), owner, admin, staff | RLS policies + tenant auto-stamp trigger | Integrated | Manager in-account read/write/delete, tenant self-property read/create with auto `reported_by_tenant_id`, tenant spoof/cross-property denial, contractor invisibility, tenant/contractor/cross-account mutation denial, and persisted unchanged state are covered. | Keep current coverage |
| `work_order_assign_contractor` / `work_order_approve_tenant_cancellation` / `work_order_deny_tenant_cancellation` | Write RPCs | owner, admin, staff | manager-only RPC guard | Integrated | Manager contractor assignment, cross-role/cross-account assignment denial, foreign contractor denial, tenant cancellation approve/deny, non-manager decision denial, cross-account decision denial, missing pending request denial, audit rows, and unchanged-state assertions are covered. | Keep current coverage |
| `root_list_accounts` / `root_set_account_disabled` / `root_delete_account` | Root-only write/read RPCs | root operator | root + active account model | Integrated | Root list/disable/restore/delete, root self-protection, non-root denial, related-data delete denial, and audit append behavior covered | Keep current coverage |
| `create_self_serve_landlord_account` | Write RPC | authenticated signup actor | self-serve provisioning RPC | Integrated | Clean-user creation, idempotence, non-owner self-escalation denial, anonymous denial, non-root account shape, owner role assignment, no root membership, and optional sandbox profile creation covered | Keep current coverage |
| `get_account_sandbox_status` | Read RPC | owner, admin, staff, root(active account) | `assert_manage_account_access(...)` | Integrated | Demo-mode status shape and anonymous denial covered through self-serve sandbox provisioning flow | Keep current coverage |
| `contractor_update_work_order` | Write RPC | assigned contractor | contractor-only RPC guard | Integrated | Assigned contractor status/notes/schedule success, note-only update, invalid status rollback, wrong-role denial, foreign contractor denial, and cross-account denial covered | Keep current coverage |
| `contractor_allowed_actions` / `work_order_allowed_actions` / `work_order_allowed_actions_bulk` | Read RPCs | contractor/member/tenant depending on work order | permission computation RPCs | Integrated | Manager, tenant, assigned-contractor, foreign-work-order, terminal-state, and bulk foreign-ID omission behavior covered | Keep current coverage |
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
- No high-risk app-flow gaps are currently tracked in this matrix.

## Top remaining high-risk gaps

No high-risk gaps remain in this matrix after the current coverage pass.

## Recommended next actions

1. Keep running the focused integration suites when changing security-sensitive SQL, RLS, RPC, or storage policy paths.
