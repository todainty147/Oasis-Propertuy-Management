# HMRC Phase 5 Readiness Smoke Test

This script must pass before Phase 5A - Live Submission Readiness & Consent Framework begins. It does not enable live HMRC submission.

1. Log in as landlord owner. Passed.
2. Confirm HMRC connection status. Passed.
3. Run Business Details check. Passed.
4. Run Obligations check. Passed.
5. Run Property Business check. Passed.
6. Create tax records. Passed.
   - rent income
   - repairs expense
   - insurance expense
   - finance cost
   - capital improvement
   - mixed-use item
7. Create quarterly draft. Passed.
8. Confirm unresolved issues appear. Passed.
9. Resolve or exclude issues. Passed.
10. Mark draft reviewed. Passed.
11. Lock draft. Passed.
12. Export accountant pack. Passed.
13. Run the HMRC sandbox submission. Passed.
14. Confirm success and correlation ID. Passed.
15. Confirm read-back success. Passed.
16. Confirm repeat submit disabled. Passed.
17. Confirm no live submission button. Passed.
18. Log in as tenant. Passed.
19. Confirm tenant cannot access Tax Tools. Passed.
20. Log in as contractor. Passed.
21. Confirm contractor cannot access Tax Tools. Passed.
22. Confirm audit events visible to landlord/admin. Passed.
23. Confirm no token/secrets in frontend responses/logs. Passed.
24. Disable sandbox submission flag. Passed.
25. Confirm sandbox submission button disappears or disables. Passed.

## Pass Criteria

- Source records are traceable by source type, table and id.
- Quarterly draft totals match included records.
- Locked draft totals do not silently drift.
- Sandbox submission succeeds only in the HMRC test API environment.
- Repeat sandbox submission is blocked.
- Live HMRC submission remains disabled.
- Support can find safe audit events and correlation IDs without tokens or secrets.

Run `npm run hmrc:phase5:gate` after recording evidence. Do not treat `READY_FOR_PHASE_5A = true` as valid unless every manual and automated condition has passed.
