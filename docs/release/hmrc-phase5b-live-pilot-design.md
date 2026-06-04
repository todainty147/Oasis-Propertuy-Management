# HMRC Phase 5B Live Pilot Design

This phase adds controlled pilot design controls only. It does not enable live HMRC submission, add a live submission button, or create a production write endpoint.

## Scope

- Live pilot allowlist table.
- Root/operator controlled allowlist mutation RPC.
- Live pilot pre-flight helper.
- Readiness-only UI panel.
- Readiness gate extension for Phase 5B.
- Support runbook scenarios for pilot requests and failures.

## Controls

- `hmrc_mtd_live_submission` remains disabled by default.
- `hmrc_mtd_live_submission_pilot` remains disabled by default.
- `hmrc_mtd_live_submission_allowlist` remains disabled by default.
- `hmrc_mtd_live_submission_operator_controls` remains disabled by default.
- No account is allowlisted by default.
- Normal landlord users cannot self-enable pilot access.
- Tenants and contractors cannot read or mutate the pilot allowlist.

## Pre-Flight Guard

`assertHmrcLiveSubmissionPilotAllowed(...)` checks:

- live submission feature flag
- pilot feature flag
- account allowlist
- owner/admin role
- reviewed and locked draft
- no unresolved draft issues
- valid Phase 5A consent
- same-account, same-draft and same-user consent
- live HMRC connection
- token presence for live connection
- production HMRC base URL
- no sandbox base URL
- support runbook evidence
- no duplicate successful live submission marker

The guard does not submit anything to HMRC.

## UI

Quarterly draft detail shows a disabled panel titled `Live HMRC submission pilot`.

It must not expose an enabled live submit button. The panel only explains readiness status and whether the account is allowlisted for a future controlled pilot.

## Readiness Gate

`npm run hmrc:phase5:gate` now prints:

- `READY_FOR_PHASE_5A`
- `READY_FOR_PHASE_5B`
- `READY_FOR_LIVE_SUBMISSION = false`

Phase 5B readiness means pilot controls are present. It does not mean live submission is ready or enabled.
