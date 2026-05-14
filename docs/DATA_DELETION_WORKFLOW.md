# OASIS Data Deletion Workflow

This workflow covers user account deletion, membership removal, workspace closure, tenant data erasure, and contractor data erasure.

## Request Types

| Request type | Scope | Who can submit | Typical result |
| --- | --- | --- | --- |
| `user_account_deletion` | `user` | The signed-in user | Revoke devices, delete notifications, remove memberships where appropriate, anonymise profile, schedule auth deletion. |
| `membership_removal` | `user` | The signed-in user, account owner/admin | Remove user membership from one account without destroying operational records. |
| `workspace_closure` | `account` | Account owner/admin or root | Set account to `closure_pending`, review retention, restrict access, later close/delete according to policy. |
| `tenant_data_erasure` | `tenant` | The tenant user or account owner/admin/root | Anonymise tenant profile/contact fields, retain finance/legal/compliance records. |
| `contractor_data_erasure` | `contractor` | The contractor user or account owner/admin/root | Anonymise contractor profile/contact fields, revoke devices, retain work order/invoice history. |

## State Machine

1. `submitted`
2. `identity_verification_required`
3. `pending_admin_review`
4. `pending_retention_review`
5. `approved`
6. `scheduled`
7. `completed` or `partially_completed`
8. `rejected` or `cancelled`

Only privileged server-side functions should move a request into processing states. Client UI may submit and view requests, but not delete operational records directly.

## User Account Deletion

1. User opens Settings -> Data & Privacy.
2. User selects account deletion, enters optional reason, checks confirmation, and types `DELETE`.
3. OASIS creates `data_deletion_requests`.
4. Reviewer verifies identity, account scope, and legal holds.
5. Processor revokes device tokens, deletes eligible notifications, removes memberships where appropriate, anonymises profile/tenant/contractor rows, logs retained finance/audit/compliance records, and schedules auth-user deletion if allowed.

## Membership Removal

1. User or owner/admin requests removal from an account.
2. OASIS verifies the requester can act on the target membership.
3. Membership is removed by the privileged processor.
4. Operational records remain account-owned and continue to show minimised labels where needed.

## Workspace Closure

1. Owner/admin requests workspace closure.
2. OASIS records `workspace_closure_requested` and sets status to `closure_pending` after approval.
3. Retention review identifies finance, document, compliance, tax, audit, security, billing, and legal records.
4. Access is restricted and active device tokens are revoked for affected users where appropriate.
5. Account moves to `closed`, `deletion_scheduled`, or `deleted` only through privileged review.

## Tenant Erasure

Tenant erasure may not remove tenancy history, payment records, compliance evidence, or safety records. OASIS should anonymise tenant contact fields and free-text personal notes where safe while retaining the operational record with minimised identifiers.

## Contractor Erasure

Contractor erasure may not remove work order history, invoice evidence, warranty records, or safety records. OASIS should anonymise contractor contact fields, revoke tokens, deactivate contractor profiles, and retain work order references where required.

## Processor Steps

1. Load request.
2. Verify requester, role, and scope.
3. Build retention summary.
4. Revoke active sessions if auth admin support exists.
5. Revoke/delete device tokens.
6. Remove memberships where applicable.
7. Anonymise user profile fields where present.
8. Anonymise tenant/contractor profile fields where present.
9. Delete eligible notification records.
10. Delete or restrict eligible documents according to retention rules.
11. Retain finance/audit/compliance records with minimisation.
12. Write processing logs for every action.
13. Update request status.
14. Send email/notification if email system exists.

## Risk Controls

- No client-side direct deletion of finance, audit, compliance, document, maintenance, or work order records.
- Use RLS and RPC guards for all request creation, review, and processing.
- Finance ledger remains append-only.
- Audit/security records remain append-only and minimised.
- Cross-account access is denied by request RLS and processor checks.
