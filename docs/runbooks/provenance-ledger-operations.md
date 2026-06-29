# Provenance Ledger Operations Runbook

## Purpose

The provenance ledger records append-only historical evidence with hash-chain verification. It supports finance, document service, RPE, proof pack, and audit explanations. It does not prove current human identity from historical actor UUIDs alone.

## Scope and current status

The ledger is production-sensitive evidence infrastructure. Some downstream RPE/proof pack flows remain demo-gated; ledger integrity itself must be treated as high trust.

## Critical invariants

- Events are append-only.
- Hash inputs must remain canonical for their version.
- `previous_event_hash`, sequence, and counter state must remain consistent.
- Historical `actor_user_id` is immutable evidence and may outlive live auth records.
- Do not reseal or overwrite historical hashes during support work.

## Key files

- `supabase/provenance_events.sql`
- `supabase/migrations/20260622000000_provenance_hash_chain_backfill.sql`
- `supabase/provenance_finance_cutover.sql`
- `supabase/provenance_explain_balance.sql`
- `supabase/provenance_document_service.sql`
- `src/services/provenanceExplainService.js`
- `src/services/provenanceDocumentService.js`
- `src/pages/provenance/BalanceEvidenceSummaryPage.jsx`
- `src/pages/provenance/DocumentServiceTimelinePage.jsx`
- `docs/features/provenance-event-ledger.md`

## Data model / RPCs / functions

Important objects include `provenance_events`, account counters/status helpers, `record_provenance_event`, `verify_provenance_chain`, finance cutover functions, balance explanation functions, and document service provenance RPCs.

## Normal operation

1. Domain action calls a hardened RPC.
2. RPC records a provenance event with canonical payload and account-scoped sequence.
3. Hash chain links to previous account event.
4. Verification can later recompute the chain and report status.

## Common failure modes

- Chain mismatch: canonical payload, hash version, or previous hash does not match.
- Counter missing or drifted: account has events but counter state is inconsistent.
- Duplicate idempotency key: same domain action attempted twice.
- Account isolation denial: caller cannot verify or read another account’s chain.
- Backfill conflict: existing hash does not recompute.

## Triage checklist

1. Confirm account id and event family.
2. Run read-only event queries ordered by sequence.
3. Run verifier RPC as an authorized owner/admin/root operator.
4. Check hash version and previous hash at the first failing sequence.
5. Compare domain action row with event metadata and idempotency key.

## Safe operator actions

- Run read-only verification.
- Preserve failing event ids, sequence numbers, and hashes.
- Escalate with exact account id and failing sequence.

## Unsafe actions / never do

- Do not update `event_hash`, `previous_event_hash`, sequence, canonical fields, or actor fields manually.
- Do not delete ledger events to “fix” a chain.
- Do not bypass security-definer guard functions.
- Do not treat actor UUID as proof of current identity after deletion/anonymisation.

## Customer-safe wording

“We found an evidence-chain inconsistency and are preserving the audit trail while engineering investigates. We will not rewrite historical evidence to hide the mismatch.”

## Escalation

Escalate immediately for hash mismatch, missing counter with events, cross-account visibility, or any write attempted outside the approved RPC path.

## Recovery / rollback notes

Recovery is evidence-preserving. Engineering may add corrective events or run a reviewed migration, but support must not reseal history.

## Verification after fix

- Verifier reports passed for the account.
- Counter next sequence equals last sequence plus one.
- Domain read model still matches expected state.
- Audit/provenance events explain any correction.

## Related tests

- Provenance contract/unit/integration tests under `tests/security` and provenance-focused suites.
