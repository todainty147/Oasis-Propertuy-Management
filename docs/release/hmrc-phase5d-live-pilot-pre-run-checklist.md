# HMRC Phase 5D Live Pilot Pre-Run Checklist

This checklist is for the one-account Phase 5D live network pilot only. It does not enable limited beta, general rollout, annual update, final declaration, or self-service live submission. Do not run a real HMRC live-network call until every item is checked and the root/operator typed confirmation is ready.

- [x] Release owner accepted waiver matrix.
- [x] Backlog tickets created for remaining broad E2E failures.
- [x] Pilot account selected.
- [x] Pilot account is not a general production user.
- [x] Account explicitly allowlisted by root/operator.
- [x] Allowlist reason recorded.
- [x] Draft selected.
- [x] Draft reviewed.
- [x] Draft locked.
- [x] Draft has no unresolved issues.
- [x] Phase 5A consent recorded after draft lock.
- [x] Consent hashes valid.
- [x] Phase 5B pilot guard passes.
- [x] Phase 5C dry-run passed for same account/draft/consent.
- [x] Support runbook reviewed.
- [x] Rollback/kill switch tested.
- [x] HMRC live credentials verified server-side only.
- [x] HMRC production base URL configured only for pilot environment.
- [x] HMRC_LIVE_NETWORK_ENABLED remains false until operator pre-run approval.
- [x] No frontend live_network call exists.
- [x] No landlord-facing live submit button exists.
- [x] Operator typed confirmation requirement verified.
- [x] Duplicate live submission guard verified.
- [x] Receipt/audit storage verified.
- [x] No real HMRC live-network call has occurred yet.

## Evidence Notes

- Operator/manual checks are recorded for the selected one-account pilot only.
- `HMRC_LIVE_NETWORK_ENABLED` remains false until the final operator approval immediately before the live-network attempt.
- This checklist does not enable limited beta, general rollout, annual update, final declaration, or self-service live submission.
- No real HMRC live-network call has occurred while completing this checklist.

## Gate Mapping

Set `operatorPreRunChecklistComplete=true` only after every checklist item above is complete and the matching machine-readable checklist evidence is supplied to the readiness gate. `READY_FOR_GENERAL_LIVE_SUBMISSION` must remain false regardless of the one-account pilot gate result.
