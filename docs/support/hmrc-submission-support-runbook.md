# HMRC Submission Support Runbook

Live HMRC submission is not available. Support should describe current HMRC tools as readiness, sandbox testing and accountant review only.

## 400 validation error

- User sees: safe validation failure copy asking them to review the draft issues.
- Check: `mtd_quarterly_submission_attempts`, `mtd_quarterly_submission_events`, draft validation summary and source lines.
- Safe response: “HMRC sandbox validation rejected the payload. Review the listed draft issues before retrying sandbox.”
- Do not say: the user is compliant or that HMRC rejected a live filing.
- Escalate when: validation details do not match the draft source lines.

## 401 expired token

- User sees: reconnect or refresh HMRC sandbox guidance.
- Check: connection status, `last_refreshed_at`, audit events for refresh attempts.
- Safe response: “Reconnect HMRC sandbox before retrying.”
- Do not say: any access token, refresh token or secret value.
- Escalate when: refresh repeatedly fails for a connected sandbox account.

## 403 insufficient scope

- User sees: “Reconnect HMRC with the required permission.”
- Check: connection scopes and audit event status.
- Safe response: “Reconnect HMRC sandbox with the required read/write sandbox permission.”
- Do not say: live submission is enabled.
- Escalate when: expected scopes are present but HMRC still denies the sandbox request.

## 404 missing business/source

- User sees: “Required sandbox/property business identifier is missing or unavailable.”
- Check: saved sandbox profile, Property Business read check and draft `property_business_id`.
- Safe response: “Save or refresh the sandbox property business identifier, then rerun read-only verification.”
- Do not say: HMRC lost a live business record.
- Escalate when: Business Details shows a property business but Tenaqo cannot resolve it.

## 409 duplicate

- User sees: duplicate/already submitted state.
- Check: successful attempts for the same account and draft, draft sandbox receipt fields.
- Safe response: “This sandbox draft was already accepted. Create an amendment flow or new draft before submitting changes.”
- Do not say: blindly retry.
- Escalate when: no successful attempt exists but the duplicate warning appears.

## 500/503 HMRC unavailable

- User sees: “HMRC is unavailable. Try again later.”
- Check: attempt status, safe error code, correlation ID if HMRC returned one.
- Safe response: “HMRC sandbox appears unavailable. Retry later after confirming no successful attempt was recorded.”
- Do not say: figures are wrong or live filing failed.
- Escalate when: repeated outage lasts beyond the support window.

## network timeout

- User sees: retry-safe message.
- Check: whether an attempt row was created, whether the draft has a successful sandbox receipt.
- Safe response: “Check the latest attempt before retrying so you do not duplicate a sandbox submission.”
- Do not say: submit again immediately without checking attempt status.
- Escalate when: timeout happened after HMRC accepted but before read-back.

## user says figures are wrong

- User sees: accountant-review and preview-only wording.
- Check: source records, excluded lines, category totals, accountant pack export timestamp.
- Safe response: “Review the source records and draft line inclusion. Tenaqo prepares review drafts and is not tax advice.”
- Do not say: Tenaqo guarantees tax accuracy.
- Escalate when: included-line totals do not match the exported draft.

## user asks if they are compliant

- User sees: Digital Record Readiness and live submission disabled wording.
- Check: readiness score inputs and quarterly draft status.
- Safe response: “Tenaqo measures preparation and sandbox readiness. It does not certify compliance or provide tax advice.”
- Do not say: preparation equals compliance, outcomes are guaranteed or accountant review is unnecessary.
- Escalate when: public copy overclaims compliance.

## user submitted wrong draft in sandbox

- User sees: sandbox-only receipt and repeat-submit disabled copy.
- Check: draft id, period, sandbox attempt, read-back status and accountant pack.
- Safe response: “Sandbox submissions do not affect a real tax account. Create a corrected draft before further sandbox testing.”
- Do not say: HMRC live record was changed.
- Escalate when: source records or period were incorrect because of an app bug.

## user wants live submission enabled

- User sees: live submission disabled.
- Check: feature flags and readiness gate evidence.
- Safe response: “Live submission is not available. Phase 5A requires explicit consent, audit and readiness controls before any pilot.”
- Do not say: support can turn on live HMRC submission.
- Escalate when: a pilot request is approved by product/legal leadership.
