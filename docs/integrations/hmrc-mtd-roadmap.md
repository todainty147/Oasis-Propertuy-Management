# HMRC MTD Roadmap

## Current Status

1. OAuth + read-only verification - complete.
2. Digital record and tax tools - implemented.
3. Quarterly draft builder - complete.
4. Phase 4 sandbox UK property period summary submission - complete.
5. Phase 5A consent framework - complete.
6. Phase 5B live pilot cage - complete.
7. Phase 5C live endpoint skeleton/dry run - current.
8. Phase 5D one-account live network pilot - future.
9. Phase 6 annual/final declaration - future.

## Guardrails

Live HMRC submission remains disabled. Sandbox submission is limited to reviewed or locked quarterly drafts, the HMRC test API base URL, and accounts explicitly enabled with `hmrc_mtd_sandbox_submission`.

HMRC tokens stay server-side and encrypted. Draft exports must not include access tokens, refresh tokens, client secrets or unnecessary raw HMRC identifiers.

## Phase 3 Scope

The quarterly draft builder:

- reuses existing Tenaqo tax records and Tax Tools data
- creates draft snapshots and draft lines
- flags estimate-only and accountant-review items
- produces category totals and preview-only payload JSON
- exports draft summary and source-record CSV files

It does not call HMRC submission endpoints.

## Capability Matrix

| Capability | Status |
| --- | --- |
| OAuth connection | Complete |
| Server-side encrypted tokens | Complete |
| Business Details read-only check | Complete |
| Obligations read-only check | Complete, including no-data handling |
| Property Business read-only check | Complete, including no-data handling |
| Tax records and Tax Tools | Implemented |
| Quarterly draft snapshots | Implemented |
| Payload preview | Preview-only |
| Accountant exports | Implemented for draft summary/source records |
| Sandbox UK property period summary submission | Complete |
| Consent framework | Complete |
| Live pilot cage | Complete |
| Live endpoint skeleton / dry run | Current |
| One-account live network pilot | Future |
| Live quarterly submission | Not generally implemented |
| Final declaration | Not implemented |

## Next Phase

The current phase is a live endpoint skeleton and dry-run control. The next phase is a one-account live network pilot, which must remain behind root/operator approval, server-side kill switches and support readiness. `READY_FOR_LIVE_SUBMISSION` remains false until a later explicit live network pilot approval.
