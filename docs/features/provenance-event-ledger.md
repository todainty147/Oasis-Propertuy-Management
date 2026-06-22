# Provenance event ledger — Sprint 1

`provenance_events` is the append-only foundation for Tenaqo Explain. It records account-scoped events without changing finance, maintenance, compliance, document, tenant portal, or AI interfaces.

This sprint does **not** provide a tamper-evident external evidence system. `previous_event_hash` and `event_hash` are intentionally null until canonical serialization, hash versioning, verification, and anchoring are designed together.

## Write and access boundary

- Authenticated account operators with an effective `owner`, `admin`, or `staff` role write through `record_provenance_event`.
- The security-definer RPC checks `auth.uid()` and account membership itself before writing.
- Tenant and contractor principals have no read or write policy. Visibility therefore fails closed even if an event is marked `account`.
- Direct authenticated inserts, updates, deletes, and truncates are revoked. Update, delete, and truncate triggers provide a second append-only barrier.
- Corrections and reversals are new events referencing an existing same-account event.
- Database owners are trusted break-glass operators because they can disable triggers. That capability is not a user-facing or service-facing mutation path.

## Integrity model

Sequence allocation is serialized with a transaction-scoped advisory lock keyed by account, then allocated from a per-account counter. Calls for different accounts use different locks. Non-null idempotency keys are protected by a partial unique index and `ON CONFLICT DO NOTHING`; duplicate calls return the original event.

Human actors are derived from `auth.uid()`. System, AI, and integration events must identify a source in `source_type` or structured metadata. `recorded_at`, sequence numbers, IDs, and future hash values are server-owned.

Money is stored only as integer minor units in `amount_minor`, with `currency` required whenever an amount is present.

## Sprint 1.5 recommendations

1. Define versioned canonical JSON serialization, including explicit null and timestamp rules.
2. Compute `previous_event_hash` and `event_hash` inside the same serialized account transaction.
3. Add a verifier that detects sequence gaps, hash mismatches, and unexpected chain heads.
4. Periodically anchor signed account chain heads in an independently controlled immutable store.
5. Record anchor receipts as separate operational evidence and alert on verification drift.
6. Add key rotation, algorithm agility, retention, export, and break-glass runbooks before making tamper-evidence claims.
