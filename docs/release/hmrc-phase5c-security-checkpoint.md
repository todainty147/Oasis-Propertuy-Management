# HMRC Phase 5C Security Checkpoint

Date: 2026-06-04

This checkpoint records the safety state after the controlled live endpoint skeleton and dry-run layer were added.

Phase 5C is an endpoint skeleton and dry-run control layer. It does not make Tenaqo live-submission ready.

## Current State

- Phase 4 sandbox UK property period summary submission is complete.
- Phase 4 sandbox read-back verification is complete.
- Phase 5A consent framework is complete.
- Phase 5B controlled live pilot cage is complete.
- Phase 5C endpoint skeleton is implemented.
- `dry_run` mode exists.
- `dry_run` feature flag seeds `false`.
- `live_network` cannot be called from the frontend.
- Live network kill switch exists.
- No public live submit button exists.
- `READY_FOR_LIVE_SUBMISSION` remains `false`.

## Review Findings And Resolutions

### 1. Dry-run flag seeded true globally

Finding: `hmrc_mtd_live_submission_dry_run` was previously seeded `true` for all accounts while being treated as an account-flag-only HMRC feature.

Resolution:

- The flag now seeds `false`.
- The flag is wired through entitlement and feature evaluation.
- UI dry-run readiness requires the flag.
- The live endpoint skeleton checks `hmrc_mtd_live_submission_dry_run` before allowing dry-run execution.

### 2. Success event could turn accepted HMRC response into client error

Finding: `writeLiveEvent` after `markDraftLiveSubmitted` could throw after HMRC acceptance and draft success marking, causing the client to receive an error even though HMRC accepted the request.

Resolution:

- The success event now uses `safeWriteLiveEvent`.
- Event logging failure no longer changes the accepted response returned to the client.

### 3. `completeLiveAttempt` failure can leave attempt stuck in `started`

Finding: If HMRC accepted a future `live_network` request but `completeLiveAttempt` failed, the attempt could remain in `started`; the duplicate guard would then block retries.

Resolution:

- This is deliberately preserved as a hard DB failure.
- The conservative behavior prevents accidental duplicate live submissions.
- The support runbook documents the “HMRC accepted but local success write failed” recovery path.

### 4. Kill-switch catch block could mask original error

Finding: `assertLiveNetworkKillSwitchEnabled` catch-path event writes could throw and replace the original `live_network_disabled` reason with an audit write error.

Resolution:

- Catch-path event writes now use `safeWriteLiveEvent`.
- The original `live_network_disabled` error is preserved.

### 5. Env var naming divergence

Finding: Phase 5C initially read `HMRC_LIVE_SUBMISSION_ENV` while the shared HMRC edge helper uses `HMRC_LIVE_SUBMISSION_ENABLED`.

Resolution:

- Phase 5C now uses the shared `HMRC_LIVE_SUBMISSION_ENABLED` name.
- Live network remains blocked unless the shared live-submission flag is explicitly `true`.

## Gate Status

- `READY_FOR_PHASE_5A` can only pass when all Phase 5A evidence is true.
- `READY_FOR_PHASE_5B` can only pass when all Phase 5B evidence is true.
- `READY_FOR_PHASE_5C` can only pass when all Phase 5C evidence is true.
- `READY_FOR_LIVE_SUBMISSION` remains hardcoded `false`.

## Before Phase 5D

Do not begin Phase 5D live network pilot work until:

- Focused HMRC tests pass.
- Build passes.
- Lint has no new errors.
- Full-suite failures are either fixed or documented as non-blocking.
- No permission, RLS, rent/income, export, staging, or RPC-performance failures remain unresolved without a formal waiver.
