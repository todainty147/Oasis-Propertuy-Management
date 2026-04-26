# Account Sandbox Profiles

Phase 3 starts with a small, explicit account-level sandbox contract.

## What Exists

- `account_sandbox_profiles` stores whether an account is `production` or `demo`.
- `get_account_sandbox_status(account_id)` returns a manager-safe status row for the active account.
- `create_self_serve_landlord_account(account_name, sandbox_mode)` can mark new self-serve accounts as demo/sandbox.
- Existing accounts default to production behavior when no profile row exists.

## Current Product Behavior

The signup page can mark a newly created landlord account as a sandbox. When the signup succeeds, OASIS now attempts to seed a deterministic demo dataset for that new account.

The onboarding page shows a demo-mode notice when the active account has sandbox status and gives the owner a safe way to:

- load demo fixtures if the initial seed did not complete
- reset the demo account back to the default seeded state

The seeded demo dataset currently includes:

- occupied and vacant properties
- a tenant
- a contractor directory entry
- due and overdue payments
- open and waiting maintenance requests
- an assigned work order
- compliance items
- a lease
- operating expense facts
- a document request when the document-request tables are available

## Remaining Follow-up

- Expand demo fixtures further if we want deeper document/signature examples or richer tenant-side walkthroughs.
- Decide whether demo expiry should archive, disable, or soft-warn before reset.
- Add any support-team tooling needed for remote reseed / inspection workflows.
