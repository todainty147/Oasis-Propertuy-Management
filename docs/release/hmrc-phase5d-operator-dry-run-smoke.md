# HMRC Phase 5D Operator Dry-Run Smoke

Date recorded: 2026-06-05

## Status

Not run.

This smoke test is intentionally blocked until:

- E2E failures are triaged and blocking failures are fixed or formally waived.
- `npm run check:edge-functions` remains passing for HMRC Edge Functions.
- The Phase 5D SQL overlay is applied in staging.
- The live pilot Edge Function is deployed to staging only.

## Required Smoke Test

Run dry-run only. Do not run `live_network`.

1. Apply Phase 5D SQL overlay in staging.
2. Deploy `hmrc-submit-uk-property-period-summary-live-pilot`.
3. Confirm live network env flags remain disabled.
4. Confirm pilot account allowlist works.
5. Confirm operator evidence checklist works.
6. Confirm a reviewed and locked quarterly draft exists.
7. Confirm valid Phase 5A consent exists.
8. Run live pilot dry-run only.
9. Confirm no HMRC network call occurs.
10. Confirm dry-run attempt row is created.
11. Confirm dry-run audit event is written.
12. Confirm UI says no data was sent to HMRC.
13. Confirm landlord has no self-service live button.
14. Confirm tenant and contractor roles are blocked from Tax Tools/HMRC surfaces.
15. Confirm `READY_FOR_GENERAL_LIVE_SUBMISSION=false`.
16. Confirm `READY_FOR_LIVE_SUBMISSION=false`.

## Result

Pending. Phase 5D is not cleared for a real live-network attempt.
