# Phase 5D E2E Failure Triage

Date recorded: 2026-06-05

## Run Summary

Command attempted:

```bash
npm run test:e2e
```

Result:

- 266 passed.
- 102 failed.
- 38 did not run.

The exact requested JSON reporter command was attempted:

```bash
npm run test:e2e -- --reporter=json --outputFile=tmp/phase5d-e2e-results.json
```

It failed immediately because this Playwright version does not support `--outputFile`.

Supported rerun command:

```bash
set PLAYWRIGHT_JSON_OUTPUT_NAME=tmp\phase5d-e2e-results.json&& npm run test:e2e -- --reporter=json
```

Rerun result:

- 261 passed.
- 103 failed.
- 42 did not run.
- JSON artifact: `tmp/phase5d-e2e-results.json`.

## Phase 5D Impact

No failure observed in this broad run directly referenced the Phase 5D live pilot endpoint, Phase 5A consent assertion, Phase 5B pilot cage, Phase 5C dry-run path, or Quarterly Draft live pilot copy. However, several failure groups are blocking before any real one-account live pilot because they affect role safety, account switching, app shell navigation, finance, tenant isolation, or broad release accessibility.

## Failure Groups

| Test file / group | Module area | Example failure | Phase 5D related | Blocks one-account live pilot | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `tests/e2e/app-shell.spec.js` | app shell | Sign-in heading not visible | Indirect | Yes | Fix or explain app shell/session routing instability before pilot. |
| `tests/e2e/role-navigation-permissions.spec.js` | roles | Owner/admin/staff scoped reads and root support account switching failed | Indirect | Yes | Fix role/account test failures; live pilot relies on strict account scoping and root-operator controls. |
| `tests/e2e/tenant-restrictions-flow.spec.js` | tenant portal | Tenant home overview not visible; tenant restricted surface failed | Indirect | Yes | Fix tenant isolation/navigation failures before pilot. |
| `tests/e2e/finance*.spec.js` | finance | Finance tab/filter/payment display tests failed; voided duplicate receipt regression failed | Indirect | Yes | Fix finance calculations/UI failures before live tax pilot because quarterly draft source data depends on finance correctness. |
| `tests/e2e/currency-localization.spec.js` | finance | Localization save did not show persisted success | Indirect | Yes | Triage account settings persistence before pilot if it affects account currency/tax records. |
| `tests/e2e/notifications*.spec.js` | notifications | Notification delivery and bell read/link behavior failed | No direct HMRC failure | Potentially | Non-HMRC notifications may be waived, but any HMRC/consent/pilot notification dependency must be tested before pilot. |
| `tests/e2e/responsive-accessibility-release.spec.js` | accessibility | Dashboard/finance/documents/contractor/root telemetry accessibility scans failed | Indirect | Yes for finance/tax/HMRC-adjacent surfaces | Fix or waive with evidence; do not waive HMRC/Tax/Consent/Pilot accessibility issues. |
| `tests/e2e/operating-calendar.spec.js` | other | Calendar agenda/month item tests failed | No | Probably not | Can be non-blocking only with evidence that Tax/HMRC screens are unaffected. |
| `tests/e2e/poland-compliance*.spec.js` | Poland compliance | Checklist/evidence/security-route failures | No direct HMRC failure | Potentially | Triage if shared compliance shell, role routing, or document evidence surfaces are affected. |
| `tests/e2e/document-*.spec.js` | other | Document packets/requests/template library failed | No direct HMRC failure | Potentially | Waive only if HMRC evidence/export/document dependencies are unaffected. |
| `tests/e2e/maintenance-*.spec.js` | other | Maintenance inbox/work order/AI flow failed | No | Probably not | Likely non-blocking for Phase 5D, with evidence. |
| `tests/e2e/*screenshots*.spec.js` | screenshots | Marketing/LinkedIn/compliance screenshots failed | No direct HMRC failure | Maybe for compliance screenshots | Screenshot drift can be non-blocking if visual changes are intentional and HMRC/Tax screenshots are separately verified. |
| `tests/e2e/security-audit-investigation.spec.js` | roles/security | Security audit ledger/root panel tests failed | Indirect | Yes | Fix or formally waive only after confirming HMRC audit events remain visible to support/admin. |
| `tests/e2e/self-serve-signup*.spec.js` | app shell | Sandbox signup failed | No direct HMRC failure | Potentially | Non-blocking only if pilot test account is provisioned through another verified path. |
| `tests/e2e/ai-surface-robustness.spec.js` | other | AI request/requestId mismatch and rate-limit card stuck loading | No | Probably not | Non-blocking for Phase 5D if Tax/HMRC surfaces have no dependency. |

## Blocking Classification

Blocking before real live pilot:

- App shell/session failures that can affect access to Quarterly Drafts/HMRC screens.
- Role/account/root support failures.
- Tenant portal isolation failures.
- Finance calculation/UI failures.
- Finance/tax/accessibility failures on relevant surfaces.
- Security audit failures if HMRC audit visibility is affected.

Potentially non-blocking with evidence:

- Unrelated marketing screenshot drift.
- Maintenance-only workflows.
- Calendar-only workflows.
- Non-HMRC notifications.
- Visual-only issues outside Tax/HMRC/Finance/Roles.

## Current Decision

Phase 5D is implemented but not cleared for real live-network execution. The remaining E2E failures require triage, fixes, or explicit evidence-backed waivers before `READY_FOR_REAL_LIVE_NETWORK_ATTEMPT` can be true.

Detailed grouped failure output from `tmp/phase5d-e2e-results.json` is recorded in `docs/release/phase5d-e2e-clearance.md`.
