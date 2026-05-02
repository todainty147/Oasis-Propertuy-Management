# Support Runbook: Invite Token Failures

## Purpose

Handle user-facing invite errors such as invalid token, expired invite, revoked invite, email mismatch, or replay behavior.

## Common Symptoms

- “Invite token is invalid”
- “Invite expired”
- “This invite was revoked”
- “I accepted already but the link still behaves strangely”
- “The email link opens, but I still cannot join”

## Probable Causes

- token is stale, expired, revoked, or already accepted
- user is signed in with a different email than the invite target
- duplicate invite rows exist
- support copied the wrong token/account from another case

## Required Access / Tools

- invitation id or token
- invited email
- target account id
- SQL access

## Diagnosis

1. Inspect the invitation row:

```sql
select id, account_id, email, role, accepted_at, accepted_by, revoked_at, expires_at, created_at
from public.account_invitations
where token = 'INVITE_TOKEN';
```

2. Check whether the target user already has a membership row on the same account.
3. Confirm the signed-in user email matches the invite email.
4. Check hosted or denied events for `accept_account_invite`.

## Safe Remediation

- if expired: create a fresh invite instead of changing `expires_at` on the old one
- if revoked: create a new invite only after confirming the revoke was intentional or stale
- if already accepted: verify membership exists and send the user to normal sign-in/account switching instead of issuing another token immediately
- if email mismatch: have the user sign in with the invited email or issue a new invite to the correct email

## Do Not Self-Remediate When

- the invite would grant owner/root access without approval
- the email identity is disputed
- there are repeated failures that suggest abuse or phishing

## Post-Fix Verification

- the user can accept the new or corrected invite once
- `account_members` contains only the intended membership row
- old/revoked/stale invites no longer grant access

## Related Files

- [Invite.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Invite.jsx)
- [account_invitations_saas.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_invitations_saas.sql)
- [accept_account_invite.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/accept_account_invite.test.js)
