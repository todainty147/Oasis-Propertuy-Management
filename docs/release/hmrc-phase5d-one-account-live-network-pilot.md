# HMRC Phase 5D One-Account Live Network Pilot

## Purpose

Phase 5D introduces a tightly controlled live-network pilot for UK Property Income & Expenses Period Summary submission. It is a pilot path for one allowlisted account only.

## Exact Scope

- UK Property Income & Expenses Period Summary only.
- One allowlisted account.
- One reviewed and locked quarterly draft.
- One valid Phase 5A consent record.
- Phase 5B pilot guard required.
- Phase 5C dry-run and endpoint skeleton required.
- Explicit operator-controlled network kill switches required.
- Production HMRC base URL only.
- Duplicate live submission prevention required.

## Out Of Scope

- No general rollout.
- No self-service live submit.
- No annual update.
- No final declaration.
- No amendment flow.
- No foreign property.
- No self-employment.

## Pilot Checklist

- Full suite passed.
- Focused HMRC tests passed.
- Build passed.
- Lint passed.
- Account explicitly allowlisted with a reason.
- `hmrc_mtd_live_submission` enabled only for the pilot account.
- `hmrc_mtd_live_submission_pilot` enabled only for the pilot account.
- `hmrc_mtd_live_submission_network_enabled` explicitly enabled only for the pilot account when ready.
- `HMRC_LIVE_NETWORK_ENABLED=true`.
- `HMRC_ENVIRONMENT=live`.
- `HMRC_BASE_URL=https://api.service.hmrc.gov.uk`.
- `HMRC_LIVE_SUBMISSION_ENABLED=true`.
- Draft reviewed and locked.
- No unresolved draft issues.
- Phase 5A consent valid for the same account, draft and user.
- Dry-run passed for the same account, draft and consent.
- Support runbook evidence marked passed.
- Rollback evidence marked passed.
- Operator approval evidence marked passed.

## Operator Process

1. Open the pilot account through root/operator tooling.
2. Confirm the account is the only enabled pilot account.
3. Select the reviewed and locked quarterly draft.
4. Confirm consent is valid and current.
5. Run dry-run mode.
6. Record support runbook evidence.
7. Record rollback evidence.
8. Record operator approval evidence.
9. Confirm production environment and kill switches.
10. Trigger `mode: "live_network"` with typed confirmation `LIVE PILOT`.

Landlords do not get a live submit button. The landlord-facing panel may show pilot status, dry-run status and receipt details, but it must not submit live data.

## Consent Dependency

The live pilot calls `assert_hmrc_live_submission_consent` through the Phase 5A helper. Consent must belong to the same account, draft and authenticated user, and all stored draft hashes must match the locked draft at submission time.

## Dry-Run Dependency

The live network path requires a successful `hmrc_live_submission_attempts` row with:

- `mode = 'dry_run'`
- `status = 'dry_run_passed'`
- same account
- same draft
- same consent

It also requires `hmrc_live_pilot_evidence` with `evidence_type = 'dry_run_passed'` and `evidence_status = 'passed'`.

## Duplicate Policy

- One successful `live_network` attempt per draft.
- In-progress `live_network` attempts block another attempt.
- Drafts already marked `live_submission_status = 'success'` are blocked.
- Dry-runs may be repeated.
- Failed live attempts require operator decision and audit review before retry.
- Accepted HMRC responses with local write failure must not be retried blindly.

## Failure Handling

All blocks and failures must return safe reasons only. Tokens, raw payloads and raw sensitive HMRC responses are not returned to the frontend.

If HMRC returns HTTP 204 or another accepted response with no body, show:

> HMRC accepted this update. No submission ID was returned by this endpoint.

If read-back fails after an accepted live pilot, the submission remains accepted and support should treat read-back as a verification follow-up.

## Rollback / Kill Switch

Disable any of the following to stop live network submission:

- account feature flag `hmrc_mtd_live_submission_network_enabled`
- Supabase secret `HMRC_LIVE_NETWORK_ENABLED`
- Supabase secret `HMRC_LIVE_SUBMISSION_ENABLED`
- pilot allowlist entry
- pilot account feature flags

`READY_FOR_GENERAL_LIVE_SUBMISSION` remains false.
