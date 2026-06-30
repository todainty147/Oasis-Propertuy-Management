# Auth / Roles / Isolation Triage Guide

## Purpose

Use this guide when a user, tenant, contractor, staff member, or root operator sees access denial, missing account data, wrong role behavior, or suspected cross-account leakage.

## Scope and current status

Auth and isolation are production-critical across all modules. Never weaken RLS, security-definer guards, or role checks to diagnose an issue.

## Critical invariants

- Every account-scoped read/write must be authorized for the current actor.
- Tenant and contractor portals must not expose manager-only or other-account data.
- Root/operator access must be explicit and auditable.
- Staff permissions must respect custom role keys.
- SECURITY DEFINER functions must contain their own account guard.

## Key files

- `src/services/accountMemberService.js`
- `src/services/roleManagementService.js`
- `src/services/rpcContracts.js`
- `src/pages/RolesManagementPage.jsx`
- `supabase/custom_staff_roles*.sql`
- `supabase/account_member_permission_keys.sql`
- `supabase/account_role_compatibility_helpers.sql`
- `supabase/root_support_account_access.sql`
- `docs/runbooks/support-permission-issues.md`
- `docs/runbooks/security-denied-events.md`

## Data model / RPCs / functions

Relevant objects include account members, custom staff roles, permission keys, tenant/contractor user links, root operator grants, invitations, and account switching state.

## Normal operation

1. User authenticates.
2. App resolves active account and role.
3. RLS and RPC guards enforce account and role access.
4. Denied access records observability events where wired.

## Common failure modes

- User is in the wrong active account.
- Invite accepted but tenant/contractor row is not linked to auth user.
- Staff role lacks required permission key.
- Root support grant expired or missing.
- RPC guard rejects because account id does not match resource ownership.
- RLS denial is correct but UI copy is unclear.

## Triage checklist

1. Confirm auth user id, active account id, and reported route/action.
2. Inspect account membership and effective role.
3. Inspect custom role permission keys if staff.
4. For tenant/contractor, verify row `user_id` and account linkage.
5. Check denied-event/security observability logs.
6. If an RPC failed, confirm both caller account and target resource account.

## Safe operator actions

- Reissue invite.
- Correct tenant/contractor user linkage if evidence shows invite linkage failed.
- Adjust staff role permissions through the supported role UI/RPC.
- Create time-limited root support grant through approved flow.

## Unsafe actions / never do

- Do not disable RLS.
- Do not change resource `account_id` to “make it visible”.
- Do not grant root/operator access without approval.
- Do not use service role from browser or support console.

## Customer-safe wording

“We are checking the account membership and role permissions for the account you are trying to access. We will not bypass account isolation while investigating.”

## Escalation

Escalate any suspected cross-account data exposure, incorrect tenant/contractor visibility, SECURITY DEFINER guard gap, or unexplained root access.

## Recovery / rollback notes

Keep corrections account-scoped and reversible. Record the before/after rows and evidence for invite or linkage fixes.

## Verification after fix

- User can access intended account/action only.
- Same user cannot access other-account resources.
- Denied logs stop for intended action or show correct denial for blocked action.

## Related tests

- Access-control, RLS, tenant/contractor, and RPC contract tests under `tests/security`.
