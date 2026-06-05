# HMRC Phase 5D Implementation Checkpoint

Date recorded: 2026-06-05

## Status

Phase 5D is implemented but not cleared for real live-network execution until E2E failures are triaged, operator dry-run smoke passes, rollback is verified, and production secret/kill-switch evidence is recorded.

## Implementation

- Phase 5D one-account live network pilot implemented.
- SQL overlay added: `supabase/hmrc_mtd_phase5d_one_account_live_pilot.sql`.
- SQL overlay registered in DB apply/bootstrap scripts.
- Edge Function hardened: `hmrc-submit-uk-property-period-summary-live-pilot`.
- Real live-network pilot was not executed.
- Live HMRC network submission is not generally enabled.
- No landlord self-service live submit button exists.

## Completed Checks

- Focused HMRC/security tests passed before this hardening pass: 66.
- Focused HMRC/security tests passed after this hardening pass: 68.
- SQL dry-run passed.
- `npm run build` passed.
- `npm run lint` passed with existing warnings only.
- `npm run test` passed before this hardening pass: 2965 tests.
- `npm run test` passed after this hardening pass: 2967 tests.
- `npm run check:edge-functions` passed for HMRC Edge Functions: 16 of 16.
- `npm run test:e2e -- tests/e2e/hmrc-phase5d-pilot.spec.js` passed: 9 of 9.

## Open Blockers

- `npm run test:e2e` failed:
  - 266 passed.
  - 102 failed.
  - 38 did not run.
- JSON reporter rerun failed:
  - 261 passed.
  - 103 failed.
  - 42 did not run.
  - Artifact: `tmp/phase5d-e2e-results.json`.
- Full E2E blockers are classified in `docs/release/phase5d-e2e-clearance.md`.
- The HMRC-scoped Edge Function check now passes, but the broader all-functions check still has unrelated legacy failures and is tracked separately from the HMRC real-live pilot gate.
- The live pilot Edge Function must not be deployed for a real live-network attempt until E2E clearance, operator dry-run smoke, rollback verification, support review, and production secret checks are complete.

## Readiness Flags

- `READY_FOR_GENERAL_LIVE_SUBMISSION` remains false.
- `READY_FOR_LIVE_SUBMISSION` remains false.
- `READY_FOR_REAL_LIVE_NETWORK_ATTEMPT` remains false until E2E triage, Deno/type check, staging operator dry-run, support review, rollback verification, and production secret verification are complete.

## Deno / Edge Function Type Check

Command:

```bash
npm run check:edge-functions
```

Result:

```text
Edge Function type-check passed: 16/16 function(s).
```

Scope:

- `hmrc-submit-uk-property-period-summary-live-pilot`
- `hmrc-submit-uk-property-period-summary-sandbox`
- HMRC OAuth/connect/read-only/test-data functions
- Shared HMRC helpers imported by those functions

The all-functions command remains available as `npm run check:edge-functions:all` and is not yet a Phase 5D readiness pass because non-HMRC functions still have legacy Deno typing/dependency issues.
