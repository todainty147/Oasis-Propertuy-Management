# HMRC MTD Roadmap

## Current Status

1. OAuth + read-only verification - complete.
2. Digital record and tax tools - implemented.
3. Quarterly draft builder - complete.
4. Sandbox UK property period summary submission - current phase.
5. Live submission pilot - later.
6. End-of-year / final declaration - later.

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
| Sandbox UK property period summary submission | Current |
| Live quarterly submission | Not implemented |
| Final declaration | Not implemented |

## Next Phase

The next phase after sandbox UK property period summary submission is a live-submission pilot design. It must remain behind a separate approval process and keep `hmrc_mtd_live_submission` disabled until production controls are ready.
