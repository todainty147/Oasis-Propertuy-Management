# HMRC Phase 5B Security Checkpoint

This checkpoint records the completed HMRC Phase 5A and Phase 5B hardening before any Phase 5C live submission endpoint work begins.

## Current Status

- HMRC Phase 4 sandbox UK property period summary submission is complete.
- HMRC sandbox read-back verification is complete.
- HMRC Phase 5A consent scaffolding is complete.
- HMRC Phase 5B live pilot controls are complete.
- `READY_FOR_LIVE_SUBMISSION` remains `false`.
- No live HMRC submission endpoint exists.
- No live HMRC write call exists.
- No enabled live submit button exists.

## Test Results

- Focused HMRC tests: 47 passed.
- Broader HMRC checks: 57 passed where applicable.
- Focused consent and readiness gate tests: 26 passed where applicable.
- `npm run build` passed.
- `npm run lint` passed with existing warnings only.
- Gate negative run returns `READY_FOR_PHASE_5A=false` when consent evidence is missing.
- Gate positive run can return `READY_FOR_PHASE_5A=true` while warning that live submission is not enabled.

## Logic Bomb Sweep

- `READY_FOR_LIVE_SUBMISSION` is hardcoded `false` and non-computable.
- No live HTTP call exists in Phase 5A or Phase 5B.
- Live feature flags cannot be granted via plan tier.
- Live feature flags are seeded disabled and use `ON CONFLICT DO NOTHING`.
- `assertLiveSubmissionDisabled` throws on non-sandbox state.
- Sandbox submission has triple independent guards.
- `assert_hmrc_live_submission_consent` has a single success return path.
- `assertHmrcLiveSubmissionPilotAllowed` has no early success return.
- `p_enabled IS TRUE` is null-safe.
- `hmrc_live_submission_pilot_accounts` is write-locked from clients.
- `assertHmrcLiveSubmissionPilotAllowed` has no callers.
- Frontend service only calls the sandbox endpoint.

## Safety Conclusion

No single point of failure can trigger a live HMRC submission in the current Phase 5A/5B implementation.

## Remaining Before Phase 5C

- Controlled live endpoint is not implemented.
- Production HMRC write call is not implemented.
- Live submit UI is not implemented.
- Live submission support procedure must be active before pilot.
- Pilot account must be explicitly allowlisted by root/operator.
- Live endpoint must require Phase 5A consent and Phase 5B preflight guard.
- Live endpoint must start with one internal/beta account only.

## Phase 5C Entry Criteria

Do not begin Phase 5C unless:

- This checkpoint is committed.
- Staging smoke test passes.
- Support runbook is reviewed.
- Rollback/kill switch is verified.
- Root/operator allowlist flow is tested.
- Production HMRC credentials are stored server-side only.
- No frontend secret exposure exists.

Phase 5C remains future work. This checkpoint does not enable live HMRC submission.
