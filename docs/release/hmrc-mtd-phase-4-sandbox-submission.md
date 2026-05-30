# HMRC MTD Phase 4 Sandbox Submission Rollout

## Checklist

- Confirm disconnect audit includes revocation metadata.
- Enable `hmrc_mtd_sandbox_submission` only for staging/internal account.
- Confirm `HMRC_ENVIRONMENT=sandbox`.
- Confirm `HMRC_BASE_URL=https://test-api.service.hmrc.gov.uk`.
- Confirm `hmrc_mtd_live_submission` is disabled.
- Connect HMRC sandbox with `write:self-assessment`.
- Confirm sandbox NINO exists.
- Create sandbox ITSA status.
- Create sandbox UK property business source.
- Create tax records for the period.
- Create quarterly draft.
- Resolve draft issues.
- Mark draft reviewed or locked.
- Submit to HMRC sandbox.
- Confirm submission ID is stored when HMRC returns one.
- For 2025-26 and later cumulative UK Property submissions, confirm `204 No Content` is shown as accepted rather than as a missing-submission-ID error.
- Confirm correlation ID is stored when HMRC returns one.
- Confirm read-back verification is attempted.
- Confirm the correlation ID plus read-back verification are shown as the meaningful sandbox receipt when no submission ID is returned.
- Confirm Property Business read no longer shows no-data where HMRC sandbox exposes the submitted summary.
- Confirm repeat submit is blocked after a successful sandbox submission for the same draft.
- Confirm historical failed attempts remain visible and are labelled as earlier attempts.
- Confirm tenant/contractor users are blocked.
- Confirm no tokens or client secrets are exposed in frontend responses or audit metadata.
- Confirm the UI states that sandbox submission does not represent a live HMRC filing.
- Disable `hmrc_mtd_sandbox_submission` for rollback.

## Rollback

Disable `hmrc_mtd_sandbox_submission` for the account. The UI keeps the Quarterly Drafts tab available, but sandbox submission is disabled. Live submission remains blocked separately by environment and feature flags.
