# Provenance event ledger — Sprint 1

`provenance_events` is the append-only foundation for Tenaqo Explain. It records account-scoped events without changing finance, maintenance, compliance, document, tenant portal, or AI interfaces.

Sprint 1.5 adds a server-computed SHA-256 hash chain using canonical field set v0.3. Each event persists its hash version, its predecessor hash, and its own event hash. Owner/admin verification checks hash versions, sequence continuity, links, event contents, the account chain head, and the next sequence counter.

This remains an internally verified ledger, not independently anchored external evidence. It must not be described as immune to a privileged database operator who can disable triggers or replace both records and verification code.

## Write and access boundary

- Authenticated account operators with an effective `owner`, `admin`, or `staff` role write through `record_provenance_event`.
- The security-definer RPC checks `auth.uid()` and account membership itself before writing.
- Tenant and contractor principals have no read or write policy. Visibility therefore fails closed even if an event is marked `account`.
- Direct authenticated inserts, updates, deletes, and truncates are revoked. Update, delete, and truncate triggers provide a second append-only barrier.
- Corrections and reversals are new events referencing an existing same-account event.
- Database owners are trusted break-glass operators because they can disable triggers. That capability is not a user-facing or service-facing mutation path.

## Integrity model

Sequence allocation is serialized with a transaction-scoped advisory lock keyed by account, then allocated from a per-account counter. Calls for different accounts use different locks. Non-null idempotency keys are protected by a partial unique index and `ON CONFLICT DO NOTHING`; duplicate calls return the original event.

Human actors are derived from `auth.uid()`. Their UUID is retained as a pseudonymous historical identifier but is intentionally not foreign-keyed to `auth.users`: a reviewed privacy deletion can remove the live login identity without mutating or blocking the append-only event. System, AI, and integration events must identify a source in `source_type` or structured metadata. `recorded_at`, sequence numbers, IDs, and future hash values are server-owned.

Money is stored only as integer minor units in `amount_minor`, with `currency` required whenever an amount is present.

## Hash-chain verification

- The insert trigger stamps `hash_version = 0`, links to the account’s current `head_hash`, and computes `event_hash` server-side.
- Canonical field set v0.3 covers evidential content including actor role, property, tenancy, timestamps, metadata, money, correction links, and correlation identifiers.
- Existing non-null hashes are verified rather than rewritten when the backfill migration is rerun. A mismatch aborts the migration.
- `verify_provenance_chain` is restricted to account owners, account admins, and root operators. Staff, tenants, contractors, and cross-account callers are denied.
- Verification detects unsupported hash versions, sequence gaps, broken links, changed canonical content, missing counters, head drift, and next-sequence drift.

## Historical Actor Identity Policy

- `actor_user_id` is immutable historical evidence captured when an event is recorded.
- It is intentionally not foreign-key linked to `auth.users`.
- A reviewed GDPR deletion may remove the corresponding live authentication and identity records.
- The provenance ledger retains the actor UUID as a pseudonymous historical reference without retaining a live login identity.
- An actor UUID records historical attribution only. It is not proof that the user currently exists, controls an account, or has the same identity or permissions today.

## Sprint 2A — Finance Provenance Cutover Prep

Sprint 2A prepares the provenance ledger to explain finance balances. It does not expose any UI.

### Cutover model

Each account has a `provenance_finance_cutover` row defining when live provenance begins. Before cutover: historical reconstruction. From cutover onward: live transactional events. No gap, no overlap.

### Factual vs reconstructed events

The current finance system is not event-sourced. `finance_snapshot` calculates balances from current state (months_elapsed × properties.rent − total paid). Historical monthly rent charge records do not exist.

Sprint 2A does NOT fabricate one `rent.charged` event per month. Synthetic historical charge rows would permanently enshrine a legacy formula as contemporaneous evidence. Instead:

- **`finance.legacy_obligation_snapshot`** — one reconstructed event per property at cutover. Records the gross expected obligation (months_elapsed × rent) derived from `finance_snapshot`'s own accumulation logic via the shared `finance_property_accumulation` function. Metadata explicitly marks it as reconstructed and warns it is not a contemporaneous charge record.
- **`payment.recorded`** — factual: one per existing payment. Backfilled from the payments table.
- **`payment.marked_paid`** — factual: one per paid payment. Backfilled from payments where paid_at is set.
- **`payment.voided`** — factual: one per void payment.

### How the obligation is derived

The obligation amount must reproduce `finance_snapshot` by construction. `finance_property_accumulation` is a shared SQL function that extracts the per-property accumulation logic (months_elapsed, rent, paid totals, rent-start date and source, clamped remaining). Both `finance_snapshot` and the backfill consume the same implementation.

The obligation stores the GROSS expected amount (pre-clamp). It does not store the clamped `remaining`, which already nets out paid amounts and would double-subtract payments in the projection.

### Balance projection

`provenance_balance_projection` computes per-property balance from provenance events:
- `finance.legacy_obligation_snapshot` contributes positive (debit)
- `payment.marked_paid` contributes negative (credit)
- `payment.recorded` contributes exactly 0 (informational — the obligation snapshot already carries the full expected amount)
- `payment.reopened` contributes positive (reverses a credit)
- `payment.voided` contributes 0 (informational)
- Reversed/superseded events contribute 0

### Reconciliation gate

`provenance_reconciliation_gate` compares per-property:
- Legacy: `finance_snapshot`'s per-property `remaining` (the clamped figure)
- Provenance: `provenance_balance_projection`'s per-property `balance_minor`

The one expected divergence is **overpayment_credit_clamp**: legacy clamps remaining at 0, provenance shows the negative (tenant credit). This is classified as `explained_divergence`. All other divergence is `unexplained_divergence` and blocks public exposure.

### Live instrumentation

After cutover, payment write RPCs emit provenance events in the same transaction:
- `create_payment` → `payment.recorded` (+ `payment.marked_paid` if paid_at set)
- `mark_payment_paid` → `payment.marked_paid`
- `mark_payment_unpaid` → `payment.reopened`
- `reopen_payment` → `payment.reopened`
- `void_payment` → `payment.voided`
- `update_payment` → `payment.adjusted` (on amount change)
- `delete_payment` → `payment.deleted`

Instrumentation is at the database write path, not the frontend service layer. If the payment mutation succeeds but provenance write fails, the whole transaction rolls back.

### Limitations

- Balances match the legacy formula (current `properties.rent` × months). Mid-tenancy rent changes are not tracked; both sides use the current rent.
- `expected_charges` are excluded from both legacy and provenance balances.
- Tenant access to balance explanation is not implemented (Sprint 2B+).
- Dashboard balances are not replaced (Sprint 3).

### Future: actual historical rent charges

When the system tracks per-month rent at time of charge, the obligation snapshot can be replaced by actual `rent.charged` events. At that point, mid-tenancy rent changes become a real (explained) divergence from the legacy formula.

## Remaining recommendations

1. Periodically anchor signed account chain heads in an independently controlled immutable store.
2. Record anchor receipts as separate operational evidence and alert on verification drift.
3. Add algorithm agility and verifier dispatch before introducing a hash version other than `0`.
4. Add key rotation, retention, export, and break-glass runbooks before making externally verifiable tamper-evidence claims.
