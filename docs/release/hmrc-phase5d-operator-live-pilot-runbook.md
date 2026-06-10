# HMRC Phase 5D Operator Live Pilot Runbook

Date prepared: 2026-06-06

## Boundary

This runbook is for the Phase 5D one-account HMRC live-network pilot only.

- One-account only.
- Operator-controlled only.
- UK Property quarterly update only.
- Not general live submission.
- Not annual update.
- Not final declaration.
- Not self-service.
- Not tax advice.
- `READY_FOR_GENERAL_LIVE_SUBMISSION` remains false before, during, and after this pilot.

Do not use this runbook to enable limited beta, general rollout, annual updates, final declaration, amendment flows, or landlord self-service live submission.

## Stop Rules

Stop immediately and keep `READY_FOR_REAL_LIVE_NETWORK_ATTEMPT=false` if any pre-run, dry-run, or final live-network gate fails.

Do not retry a failed or partially accepted live-network attempt blindly. If HMRC accepts but local persistence fails, preserve HMRC as the source of truth and follow the recovery path in `docs/support/hmrc-submission-support-runbook.md`.

## Pre-Run Verification

Complete every item before enabling any live-network flag.

- [ ] Pilot account selected.
- [ ] Pilot account explicitly allowlisted.
- [ ] Allowlist reason recorded.
- [ ] Draft selected.
- [ ] Draft reviewed.
- [ ] Draft locked.
- [ ] Draft has no unresolved issues.
- [ ] Source records trace to the draft.
- [ ] Export/accountant pack matches the draft totals.
- [ ] Phase 5A consent recorded after draft lock.
- [ ] Consent hashes are valid.
- [ ] Consent belongs to the same account, draft, and user.
- [ ] Phase 5B pilot guard passes.
- [ ] Phase 5C dry-run passed for the same account, draft, and consent.
- [ ] Pilot HMRC account can complete agent MFA, if HMRC prompts for a one-time access code during reconnect or sign-in.
- [ ] Duplicate live submission guard returns clear.
- [ ] Support runbook reviewed.
- [ ] Rollback/kill switch procedure verified.
- [ ] HMRC live credentials exist server-side only.
- [ ] HMRC production base URL is configured only in the controlled pilot execution environment.
- [ ] No frontend `live_network` call exists.
- [ ] No landlord-facing live submit button exists.
- [ ] Operator typed confirmation requirement exists.
- [ ] Receipt/audit storage path exists.
- [ ] No real HMRC live-network call has occurred yet.

If any item fails, stop, leave live-network flags disabled, and document the blocker in `docs/release/hmrc-phase5d-live-pilot-result.md`.

## Operator Dry Run

Run the live pilot endpoint in dry-run mode only.

Input shape:

```json
{
  "accountId": "<pilot-account-id>",
  "draftId": "<locked-draft-id>",
  "consentId": "<phase-5a-consent-id>",
  "mode": "dry_run"
}
```

Expected result:

- Phase 5A consent assertion passes.
- Phase 5B pilot guard passes.
- Phase 5C dry-run path passes.
- Payload preview is built.
- No HMRC live network call is made.
- Dry-run attempt is recorded.
- Dry-run event is recorded.
- Response says no data was sent to HMRC.

Record:

- Account id or masked account reference.
- Draft id.
- Consent id.
- Dry-run attempt id.
- Timestamp.
- Operator.
- Result.

If dry-run fails, do not continue and keep live-network flags disabled.

## Final Live Network Enablement Check

Only after the dry run passes, verify all live-network gates in the controlled pilot execution environment.

Required account flags:

- `hmrc_mtd_live_submission=true`
- `hmrc_mtd_live_submission_pilot=true`
- `hmrc_mtd_live_submission_network_enabled=true`

Required server-side environment:

- `HMRC_LIVE_NETWORK_ENABLED=true`
- `HMRC_ENVIRONMENT=live`
- `HMRC_BASE_URL=https://api.service.hmrc.gov.uk`
- `HMRC_LIVE_SUBMISSION_ENABLED=true`

Also verify:

- Account is allowlisted.
- Draft is locked.
- Consent is valid and current.
- Draft has no unresolved issues.
- Dry-run passed.
- Duplicate guard is clear.
- Operator confirmation is ready.

Do not enable these flags or secrets in the general environment.

## One Live Network Attempt

If all gates pass, perform exactly one operator-controlled live-network call.

Input shape:

```json
{
  "accountId": "<pilot-account-id>",
  "draftId": "<locked-draft-id>",
  "consentId": "<phase-5a-consent-id>",
  "mode": "live_network",
  "confirmLivePilot": true,
  "typedConfirmation": "LIVE PILOT"
}
```

The operator must type:

```text
LIVE PILOT
```

Expected handling if HMRC accepts with success or HTTP 204:

- Mark attempt success.
- Store HMRC correlation ID if present.
- Store HTTP status.
- Store safe response summary.
- Mark draft live pilot submitted.
- Write audit event.
- Show this message if the endpoint returns no body or submission ID:

```text
HMRC accepted this quarterly update. No submission ID was returned by this endpoint.
```

Expected handling if HMRC rejects:

- Mark failed or validation_failed.
- Store safe error summary.
- Do not retry blindly.
- Follow `docs/support/hmrc-submission-support-runbook.md`.

Expected handling if HMRC accepts but local success write fails:

- Do not retry blindly.
- Preserve accepted HMRC state as the source of truth.
- Follow the recovery path in `docs/support/hmrc-submission-support-runbook.md`.
- Escalate for operator recovery.

## Post-Run Verification

After the live attempt:

- [ ] Attempt row exists.
- [ ] Event/audit rows exist.
- [ ] Draft live pilot submitted marker exists if HMRC accepted the update.
- [ ] Duplicate live submission guard blocks repeat.
- [ ] No second live attempt can run.
- [ ] Support/root can view safe audit summary.
- [ ] Tenant and contractor cannot view HMRC pilot records.
- [ ] Tokens, secrets, and raw payload are not exposed.
- [ ] Landlord-facing UI does not show self-service live submit.
- [ ] `READY_FOR_GENERAL_LIVE_SUBMISSION` remains false.

If safe read-back is available:

- Attempt read-back separately.
- If read-back fails after HMRC accepted the submission, do not mark the submission failed.
- Record read-back status separately.

## Result Recording

Record the outcome in `docs/release/hmrc-phase5d-live-pilot-result.md`.

Allowed result states:

- not run
- dry-run passed
- live accepted
- live rejected
- blocked
- recovery required

Never include:

- HMRC access token.
- HMRC refresh token.
- HMRC client secret.
- Raw sensitive HMRC payload.
- Unnecessary personal data.

## Final Safety State

`READY_FOR_GENERAL_LIVE_SUBMISSION` must remain false after the pilot.

If the one-account live pilot succeeds:

- Do not enable general rollout.
- Recommend Phase 5E: live pilot hardening and limited beta preparation.

If the one-account live pilot fails:

- Do not retry blindly.
- Classify the failure.
- Keep general live submission disabled.
