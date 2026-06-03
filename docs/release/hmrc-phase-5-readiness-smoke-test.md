# HMRC Phase 5 Readiness Smoke Test

This script must pass before Phase 5A - Live Submission Readiness & Consent Framework begins. It does not enable live HMRC submission.

1. Log in as landlord owner.
2. Confirm HMRC connection status.
3. Run Business Details check.
4. Run Obligations check.
5. Run Property Business check.
6. Create tax records:
   - rent income
   - repairs expense
   - insurance expense
   - finance cost
   - capital improvement
   - mixed-use item
7. Create quarterly draft.
8. Confirm unresolved issues appear.
9. Resolve or exclude issues.
10. Mark draft reviewed.
11. Lock draft.
12. Export accountant pack.
13. Run the HMRC sandbox submission.
14. Confirm success and correlation ID.
15. Confirm read-back success.
16. Confirm repeat submit disabled.
17. Confirm no live submission button.
18. Log in as tenant.
19. Confirm tenant cannot access Tax Tools.
20. Log in as contractor.
21. Confirm contractor cannot access Tax Tools.
22. Confirm audit events visible to landlord/admin.
23. Confirm no token/secrets in frontend responses/logs.
24. Disable sandbox submission flag.
25. Confirm sandbox submission button disappears or disables.

## Pass Criteria

- Source records are traceable by source type, table and id.
- Quarterly draft totals match included records.
- Locked draft totals do not silently drift.
- Sandbox submission succeeds only in the HMRC test API environment.
- Repeat sandbox submission is blocked.
- Live HMRC submission remains disabled.
- Support can find safe audit events and correlation IDs without tokens or secrets.

Run `npm run hmrc:phase5:gate` after recording evidence. Do not treat `READY_FOR_PHASE_5A = true` as valid unless every manual and automated condition has passed.
