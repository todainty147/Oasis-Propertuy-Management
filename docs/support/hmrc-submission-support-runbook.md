# HMRC Submission Support Runbook

Live HMRC submission is not available. Support should describe current HMRC tools as readiness, sandbox testing and accountant review only.

Live HMRC submission is only available through a controlled pilot when explicitly enabled. Sandbox submissions do not affect a real HMRC account.

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

## user wants live submission enabled / user asks to enable live submission

- User sees: live submission disabled.
- Check: feature flags, `hmrc_live_submission_pilot_accounts`, readiness gate evidence and product/legal approval.
- Safe response: “Live HMRC submission is only available through a controlled pilot when explicitly enabled. Sandbox submissions do not affect a real HMRC account.”
- Do not say: support can turn on live HMRC submission.
- Escalate when: a pilot request is approved by product/legal leadership.

## account not allowlisted

- User sees: “Live HMRC submission is not available for this account.”
- Check: `hmrc_live_submission_pilot_accounts`, `enabled`, `enabled_at`, `enabled_by`, and `reason`.
- Safe response: “This account is not allowlisted for the controlled live HMRC pilot.”
- Do not say: a landlord can self-enable pilot access.
- Escalate when: an approved pilot account is missing from the allowlist.

## pilot disabled

- User sees: pilot readiness checks blocked or disabled.
- Check: `hmrc_mtd_live_submission`, `hmrc_mtd_live_submission_pilot`, `hmrc_mtd_live_submission_allowlist`, and `hmrc_mtd_live_submission_operator_controls`.
- Safe response: “The controlled live HMRC pilot is disabled for this account or environment.”
- Do not say: the sandbox submission flag enables live filing.
- Escalate when: all approved flags are enabled but pre-flight still reports disabled pilot.

## stale consent

- User sees: consent invalid or stale.
- Check: `hmrc_live_submission_consents`, draft `updated_at`, lines hash, category totals hash, validation summary hash and payload preview hash.
- Safe response: “The draft changed after consent was recorded. Review, lock and consent again before any future pilot pre-flight.”
- Do not say: old consent can be reused after draft edits.
- Escalate when: stale consent appears without a draft snapshot change.

## draft changed after consent

- User sees: stale consent or pilot pre-flight blocked.
- Check: latest `hmrc_live_submission_consent_recorded` audit event against the current locked draft.
- Safe response: “Consent is tied to the exact reviewed and locked draft snapshot.”
- Do not say: consent applies to later changes automatically.
- Escalate when: the app lets users change a locked draft silently.

## live token expired

- User sees: live pilot connection/token blocked.
- Check: live `hmrc_connections` row for `connection_status`, `access_token_expires_at`, `refresh_token_expires_at`, and safe refresh audit events.
- Safe response: “Reconnect or refresh the live HMRC connection before pilot pre-flight can continue.”
- Do not say: token values or secrets.
- Escalate when: token refresh fails repeatedly for an approved pilot account.

## agent MFA required during reconnect/sign-in

- User sees: HMRC Government Gateway asks for a one-time access code during reconnect, refresh, or pilot sign-in preparation.
- Check: whether the HMRC account is an agent services account or HMRC online services for agents account, whether MFA has already been activated, and whether the pilot operator/account holder can receive the code by authenticator app, SMS, or voice call.
- Safe response: “HMRC may require agent accounts to complete multi-factor authentication during sign-in. Complete the HMRC MFA step in the browser, then return to Tenaqo to continue reconnect or pilot preparation.”
- Do not say: Tenaqo can bypass HMRC MFA, receive the one-time code, or change the HMRC 18-month authorisation journey.
- Escalate when: an approved live pilot account cannot complete MFA before dry run or live-network approval.

## live HMRC connection missing

- User sees: live connection required.
- Check: `hmrc_connections` for `environment = 'live'` and connected status.
- Safe response: “A live HMRC connection is required before controlled pilot pre-flight.”
- Do not say: the sandbox connection is enough for live submission.
- Escalate when: a connected live row exists but the guard reports missing connection.

## duplicate live submission blocked

- User sees: duplicate successful live submission blocked.
- Check: draft `live_submission_status`, `live_submitted_at`, and any future live submission attempt table.
- Safe response: “This draft already has a successful live submission marker. A later amendment flow must be used instead.”
- Do not say: retry the same live draft.
- Escalate when: duplicate is reported without a successful live marker.

## dry run passed but no HMRC filing occurred

- User sees: “Live submission dry run passed. No data was sent to HMRC.”
- Check: `hmrc_live_submission_attempts.mode = 'dry_run'`, status `dry_run_passed`, and `hmrc_live_submission_events` for `live_dry_run_passed`.
- Safe response: “Dry run does not send data to HMRC. The dry run validated the controlled pilot path only and does not count as filing.”
- Do not say: the return was filed or accepted by live HMRC.
- Escalate when: a dry-run attempt shows a network response or live HMRC correlation id.

## dry run flag disabled

- User sees: dry-run control unavailable or “Live HMRC dry run is disabled for this account.”
- Check: account feature `hmrc_mtd_live_submission_dry_run`, pilot allowlist state, and Phase 5C readiness evidence.
- Safe response: “Live HMRC submission is not enabled for general users. Dry-run access is limited to explicitly approved pilot accounts.”
- Do not say: every account can run live dry runs.
- Escalate when: an approved pilot account has completed consent and readiness checks but the dry-run flag remains disabled.

## live network disabled

- User sees: live network disabled or live pilot blocked.
- Check: account feature `hmrc_mtd_live_submission_network_enabled`, `HMRC_LIVE_NETWORK_ENABLED`, `HMRC_ENVIRONMENT`, `HMRC_BASE_URL`, and `HMRC_LIVE_SUBMISSION_ENABLED`.
- Safe response: “The live network path is disabled by server-side controls. Dry run may still be available for approved pilot accounts.”
- Do not say: a plan change can enable live filing.
- Escalate when: product/legal has approved a pilot but the operator kill switch state is unclear.

## HMRC accepted but local success write failed

- User sees: an error after a live-network pilot attempt, while HMRC may have accepted the request.
- Check: HMRC correlation id, HMRC audit log, `hmrc_live_submission_attempts` rows stuck in `started`, and draft `live_submission_status`.
- Safe response: “Do not retry this draft. Support must reconcile the HMRC response and local attempt record before any further action.”
- Do not say: run the same live submission again.
- Escalate when: HMRC accepted the request but `completeLiveAttempt` or draft success markers were not written locally.

## consent invalid/stale

- User sees: missing, invalid or stale consent.
- Check: `hmrc_live_submission_consents`, draft hashes, draft status and latest consent audit event.
- Safe response: “Live dry run and any future live pilot require current consent for the exact locked draft.”
- Do not say: previous consent can be reused after edits.
- Escalate when: consent appears current but the assertion reports stale consent.

## operator kill switch disabled

- User sees: live network disabled.
- Check: `live_operator_kill_switch_checked` and `live_submission_blocked` events.
- Safe response: “The operator kill switch is off, so no live network call can occur.”
- Do not say: support can bypass the kill switch.
- Escalate when: an approved operator action is blocked unexpectedly.

## user asks why live submit button is missing

- User sees: pilot controls, dry-run state, or no live controls.
- Check: account allowlist, pilot flags, dry-run flag and current readiness gate output.
- Safe response: “Live HMRC submission is not enabled for general users. There is no public live filing button. Phase 5C only supports controlled dry-run checks for approved pilot accounts.”
- Do not say: the button is hidden because of a UI bug.
- Escalate when: an approved pilot account cannot see the dry-run control after all readiness checks pass.

## user asks whether sandbox or dry run counts as filing

- User sees: sandbox success, dry-run success, or an HMRC sandbox correlation id.
- Check: environment, attempt mode, and whether the row is a sandbox or dry-run attempt.
- Safe response: “Sandbox submission does not affect a real HMRC account. Dry run does not send data to HMRC.”
- Do not say: sandbox or dry-run counts as live filing.
- Escalate when: a live-network attempt appears in records for an account that was not explicitly approved for a pilot.

## user asks whether Tenaqo guarantees MTD compliance

- User sees: MTD readiness, quarterly draft, export, sandbox, or dry-run result.
- Check: draft issue list, accountant pack, consent state, and HMRC audit events.
- Safe response: “Tenaqo helps prepare records and evidence for review. Tenaqo does not provide tax advice.”
- Do not say: Tenaqo guarantees MTD compliance or replaces an accountant.
- Escalate when: support copy or product copy appears to imply guaranteed compliance.

## user asks whether sandbox submission counts as filing

- User sees: sandbox-only copy.
- Check: sandbox attempt receipt and HMRC environment.
- Safe response: “Sandbox submissions do not affect a real HMRC account and do not count as filing.”
- Do not say: sandbox acceptance means the return was filed.
- Escalate when: UI copy implies sandbox submission is a real filing.

## user asks whether Tenaqo guarantees compliance

- User sees: readiness, draft and accountant-review language.
- Check: public copy and draft export wording.
- Safe response: “Tenaqo supports record preparation and review workflows. It does not guarantee compliance or replace tax advice.”
- Do not say: Tenaqo certifies MTD compliance.
- Escalate when: product copy overclaims accuracy, compliance or HMRC recognition.

## user cannot consent because draft is not locked

- User sees: Live submission is not enabled.
- Check: quarterly draft status, `reviewed_at`, `locked_at`, and any consent RPC error such as `draft_must_be_locked_for_live_consent`.
- Safe response: “Future live submission will require explicit consent against a reviewed and locked quarterly draft. Review and lock the draft before recording consent.”
- Do not say: consent submits anything to HMRC.
- Escalate when: a locked draft is still rejected as unlocked.

## consent rejected because draft changed

- User sees: stale consent or consent needs recording again.
- Check: `hmrc_live_submission_consents`, draft `updated_at`, draft line changes, category totals, validation summary, and the latest `hmrc_live_submission_consent_recorded` audit event.
- Safe response: “The draft changed after consent was recorded. Review, lock, and consent again before any future controlled pilot.”
- Do not say: the old consent was deleted; consent records are append-only.
- Escalate when: the stale warning appears but the draft snapshot did not change.

## consent missing checkbox

- User sees: checkbox confirmation required.
- Check: consent RPC error `checkbox_confirmed_required`.
- Safe response: “Explicit checkbox confirmation is required before consent can be recorded.”
- Do not say: consent can be inferred from using the page.
- Escalate when: checked consent is still rejected.

## consent text version missing

- User sees: consent wording/version required.
- Check: consent RPC errors `consent_text_version_required` or `consent_text_snapshot_required`.
- Safe response: “Consent must store the exact wording version and text snapshot shown to the user.”
- Do not say: support can manually fill in missing consent wording after the fact.
- Escalate when: the app renders consent text but the RPC receives a blank version or snapshot.

## user asks whether consent means submission happened

- User sees: Consent framework ready.
- Check: `hmrc_live_submission_consents` and HMRC submission attempt tables separately.
- Safe response: “Recording consent does not itself submit anything to HMRC. Live HMRC submission remains disabled unless a future controlled pilot is enabled.”
- Do not say: consent is a receipt from HMRC.
- Escalate when: UI copy implies consent is an HMRC submission.

## support needs to verify consent audit trail

- User sees: consent recorded or consent rejected.
- Check: `hmrc_live_submission_consent_recorded` in `mtd_quarterly_update_audit_events`, matching `account_id`, `draft_id`, `user_id`, consent text version, confirmed timestamp and safe draft snapshot hashes.
- Safe response: “The audit trail records who consented, when, which draft it applied to and the safe snapshot markers. It does not store HMRC tokens or secrets.”
- Do not say: audit metadata contains raw HMRC payloads.
- Escalate when: consent exists without a matching audit event.

## user asks to revoke consent before live submission exists

- User sees: Live submission is not enabled.
- Check: consent records remain append-only and there is no live endpoint.
- Safe response: “Consent records are append-only for audit. Because live submission is not enabled, no live HMRC action can occur from that consent.”
- Do not say: support will delete audit records.
- Escalate when: product/legal requires a future consent-superseded status flow.

## Phase 5D live pilot accepted

- User sees: live pilot submitted, accepted, or a correlation ID.
- Check: `hmrc_live_submission_attempts.mode = 'live_network'`, `status = 'success'`, `hmrc_http_status`, `hmrc_correlation_id`, draft period, tax year, and `live_network_submission_success` event.
- Safe response: “This pilot submits a quarterly update only. It is not a final declaration and it does not complete the customer’s tax return.”
- Do not say: the customer's annual tax return is complete.
- Escalate when: the accepted attempt lacks a correlation ID or safe receipt summary.

## Phase 5D live pilot failed

- User sees: safe live pilot error or failed attempt.
- Check: `hmrc_live_submission_attempts.status = 'failed'`, safe HMRC error code/message, `hmrc_correlation_id`, and `live_network_submission_failed` event.
- Safe response: “The live pilot quarterly update was not accepted. Support must review the safe HMRC response and pilot evidence before any retry decision.”
- Do not say: retry immediately.
- Escalate when: HMRC returned a 5xx, token refresh failed, or the safe reason is unclear.

## Phase 5D live pilot duplicate blocked

- User sees: duplicate live submission blocked.
- Check: existing successful or started `hmrc_live_submission_attempts` rows, draft `live_submission_status`, `live_submitted_at`, and `live_duplicate_blocked` events.
- Safe response: “A live quarterly update already exists or is in progress for this draft. The system blocks repeated live submissions.”
- Do not say: support can submit the same draft again.
- Escalate when: a started attempt appears stuck and no HMRC response is recorded.

## Phase 5D local DB success write failed after HMRC accepted

- User sees: accepted local write failure or recovery required.
- Check: HMRC HTTP status, `hmrc_correlation_id`, `live_network_local_write_failed` event, draft `live_submission_status`, and attempt status.
- Safe response: “HMRC accepted the update, but Tenaqo could not finish the local success write. Do not retry blindly; support must reconcile the HMRC receipt and local records.”
- Do not say: the failed local write means HMRC rejected the update.
- Escalate when: the attempt row is missing or the draft was not marked after an accepted HMRC response.

## Phase 5D read-back failed after accepted response

- User sees: accepted submission with read-back not completed.
- Check: `live_network_readback_failed` event, HMRC correlation ID, and whether the accepted attempt is otherwise successful.
- Safe response: “Submission was accepted, but read-back verification did not complete.”
- Do not say: the submission failed only because read-back failed.
- Escalate when: read-back repeatedly fails after an accepted response.

## user says figures are wrong after live pilot

- User sees: accepted live pilot but disputes figures.
- Check: locked draft lines, consent snapshot hashes, accountant export, and source records used in the submitted draft.
- Safe response: “The submitted pilot was based on the reviewed and locked quarterly draft. We can help trace source records, but amendment handling is future work.”
- Do not say: Tenaqo can amend the live submission in Phase 5D.
- Escalate when: source records do not match the locked draft snapshot.

## user asks whether final declaration is done

- User sees: accepted live pilot, sandbox success, or dry-run success.
- Check: attempt mode and status.
- Safe response: “This pilot submits a quarterly update only. It is not a final declaration and it does not complete the customer’s tax return.”
- Do not say: final declaration or annual update is complete.
- Escalate when: product copy implies final declaration is included.

## user asks if they can amend

- User sees: live pilot accepted and wants changes.
- Check: whether the request concerns the same quarterly period and whether any post-submission records changed.
- Safe response: “Amendment flow is not implemented in Phase 5D. Support can capture the case for future amendment handling.”
- Do not say: support can directly amend through Tenaqo.
- Escalate when: legal/product must decide an out-of-band HMRC correction process.
