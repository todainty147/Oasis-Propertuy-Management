# HMRC MTD Sandbox Submission

## Purpose

HMRC Phase 4 submits a reviewed or locked Tenaqo quarterly draft to HMRC sandbox only for a UK Property Income & Expenses Period Summary test.

This does not submit anything to live HMRC and does not affect a real tax account.

## Why Property Business Read Could Show No Data

The HMRC sandbox test-data endpoints can create:

- an ITSA status record
- a UK property business source

They do not create a UK property period summary. Until a period summary has been submitted to the sandbox, the Property Business read endpoint can return `MATCHING_RESOURCE_NOT_FOUND` / no-data for the selected tax year. That is expected.

Phase 4 closes that loop by submitting a reviewed quarterly draft to the sandbox period-summary endpoint, then attempting read-back verification.

## Required Flow

1. Connect HMRC sandbox with `read:self-assessment` and `write:self-assessment`.
2. Confirm sandbox ITSA status exists.
3. Confirm the UK property business source exists.
4. Create or select a quarterly draft.
5. Resolve draft issues.
6. Mark the draft reviewed or lock it.
7. Enable `hmrc_mtd_sandbox_submission` for the internal/staging account.
8. Submit to HMRC sandbox.
9. Store the submission ID when HMRC returns one, plus the correlation ID and safe receipt summary.
10. Attempt read-back verification.

For the 2025-26 and later cumulative UK Property endpoint, HMRC can accept a sandbox submission with `204 No Content`. In that case there may be no `submissionId` in the response. Treat the HMRC correlation ID and successful read-back verification as the meaningful sandbox receipt.

## Submission Guards

The sandbox submission Edge Function blocks unless:

- `HMRC_ENVIRONMENT` is `sandbox`
- `HMRC_BASE_URL` is exactly `https://test-api.service.hmrc.gov.uk`
- `hmrc_mtd_sandbox_submission` is enabled for the account
- `hmrc_mtd_live_submission` is disabled
- the draft is reviewed or locked
- draft validation issues are resolved
- the HMRC connection is connected
- the connection includes `write:self-assessment`
- sandbox NINO and UK property business ID are present
- the caller is an owner, admin or staff member for the account

Tenants and contractors cannot submit.

## Payload Mapping

The payload builder maps included quarterly draft lines into the HMRC Property Business API 6.0 cumulative UK property summary shape:

- rent income becomes `ukProperty.income.periodAmount`
- other property income becomes `ukProperty.income.otherIncome`
- included expenses are submitted as `ukProperty.expenses.consolidatedExpenses`
- excluded lines are omitted
- unresolved review lines block submission
- negative or invalid amounts block submission

Capital improvements, mixed-use items, estimate-only records and finance-cost review lines must be resolved before submission.

## Stored Data

Tenaqo stores safe sandbox receipt data in:

- `mtd_quarterly_submission_attempts`
- `mtd_quarterly_submission_events`
- sandbox receipt fields on `mtd_quarterly_update_drafts`

Stored summaries must not contain access tokens, refresh tokens, client secrets or unnecessary personal data.

## Error Handling

Common safe messages:

- HMRC sandbox rejected the payload. Review the validation details.
- The HMRC token expired. Reconnect or refresh HMRC sandbox.
- The token does not include the required scope.
- Required sandbox property business identifier is missing.
- The period summary was submitted, but read-back verification did not complete.

If create succeeds but read-back fails, the submission remains successful and the read-back issue is recorded separately.

Repeat submit is blocked after a successful sandbox submission for the same draft. Create a new draft, or an explicit amendment flow in a later phase, to test another submission.

Earlier failed audit rows remain visible for traceability. They can reflect previous sandbox payload validation before the latest successful submission.

## Not Implemented

- No live HMRC submission.
- No final declaration.
- No annual update.
- No foreign property period summaries.
- No self-employment period summaries.

Sandbox submission records do not represent a live HMRC filing.
