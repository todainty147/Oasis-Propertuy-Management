# Support Runbook: Permission Issues

## Purpose

Resolve tickets where a user claims they cannot access a screen, account, or action they expect to have.

## Common Symptoms

- “I cannot open Security Audit / Command Center / Finance”
- “I lost access after switching accounts”
- “My colleague can see it but I cannot”

## Probable Causes

- wrong active account
- wrong role in `account_members`
- user is actually a tenant/contractor, not a manager-role member
- expected behavior from `assert_manage_account_access(...)`

## Required Access / Tools

- user id
- target `account_id`
- Security Audit page or SQL access

## Diagnosis

1. Confirm the exact screen/action and the expected account.
2. Check recent denied rows for the user.
3. Inspect account membership:

```sql
select account_id, user_id, role
from public.account_members
where user_id = 'USER_UUID'::uuid
order by account_id;
```

4. Confirm whether the user is actually linked as a tenant or contractor instead.

## Safe Remediation

- if the user is on the wrong account, instruct them to switch accounts
- if the role is wrong, correct only the single target membership row
- if the user is tenant/contractor only, explain the expected limitation rather than broadening access

## Do Not Self-Remediate When

- the request would elevate a user beyond the approved business role
- the account ownership or root context is unclear
- there are multiple conflicting membership rows that need reconciliation

## Post-Fix Verification

- user can access the intended surface
- user still cannot access other accounts or restricted manager-only surfaces they should not see

## Related Files

- [permissions.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/utils/permissions.js)
- [AccountContext.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/context/AccountContext.jsx)
- [security-denied-events.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-denied-events.md)
