# HMRC / MTD Operations Runbook

## Purpose

HMRC MTD tools support connection, read-only verification, sandbox submissions, controlled live-pilot checks, and draft preparation for accountant review. They do not certify tax outcomes or replace professional review.

## Scope and current status

- Sandbox and read-only verification are the normal support surface.
- Live-network submission is controlled by pilot allowlists and server-side kill switches.
- Dry-run and sandbox activity do not file a real HMRC return.
- See the incident-style support guide: [hmrc-submission-support-runbook.md](../support/hmrc-submission-support-runbook.md).

## Critical invariants

- Never expose access tokens, refresh tokens, client secrets, payload secrets, or decrypted token values.
- Do not retry a live-network submission if HMRC may have received it until attempt state is reconciled.
- Live submission requires explicit pilot controls; support cannot self-enable it.
- Sandbox success is not live filing.
- Consent is tied to the exact reviewed draft snapshot.

## Key files

- `src/services/hmrcMtdService.js`
- `src/services/mtdQuarterlyDraftService.js`
- `src/lib/mtd/hmrcLivePilotGuard.js`
- `src/lib/mtd/hmrcPhase5ReadinessGate.js`
- `src/lib/mtd/hmrcUkPropertyPeriodSummaryPayloadBuilder.js`
- `supabase/hmrc_mtd_phase*.sql`
- `supabase/hmrc_mtd_e1_uk_property_compliance.sql`
- `docs/hmrc/production-access/*`
- `docs/release/hmrc-phase5d-one-account-live-network-pilot.md`

## Data model / RPCs / functions

Important tables include HMRC connections, quarterly drafts, submission attempts/events, live pilot allowlist rows, consent records, and audit events. Use the current SQL overlay names in `supabase/hmrc_mtd_*.sql` to confirm exact table names before running queries.

## Normal operation

1. User connects HMRC in the intended environment.
2. Read-only checks retrieve obligations/business details/property business data.
3. Draft is built from source records and reviewed.
4. Sandbox submission or live-pilot dry run records an attempt and audit events.
5. Live-network pilot, when enabled, records an attempt outcome with safe network classification.

## Common failure modes

- Token expired or refresh failed: verify connection status and safe audit events.
- 401/403: check scopes and reconnection path.
- 429/5xx/HMRC outage: confirm no success attempt before retrying sandbox.
- Duplicate submission: check prior accepted attempt and draft live markers.
- Validation rejection: compare validation output to draft source lines.
- Live accepted but local write failed: stop retries and reconcile HMRC correlation and local attempt rows.

## Triage checklist

1. Confirm `account_id`, environment, and whether the action was sandbox, dry run, or live pilot.
2. Read the latest connection status and token expiry timestamps; do not inspect token values.
3. Read latest draft status, source hashes, validation summary, consent hashes, and attempt rows.
4. Check safe audit events and Edge Function error classification.
5. For live-network uncertainty, classify whether retry is safe before any further action.

## Safe operator actions

- Ask the user to reconnect HMRC.
- Ask the user to regenerate or relock a changed draft.
- Rerun read-only checks.
- Retry sandbox only after confirming no successful sandbox attempt for the same draft.
- Escalate live-network uncertainty with the relevant correlation id and local attempt id.

## Unsafe actions / never do

- Do not reveal or manually edit token values.
- Do not bypass pilot gates, kill switches, consent checks, or duplicate guards.
- Do not mark a live submission successful without reconciliation evidence.
- Do not tell a user that a sandbox/dry-run action filed with HMRC.

## Customer-safe wording

“Tenaqo can help prepare and evidence a reviewed HMRC MTD draft. Sandbox and dry-run checks are not live filing. If a live pilot action is uncertain, support must reconcile the attempt before any retry.”

## Escalation

Escalate to engineering/product/legal for live-pilot enablement, network uncertainty, repeated token refresh failures, duplicate-live markers, or any mismatch between HMRC response and local attempt state.

## Recovery / rollback notes

Most recovery is forward-only: reconnect, create a corrected draft, rerun sandbox, or reconcile the attempt. Do not delete audit or attempt rows.

## Verification after fix

- Connection status is healthy.
- Draft status and consent hashes match.
- Latest attempt has a terminal safe status.
- Audit events describe the action without secrets.

## Related tests

- HMRC service/security tests under `tests/security` and MTD-focused unit tests.
- Release smoke docs in `docs/release/hmrc-*`.
