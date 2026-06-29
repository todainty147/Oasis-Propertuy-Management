# Finance Provenance Operations Runbook

## Purpose

Finance provenance explains balances from rent, payment, cutover, and ledger events. It helps support distinguish legacy-compatible balances, provenance balances, and explained divergences. It does not certify that a tenant owes a legally recoverable amount.

## Scope and current status

Finance evidence is high-trust and customer-facing through balance evidence surfaces. Some reconstructed-history and cutover semantics exist for migrated accounts; native provenance accounts should avoid legacy migration wording unless relevant.

## Critical invariants

- Do not edit provenance events or finance cutover snapshots manually.
- Do not silently convert divergence into a match.
- Overpayments, voids, lease-end accrual quirks, and legacy formula differences must be explained rather than hidden.
- Account currency and account isolation must remain consistent.

## Key files

- `supabase/finance_snapshot.sql`
- `supabase/provenance_finance_cutover.sql`
- `supabase/provenance_explain_balance.sql`
- `src/services/financeService.js`
- `src/services/provenanceExplainService.js`
- `src/pages/FinancePage.jsx`
- `src/pages/provenance/BalanceEvidenceSummaryPage.jsx`
- `docs/provenance-sprint2-phase0-report.md`
- `docs/provenance-sprint2b-phase0-report.md`

## Data model / RPCs / functions

Relevant objects include payments, leases, properties, finance snapshots, provenance finance cutover rows, expected charge/rent events, and balance explanation RPCs.

## Normal operation

1. Legacy or native finance records produce a finance snapshot.
2. Provenance events record rent/payment/cutover facts.
3. Explanation service compares the balance basis.
4. UI surfaces matched, usable, or explained-divergence states with caveats.

## Common failure modes

- Wrong balance shown: compare snapshot, source payments, cutover, and provenance events.
- Duplicate payment: inspect payment idempotency/event linkage.
- Missing accrual: check lease dates, scheduled accrual, and expected charge events.
- Voided payment still counted: inspect status and void/reversal events.
- Legacy-compatible basis differs from more correct provenance basis.

## Triage checklist

1. Confirm account, property, tenant, lease, and currency.
2. Read latest payments and lease dates.
3. Read finance snapshot inputs and provenance cutover state.
4. Run balance explanation read model.
5. Classify as matched, stale, explained divergence, or needs engineering review.

## Safe operator actions

- Ask user to correct source payment/lease data through the product UI.
- Rerun read-only explanation.
- Export evidence for engineering review.

## Unsafe actions / never do

- Do not alter provenance events, hashes, or cutover rows manually.
- Do not delete duplicate-looking payments before preserving evidence.
- Do not promise a balance is legally recoverable.

## Customer-safe wording

“The balance view is based on the recorded rent and payment evidence. If the evidence basis differs from an older finance formula, we show that as a review item rather than silently changing history.”

## Escalation

Escalate if the same source facts produce inconsistent balance explanation, if account isolation fails, or if a provenance/legacy mismatch is not classified.

## Recovery / rollback notes

Prefer corrective source records or corrective provenance events. Avoid destructive edits.

## Verification after fix

- Explanation status is expected.
- Source rows and event rows agree.
- UI wording matches account provenance mode.

## Related tests

- Finance/provenance regression and integration tests under `tests/security`, `tests/integration`, and provenance sprint reports.
