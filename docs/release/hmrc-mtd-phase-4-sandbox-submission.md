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
- Confirm submission ID is stored.
- Confirm correlation ID is stored when HMRC returns one.
- Confirm read-back verification is attempted.
- Confirm Property Business read no longer shows no-data where HMRC sandbox exposes the submitted summary.
- Confirm tenant/contractor users are blocked.
- Confirm no tokens or client secrets are exposed in frontend responses or audit metadata.
- Disable `hmrc_mtd_sandbox_submission` for rollback.

## Rollback

Disable `hmrc_mtd_sandbox_submission` for the account. The UI keeps the Quarterly Drafts tab available, but sandbox submission is disabled. Live submission remains blocked separately by environment and feature flags.
