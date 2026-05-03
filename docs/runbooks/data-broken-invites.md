# Data Runbook: Broken Invites

## Purpose

Repair invitation rows that are revoked unexpectedly, duplicated, stale, or attached to the wrong account.

## Common Symptoms

- invite link exists but cannot be accepted
- user receives multiple conflicting invites
- invite belongs to the wrong account
- support sees `already_accepted`, `revoked`, or `expired` confusion

## Probable Causes

- duplicate invitation creation
- stale invite rows after a role/account change
- manual edits to `account_invitations`
- user invited to the wrong account or wrong email

## Required Access / Tools

- SQL access
- target `account_id`
- invited email
- invitation id or token from the support case

## Diagnosis

1. Inspect invite rows for the email and account:

```sql
select id, account_id, email, role, invited_by, accepted_by, accepted_at, revoked_at, expires_at, token, created_at
from public.account_invitations
where lower(email) = lower('user@example.com')
order by created_at desc;
```

2. Check whether a matching `account_members` row already exists.
3. Confirm the intended target account and role with the ticket/request source.

## Safe Remediation

- if the wrong invite was created, revoke that invite row instead of reusing it
- if membership already exists correctly, revoke or ignore stale duplicate invites
- if the invite is simply stale/expired, create a new invite through the supported app flow
- do not hand-edit tokens unless there is an explicit recovery plan and full approval

## Do Not Self-Remediate When

- the invite would grant owner/root-level access and approval is missing
- the correct target account is uncertain
- there are signs of malicious or repeated invite abuse

## Post-Fix Verification

- the intended invite can be accepted once
- wrong/old invites no longer grant access
- resulting membership appears only on the intended account

## Related Files

- [account_invitations_saas.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_invitations_saas.sql)
- [invitationService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/invitationService.js)
- [support-invite-token-failures.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-invite-token-failures.md)
