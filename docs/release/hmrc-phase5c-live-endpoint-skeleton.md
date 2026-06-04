# HMRC Phase 5C Live Endpoint Skeleton

Phase 5C introduces a controlled live endpoint skeleton and operator dry run. It does not enable live HMRC filing for general users.

## Purpose

The endpoint skeleton exists to prove the server-side controls around live submission before any live network pilot is considered. It requires Phase 5A consent, Phase 5B pilot pre-flight, account allowlisting and explicit operator/environment kill switches.

## Dry-Run Mode

Dry run is the default mode. A successful dry run:

- builds and validates the same UK property period summary shape used by sandbox submission
- creates a `hmrc_live_submission_attempts` row with `mode = 'dry_run'`
- writes `live_dry_run_started` and `live_dry_run_passed` events
- returns a safe summary only
- sends no data to HMRC

## Live Network Kill Switch

The live network path is blocked unless all server-side controls are explicitly true:

- `HMRC_LIVE_NETWORK_ENABLED=true`
- `HMRC_ENVIRONMENT=live`
- `HMRC_BASE_URL=https://api.service.hmrc.gov.uk`
- `HMRC_LIVE_SUBMISSION_ENABLED=true`
- account feature `hmrc_mtd_live_submission_network_enabled=true`

If any check fails, the endpoint records a blocked event and does not call HMRC.

## Duplicate Live Guard

The skeleton blocks `live_network` when a successful or in-progress live attempt already exists for the same account and draft, or when the draft already carries a successful live submission marker. Dry runs may be repeated.

## Consent Dependency

Phase 5C does not bypass Phase 5A. The endpoint requires an explicit consent id and runs the Phase 5A consent assertion before any dry-run or live-network branch can continue.

## Pilot Allowlist Dependency

Phase 5C does not bypass Phase 5B. The endpoint runs `assertHmrcLiveSubmissionPilotAllowed`, which requires the live pilot feature flags, owner/admin role, account allowlisting, a locked draft, no unresolved issues, valid consent, live connection readiness and support-runbook readiness.

## UI Position

There is no public live submit UI. The Quarterly Drafts live pilot panel may expose a dry-run-only action when pilot readiness passes. It never calls `mode = 'live_network'`.

## Not Implemented

- No general live rollout.
- No final declaration.
- No annual update.
- No foreign property.
- No public self-service live enablement.
- No enabled landlord-facing live filing button.

`READY_FOR_LIVE_SUBMISSION` remains `false`.
