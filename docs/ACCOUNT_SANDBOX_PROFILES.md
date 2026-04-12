# Account Sandbox Profiles

Phase 3 starts with a small, explicit account-level sandbox contract.

## What Exists

- `account_sandbox_profiles` stores whether an account is `production` or `demo`.
- `get_account_sandbox_status(account_id)` returns a manager-safe status row for the active account.
- `create_self_serve_landlord_account(account_name, sandbox_mode)` can mark new self-serve accounts as demo/sandbox.
- Existing accounts default to production behavior when no profile row exists.

## Current Product Behavior

The signup page can mark a newly created landlord account as a sandbox. The onboarding page shows a demo-mode notice when the active account has sandbox status.

This first slice does not seed demo fixtures or reset data yet. That is deliberate: the account identity layer now exists, so reset/fixture automation can target only accounts explicitly marked as demo.

## Next Slice

- Create deterministic demo fixture seeding for sandbox accounts.
- Add reset-request semantics that only operate on `mode = 'demo'`.
- Add E2E coverage for the signup-to-onboarding demo path once fixture reset is available.
