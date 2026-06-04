# HMRC Phase 5A Consent Scaffolding

This note documents the consent framework added before any future controlled live-submission pilot. It does not enable live submission, a production HMRC write endpoint, or a final declaration flow.

## Scope

- Consent framework ready for future live-submission readiness work.
- Live submission is not enabled.
- Future live submission will require explicit consent against the exact reviewed and locked quarterly draft.
- Sandbox submission remains the only HMRC write path currently implemented.

## Migration

- `supabase/hmrc_mtd_phase5a_consent_scaffolding.sql`
- Adds `hmrc_live_submission_consents`.
- Adds append-only protection for consent records.
- Adds account/draft match enforcement.
- Adds consent recording and assertion RPCs.
- Adds independent snapshot hashes for draft lines, category totals, validation summary, and payload preview.

## RPCs

- `record_hmrc_live_submission_consent(account_id, draft_id, checkbox_confirmed, consent_text_version, consent_text_snapshot)`
- `assert_hmrc_live_submission_consent(account_id, draft_id, consent_id)`

Recording consent requires:

- Manager access to the account.
- Quarterly draft builder feature enabled.
- Locked draft status.
- Existing reviewed and locked timestamps.
- Checkbox confirmation.
- Consent text version.
- Consent text snapshot.

Asserting consent rejects:

- Missing consent.
- Consent for another account.
- Consent for another draft.
- Draft status changed away from locked.
- Draft `updated_at` changed.
- Draft lines changed.
- Category totals changed.
- Validation summary changed.
- Payload preview changed.

## Edge Helper

- `supabase/functions/_shared/hmrcLiveSubmissionConsent.ts`
- Exposes `assertHmrcLiveSubmissionConsent(...)`.
- Requires `accountId`, `draftId`, `userId`, and `consentId`.
- Calls the server-side assertion RPC.
- Returns only a safe consent summary.
- Does not return consent text snapshot, tokens, secrets, or raw HMRC payloads.

## RLS And Isolation

- Consent rows are readable only through manager-scoped RLS.
- App roles do not receive direct insert, update, or delete grants on the consent table.
- Consent recording is through the RPC only.
- Tenants, contractors, and other accounts are blocked by `user_can_manage_account(...)` and account/draft checks.

## Audit

Successful consent recording writes `hmrc_live_submission_consent_recorded` to `mtd_quarterly_update_audit_events`.

Audit metadata includes:

- `accountId`
- `draftId`
- `userId`
- `consentId`
- `consentTextVersion`
- `confirmedAt`
- safe draft snapshot hashes

Audit metadata must not include:

- access tokens
- refresh tokens
- client secrets
- raw HMRC payloads
- unnecessary personal data

## Tests

Run:

```bash
npm run test:unit:run -- tests/security/hmrcMtdPhase1Contracts.test.js tests/security/hmrcMtdPhase4Contracts.test.js tests/security/hmrcMtdPhase5ReadinessContracts.test.js tests/unit/hmrcMtd.test.js tests/unit/hmrcPhase5ReadinessGate.test.js
npm run lint
npm run build
```

Readiness gate negative check:

```bash
consentScaffoldingPresent=false npm run hmrc:phase5:gate
```

Readiness gate positive check, only after manual evidence is recorded:

```bash
automatedTestsPass=true stagingSandboxSubmissionRepeated=true readBackVerificationPasses=true duplicateSubmissionBlocked=true consentScaffoldingPresent=true auditTrailComplete=true tenantContractorBlocked=true noSecretsExposed=true uiCopySafe=true supportRunbookExists=true liveSubmissionFlagFalse=true productionWriteEndpointBlocked=true npm run hmrc:phase5:gate
```

The gate output must continue to state that `READY_FOR_PHASE_5A` only means ready to begin Phase 5A readiness work and does not enable live submission.

## Rollback

- Keep live submission flags disabled.
- Do not deploy any live HMRC write function.
- If the consent migration must be backed out before use, disable or avoid calling the consent RPCs first.
- Preserve existing audit records unless product/legal leadership approves a retention-specific change.

## Not Implemented

- No live submission.
- No production HMRC write endpoint.
- No final declaration.
- No live submission UI.
