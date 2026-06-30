# E-144 Evidence → Provenance Integration Design Report

**Version:** 1.0  
**Date:** 30 June 2026  
**Branch:** codex/hmrc-e1-hardening  
**Method:** Code-read + design spike. Exercised anchor proof: NOT RUN (no live DB access).  
**Scope:** Design pass only. No production flows changed.

---

## 1. Current provenance substrate

### Tables

| Table | Purpose |
|---|---|
| `public.provenance_events` | Append-only event ledger. SHA-256 hash chain per account. |
| `public.provenance_event_counters` | Per-account sequence counter + running head hash. |
| `public.provenance_chain_status` | Mutable cache of last chain verification result. |
| `public.provenance_finance_cutover` | Finance-specific: cutover timestamp separating legacy/native provenance. |

`provenance_events` schema (key columns):
- `entity_type text NOT NULL` — any string; no allowlist constraint
- `entity_id uuid NOT NULL` — not foreign-keyed; preserves evidence after source row deletion
- `event_type text NOT NULL` — any string; no allowlist constraint
- `actor_type check ('human','system','ai','integration')`
- `actor_user_id uuid` — not FK to auth.users (privacy-safe pseudonymous historical record)
- `metadata jsonb` — canonical payload includes full metadata object
- `previous_event_hash`, `event_hash` — SHA-256 hash chain, computed server-side
- `idempotency_key` — unique index, optional; enables idempotent writes
- `supersedes_event_id`, `reversal_of_event_id` — correction/reversal pointers

### Functions / RPCs

| Function | Purpose | Auth |
|---|---|---|
| `record_provenance_event()` | Generic public RPC — any entity_type/event_type | Authenticated owner/admin/staff |
| `_append_document_provenance_event()` | Internal helper — hardcodes entity_type='document' | SECURITY DEFINER, internal only |
| `_verify_provenance_chain_internal()` | Full chain re-verification | SECURITY DEFINER, internal only |
| `verify_provenance_chain()` | Public auth-gated chain verifier | Authenticated owner/admin |
| `verify_and_persist_chain_status()` | Verifies and upserts chain_status cache | Authenticated owner/admin/staff |
| `get_provenance_chain_head()` | Returns head sequence + head_hash | Internal only |
| `verify_provenance_anchor()` | Spot-check against an anchor event | Authenticated owner/admin/staff |
| `provenance_canonical_payload_v0()` | Serialises event to 26-field canonical string | Internal (stable) |
| `provenance_lp()` | Length-prefixed field serialiser | Internal (immutable) |
| `provenance_genesis_sentinel()` | Returns 64-zero genesis hash | Internal |

**Sprint 3 document service layer** (`provenance_document_service.sql`):

| Function | Event type |
|---|---|
| `record_document_uploaded()` | `document.uploaded` |
| `record_document_served_asserted()` | `document.served_asserted` |
| `record_document_served_system()` | `document.served_system` (service_role) |
| `record_document_delivery_confirmed()` | `document.delivery_confirmed` (service_role) |
| `record_document_service_failed()` | `document.service_failed` (service_role) |
| `record_document_available()` | `document.available` |
| `record_document_viewed()` | `document.viewed` (service_role) |
| `record_document_downloaded()` | `document.downloaded` (service_role) |
| `record_document_acknowledged()` | `document.acknowledged` |
| `record_document_expired()` | `document.expired` |
| `record_document_replaced()` | `document.replaced` |
| `record_document_withdrawn()` | `document.withdrawn` |
| `document_service_projection()` | Evidence strength projection from event stream |
| `get_document_service_timeline()` | Full timeline + chain integrity status |

### Triggers

| Trigger | Table | Event | Purpose |
|---|---|---|---|
| `trg_provenance_events_compute_hash` | provenance_events | BEFORE INSERT | Computes event_hash and reads previous_event_hash from counter row. |
| `trg_provenance_events_advance_head_hash` | provenance_events | AFTER INSERT | Updates head_hash in counter row. |
| `trg_provenance_events_block_update` | provenance_events | BEFORE UPDATE | Append-only enforcement. |
| `trg_provenance_events_block_delete` | provenance_events | BEFORE DELETE | Append-only enforcement. |
| `trg_provenance_events_block_truncate` | provenance_events | BEFORE TRUNCATE | Append-only enforcement. |

### Canonical payload (v0.3, 26 fields)

The hash covers: account_id, sequence_number, entity_type, entity_id, property_id, tenancy_id, event_type, event_version, actor_type, actor_user_id, actor_role, occurred_at, recorded_at, summary, reason, metadata, amount_minor, currency, source_type, source_id, supersedes_event_id, reversal_of_event_id, correlation_id, causation_id, visibility, previous_event_hash.

**Key design properties:**
- `metadata` is included in the canonical payload — document/content hashes placed in metadata are cryptographically committed to the chain.
- `entity_type` and `entity_id` are open strings — no finance-specific constraint.
- `actor_user_id` is not a FK — historical record survives identity deletion.
- Idempotency: unique index on `(account_id, idempotency_key)` where key is not null.

### Finance-specific items (must NOT leak into evidence layer)

- `provenance_finance_cutover` table and `provenance_finance_tracking_active()` function are finance-only.
- `finance.legacy_obligation_snapshot` event type — finance-only; no evidence analogue needed.
- `account_provenance_mode` column — currently set by the finance cutover prep for legacy accounts. Evidence layer should NOT branch on this value.
- `provenance_reconciliation_gate()` — finance-specific. Do not call from evidence paths.

### Is the substrate generic or finance-specific?

**Generic.** The `provenance_events` table and `record_provenance_event()` RPC accept any entity_type and event_type with no allowlist. The BEFORE INSERT trigger, hash chain, verifier, and chain_status cache are all entity-type-agnostic. Finance assumptions live only in Sprint 2A/2B overlay files and in the finance-specific event types (`payment.*`, `finance.*`). The Sprint 3 document layer (`provenance_document_service.sql`) already proves the pattern is extensible: 12 document event types are anchored through the same chain, accepted by the same verifier, and projected into a service status model — all without any changes to the core substrate.

---

## 2. Current evidence/proof surfaces

### Critical pre-audit finding

`provenance_document_service.sql` (Sprint 3) is already committed to the repo. It implements:
- A document versioning model (`document_family_id`, `version_number`)
- 12 document event types covering upload, service, access, acknowledgement, expiry, replacement, withdrawal
- `_append_document_provenance_event` internal helper
- `document_service_projection()` evidence strength model
- `get_document_service_timeline()` chain-verified timeline RPC

**The E-035 gap ("served_at is just a timestamp") is already solved at the SQL layer.** The `record_document_served_asserted()` and `record_document_served_system()` RPCs record actor, recipient (hashed), channel, date, notification ID, and provider message ID through the provenance chain. The gap is that these RPCs are not yet called from the application — `served_at` on `tenancy_compliance_items` is still manually populated.

`src/services/provenanceDocumentService.js` exists with wrappers for all document event RPCs. A `DocumentServiceTimelinePage` page exists at `src/pages/provenance/DocumentServiceTimelinePage.jsx`.

### E-032 — Evidence Vault

**Proof-bearing events:**
- `inspection_report.created` — additive
- `inspection_report.locked` — **atomic** (must capture report state hash at lock instant)
- `inspection_report.archived` — additive
- `inspection_report.shared_with_tenant` — additive
- `inspection_evidence.attached` (photo/item added) — additive
- `inspection_evidence.scan_clean` — additive
- `inspection_report.deleted` — additive (audit trail if delete-block E-032 not yet live)

**Current gap:** No provenance events emitted for any inspection report lifecycle act. The `inspection_audit_events` table records events locally but they are not chained or hash-verified.

**Should emit provenance events later:** Yes.

**Anchor-additive vs atomic:** `inspection_report.locked` is **anchor-atomic** — the report content hash must be captured at the moment of status change. All others are additive.

### E-033 — Signatures

**Proof-bearing events:**
- `signature.captured` — **anchor-atomic** (must include report content hash at signing instant)
- `signature.invalidated` — additive (correction event if signed-not-locked mutation detected)

**Current gap:** No provenance events emitted. `inspection_signatures` rows have no document hash.

**Should emit provenance events later:** Yes. `signature.captured` is the most critical anchor-atomic event in the evidence layer — it is the only mechanism that can bind a signature record to a specific document version.

**Anchor-additive vs atomic:** `signature.captured` is **anchor-atomic**. `signature.invalidated` is additive.

### E-034 — Deposit dispute pack

**Proof-bearing events:**
- `deposit_dispute_pack.created` — additive
- `deposit_dispute_pack.exported` — additive (replaces fire-and-forget `recordDepositDisputePackExport`)
- `deposit_dispute_pack.source_set_frozen` — additive
- `deposit_dispute_pack.locked` — additive

**Current gap:** Export is recorded in `deposit_dispute_pack_exports` without content hash or disclosure basis. `inspection_report.EvidenceVaultPrintPage` has no export record at all.

**Should emit provenance events later:** Yes. `deposit_dispute_pack.exported` with content hash closes E-036 gap simultaneously.

**Anchor-additive vs atomic:** All deposit dispute pack events are **additive**.

### E-035 — Document served events

**Proof-bearing events — already implemented at SQL layer:**
- `document.served_asserted` — actor, recipient (SHA-256 hash), service method, date
- `document.served_system` — system send event with notification_id + provider_message_id
- `document.delivery_confirmed` — provider webhook confirmation
- `document.service_failed` — failure with failure category

**Current gap:** `tenancy_compliance_items.served_at` is still the only application-layer service record. Sprint 3 RPCs exist but are not called from the compliance safe flow.

**Should emit provenance events:** The SQL layer is already complete. The gap is wiring.

**Anchor-additive vs atomic:** All service event recording is **additive** — the service act precedes the recording act, and recording slightly after the act still captures the correct information.

### E-036 — Proof pack disclosure basis

**Proof-bearing events:**
- `proof_pack.exported` with `disclosure_basis` in metadata — additive
- `deposit_dispute_pack.exported` with `content_hash` — additive

**Current gap:** No disclosure basis field, no content hash. Export is fire-and-forget.

**Should emit provenance events later:** Yes. The ledger's metadata field can carry `disclosure_basis` and `content_hash` of the artifact list.

**Anchor-additive vs atomic:** **Additive** — export recording happens after the browser print/save action.

### E-025 — Proof Packs

**Proof-bearing events:**
- `proof_pack.assembled` — additive
- `proof_pack.exported` — additive
- `proof_pack.source_set_frozen` — additive (artifact list + version IDs committed to chain)

**Current gap:** No chain-anchored pack events. No content hash.

**Should emit provenance events later:** Yes.

**Anchor-additive vs atomic:** All **additive**.

### E-018 — Compliance Safe (evidence aspects)

**Proof-bearing events:**
- `compliance_item.evidence_linked` — additive (document attached to item)
- `compliance_item.service_recorded` — additive (replaces bare `served_at`)
- `compliance_item.value_human_verified` — **anchor-atomic** (the verification act is the evidence — must be captured at the instant the manager confirms the value)
- `compliance_item.acknowledged` — additive
- `compliance_item.expired` — additive
- `compliance_item.legal_hold_applied` — additive

**Current gap:** None of these events are emitted. `served_at` is a mutable timestamp. No human-verification gate.

**Should emit provenance events later:** Yes. `compliance_item.value_human_verified` is the key event that closes the OCR auto-trust chain gap.

**Anchor-additive vs atomic:** `compliance_item.value_human_verified` is **anchor-atomic**. All others are additive.

### E-084 — OCR / scanning

**Proof-bearing events:**
- `ocr.extraction_completed` — additive (text extracted with confidence score + source_hash)
- `ocr.extraction_stale` — additive (source file changed, prior extraction superseded)
- `ocr.value_human_verified` — **anchor-atomic** (must be captured at the exact moment the manager confirms the extracted value against the source document)

**Current gap:** No provenance events emitted. `document_extractions.source_hash` preserves the raw file identity but the extraction event is not anchored.

**Should emit provenance events later:** Yes. `ocr.value_human_verified` is the most safety-critical event for the compliance OCR trust chain.

**Anchor-additive vs atomic:** `ocr.value_human_verified` is **anchor-atomic**. `ocr.extraction_completed` and `ocr.extraction_stale` are additive.

---

## 3. Proposed shared integration surface

### 3.1 Event taxonomy

Full taxonomy defined in `supabase/evidence_provenance_stub.sql` §1. Reproduced here with overclaim test:

| Event type proposed | Overclaim test | Result |
|---|---|---|
| `inspection_report.locked` | Does "locked" assert the report is legally immutable? No — it asserts the system's mechanical lock state. | **PASS** |
| `inspection_report.archived` | Same analysis. | **PASS** |
| `inspection_evidence.attached` | Asserts a photo was attached. No causation or fault claim. | **PASS** |
| `signature.captured` | Asserts the signature gesture was recorded. Does not assert legal execution or binding force. | **PASS** |
| `signature.invalidated` | Asserts the signature was invalidated by the system. No legal conclusion. | **PASS** |
| `document.served_asserted` | "Asserted" is explicit: a landlord asserted service. Not "validly served". | **PASS** |
| `document.served_system` | "System" denotes the send act. Does not claim legal delivery. | **PASS** |
| `document.delivery_confirmed` | "Confirmed by provider" — a technical delivery event, not legal receipt. | **PASS** |
| `compliance_item.service_recorded` | "Recorded" — the act of recording. Not "served" or "validly served". | **PASS** |
| `compliance_item.value_human_verified` | "Human verified" — the verification act. Does not assert the value is correct or legally valid. | **PASS** |
| `compliance_item.acknowledged` | Acknowledgement captured. Not "acceptance" or "agreement". | **PASS** |
| `compliance_item.legal_hold_applied` | Mechanical state: the hold was applied. Acceptable. | **PASS** |
| `ocr.extraction_completed` | Completion of the extraction process. No accuracy claim. | **PASS** |
| `ocr.value_human_verified` | Same as compliance_item version. | **PASS** |
| `proof_pack.exported` | The export act. No claim about legal standing or content validity. | **PASS** |
| `deposit_dispute_pack.disclosure_basis_recorded` | Basis was recorded. No claim about validity of disclosure. | **PASS** |

**Rejected names (overclaim):**
- `document.validly_served` — rejects legal conclusion the system cannot check
- `signature.legally_executed` — rejects legal conclusion
- `compliance_item.compliant` — derived status, not an event
- `ocr.value_validated` — "validated" implies accuracy claim the system cannot make
- `service_event.served` — too close to "legally served"

### 3.2 Canonical payload shape

Evidence events use the existing canonical field set v0.3. No extension to the hash schema is needed.

**Required fields for all evidence events:**
```
entity_type   — evidence entity category ('inspection_report', 'signature', 'compliance_item', etc.)
entity_id     — UUID of the source row
event_type    — from taxonomy above
actor_type    — 'human' | 'system'
actor_user_id — auth.uid() for human events; null for system events
actor_role    — effective role at time of act
occurred_at   — when the act happened (not when it was recorded)
summary       — human-readable description
property_id   — for property-scoped evidence
tenancy_id    — for tenancy-scoped evidence
metadata      — see §3.3
idempotency_key — prevents duplicates on retry
```

### 3.3 Metadata payload per event family

**inspection_report.locked:**
```jsonb
{
  "report_content_hash":  "<SHA-256 of canonical report JSON>",
  "locked_by_user_id":    "<uuid>",
  "locked_at":            "<ISO timestamp>",
  "room_count":           <integer>,
  "item_count":           <integer>,
  "photo_count":          <integer>,
  "signature_count":      <integer>,
  "inspection_type":      "check_in|check_out|..."
}
```

**signature.captured:**
```jsonb
{
  "signature_id":          "<uuid>",
  "signer_role":           "landlord|tenant",
  "signed_from":           "landlord_portal|tenant_portal",
  "share_id":              "<uuid or null>",
  "report_content_hash":   "<SHA-256 of canonical report JSON AT signing instant>",
  "signed_at":             "<ISO timestamp>"
}
```
The `report_content_hash` here is the most critical field. It must be computed from the **current** report state at the moment of signing, not after.

**compliance_item.value_human_verified:**
```jsonb
{
  "compliance_item_id":     "<uuid>",
  "verified_field":         "expires_at|served_at|...",
  "verified_value":         "<the value the human confirmed>",
  "source_document_id":     "<uuid or null>",
  "ocr_extraction_id":      "<uuid or null>",
  "verification_method":    "manual|cross_checked_against_original",
  "verified_at":            "<ISO timestamp>"
}
```

**proof_pack.exported / deposit_dispute_pack.exported:**
```jsonb
{
  "pack_id":             "<uuid>",
  "pack_type":           "deposit_dispute_pack|inspection_report_pack",
  "export_type":         "pdf|browser_print",
  "content_hash":        "<SHA-256 of ordered artifact ID list>",
  "artifact_count":      <integer>,
  "disclosure_basis":    "<why this pack was assembled/exported>",
  "exported_at":         "<ISO timestamp>"
}
```

**ocr.extraction_completed:**
```jsonb
{
  "document_id":          "<uuid>",
  "extraction_id":        "<uuid>",
  "extractor":            "native_pdf|docling|...",
  "source_hash":          "<SHA-256 of raw file bytes>",
  "confidence_score":     <float>,
  "quality_flag":         "ok|low_confidence|...",
  "document_version_id":  "<uuid>",
  "document_family_id":   "<uuid>"
}
```

### 3.4 Source-row references

Source rows referenced by ID in `source_id` + `source_type`. No blob copying.  
Content hashes of large objects (photos, documents) live in `metadata.content_hash` / `metadata.report_content_hash`.  
`entity_id` is not foreign-keyed — event survives source row deletion, preserving the audit trail even after the row is gone.

### 3.5 Idempotency strategy

Pattern: `<event_type>:<entity_id>[:<qualifier>]`

Examples:
- `inspection_report.locked:<report_id>`
- `signature.captured:<signature_id>`
- `compliance_item.value_human_verified:<item_id>:<field>:<verified_value_hash>`
- `proof_pack.exported:<pack_id>:<content_hash_prefix>`

Atomic events should include the content hash or state fingerprint in the idempotency key to prevent a retry from silently returning an event that covers a different document state.

### 3.6 Actor/role capture

- Human events: `actor_user_id = auth.uid()` server-captured; `actor_role = account_member_effective_role()` server-captured. Never trusted from client.
- System events: `actor_user_id = null`, `actor_role = 'system'`, `source_type` identifies the job/service.

### 3.7 Correction / supersession

Use existing `supersedes_event_id` pointer. Example: if a report is mutated after signing (signed-not-locked gap), a `signature.invalidated` event is recorded with `supersedes_event_id` = the original `signature.captured` event ID.

### 3.8 Legal-hold strategy

`compliance_item.legal_hold_applied` event records the hold as a provenance event. The hold state is **projected from the event stream** — not stored as a mutable field. The event's metadata carries the hold scope, authority, and reason. A separate `legal_hold_released` event terminates the hold. The ledger's append-only property means the hold application is itself immutable.

### 3.9 Export / source-set strategy

`proof_pack.exported` metadata contains:
- `content_hash` = SHA-256 of the sorted ordered list of `{entity_type, entity_id, version_or_hash}` tuples included in the pack.
- `artifact_list` = the full sorted list (embedded or referenced by pack export ID).

This replaces the fire-and-forget `recordDepositDisputePackExport()` and the absent `EvidenceVaultPrintPage` export record simultaneously.

### 3.10 Why this avoids eight bespoke hash mechanisms

Instead of eight separate hash columns (one per consumer table), all content hashes live in `metadata.report_content_hash` / `metadata.content_hash` / `metadata.source_hash` in the provenance event's metadata. The hash is computed once, committed to the immutable chain, and retrievable via `get_document_service_timeline()` or the analogous evidence timeline RPC. The canonical payload v0.3 includes `metadata` in the hash computation — so the content hash is cryptographically committed to the chain entry.

### 3.11 What to implement first

1. Wire `record_document_uploaded()` from `documentService.js` `uploadDocument()` (additive, no hot-path risk).
2. Wire `record_document_served_asserted()` from compliance safe service when `served_at` is set.
3. Add `record_inspection_report_locked()` stub implementation and wire from the lock path (first anchor-atomic event).
4. Add `record_compliance_value_human_verified()` — closes OCR auto-trust gap.
5. Add `record_proof_pack_exported()` — replaces fire-and-forget export recording.

---

## 4. Exercised anchor proof

### Result: NOT RUN

No live database access available in this audit/design pass.

> **Feasibility unproven — design is code-read only.**

However, the design spike artifact is committed at `tests/integration/e144EvidenceProvenanceFeasibility.test.js`. It contains three reproducible proofs:

1. **ANCHOR PROOF 1** — calls `record_provenance_event` with `entity_type='inspection_report'`, `event_type='inspection_evidence.attached'`, then asserts `verify_provenance_chain.is_valid = true`.
2. **ANCHOR PROOF 2** — same event submitted twice with same idempotency key; asserts exactly one chain event.
3. **ANCHOR PROOF 3** — `signature.captured` event with `report_content_hash` in metadata; asserts content hash is preserved and chain is valid.

These tests use `isIntegrationHarnessConfigured()` gate — they are skipped in CI without a live DB but run in local integration mode. They constitute the reproducible feasibility proof, pending execution.

### Code-read feasibility assessment (not substitute for executed proof)

The substrate is highly likely to accept evidence events without modification because:
- `record_provenance_event()` has no event_type allowlist.
- `provenance_events.entity_type` has no constraint beyond `NOT NULL` + non-empty check.
- The BEFORE INSERT trigger is entity-type agnostic.
- The chain verifier loops over all events in sequence order; it does not inspect entity_type.
- Sprint 3 document events (`document.uploaded`, etc.) prove the pattern is extended without modification to the substrate — they used the same counter, same hash, same verifier.

**Known risk areas that could cause FAIL:**
1. The `provenance_event_counters` row must exist before the first insert for an account. `record_provenance_event()` handles this with upsert — but `_append_evidence_provenance_event()` (the new internal helper in the stub) also handles it. Low risk.
2. The `head_hash is null at sequence > 1` guard fires if events exist before the backfill migration ran. Not applicable for new test accounts.
3. Non-human events must satisfy the `provenance_events_nonhuman_source_check` constraint. The design spike uses `actor_type='human'` — no risk.
4. Advisory lock contention under concurrent evidence writers. The same pattern used in finance and documents — no evidence-specific risk.

Confidence: Medium-High pending execution.

---

## 5. Optional skeleton added

### Files added

1. **`tests/integration/e144EvidenceProvenanceFeasibility.test.js`** — Exercised anchor proof (3 test cases). Inert when integration harness is not configured. Does not wire production flows.

2. **`supabase/evidence_provenance_stub.sql`** — Contains:
   - `_append_evidence_provenance_event()` generic internal helper (no GRANT — not callable from RLS paths)
   - `provenance_content_hash(jsonb)` content hash helper (no GRANT)
   - Four stub RPCs (record_inspection_report_locked, record_signature_captured, record_compliance_value_human_verified, record_proof_pack_exported) — each raises an exception by design; no GRANT issued
   - Full event type taxonomy in comments

3. **`scripts/dbApplyRepoSql.js`** — stub file registered in OVERLAY_SEQUENCE (after provenance_document_service.sql dependencies, before linter hardening).

### Why skeleton is safe/inert

- All stub RPCs raise an exception when called — there is no code path that reaches them.
- No GRANTs are issued to any stub RPC.
- `_append_evidence_provenance_event` and `provenance_content_hash` have no GRANTs — not callable from RLS-guarded paths.
- No existing production flow is modified.
- No existing RLS policy is changed.
- No consumer table is modified (no new columns).

### Why no optional skeleton beyond the mandatory proof

The mandatory proof is the integration test. The SQL stub is committed to make the proposed surface concrete and testable — it demonstrates that the generic helper can be written without modifying the substrate, and that the stub RPCs have a clear internal calling convention. This is the minimal surface needed to prove the design fits the repo without implementing any consumer fix.

---

## 6. Tests added or proposed

### Added

| File | Type | Purpose |
|---|---|---|
| `tests/integration/e144EvidenceProvenanceFeasibility.test.js` | Integration (skipped without harness) | Exercised anchor proof — 3 proofs covering basic anchor, idempotency, and content hash preservation. |

### Proposed for real implementation

| Test | Type | What it asserts |
|---|---|---|
| `inspection_report.locked` emits provenance event with content hash | Integration | Locking a report writes a chain event; hash in metadata matches computed hash of report state at lock time. |
| `signature.captured` content hash matches report state at signing | Integration | Signature event hash is computed from report state BEFORE any subsequent mutation; chain verifier accepts. |
| Signed-not-locked mutation is detectable from chain | Integration | After signing, if report is mutated, the report's current state hash differs from the signature event's stored hash. |
| `compliance_item.value_human_verified` anchors OCR value | Integration | Verification act produces a chain event; OCR extraction ID is in metadata; chain verifier accepts. |
| `proof_pack.exported` includes content hash of artifact list | Integration | Export event metadata.content_hash matches SHA-256 of sorted artifact IDs; chain verifier accepts. |
| Evidence events do not break finance chain | Integration | A chain with mixed finance + evidence events passes verify_provenance_chain. |

### Fold tripwire test (Branch B)

If Branch B is chosen (interim `human_verified_at` column), this test must be added and left **failing** until E-144 absorbs the interim:

```js
it.fails("E-144 fold tripwire — human_verified_at must be anchored through provenance ledger", () => {
  // Assert that compliance_item.value_human_verified is emitted when human_verified_at is set.
  // This test stays red until E-144 wires the column change to the ledger.
  const sql = readSource("supabase/compliance_safe_phase2.sql");
  const stubSql = readSource("supabase/evidence_provenance_stub.sql");
  expect(sql).toContain("record_compliance_value_human_verified");
  expect(stubSql).not.toContain("raise exception 'record_compliance_value_human_verified: not yet implemented'");
});
```

This test must remain red until `record_compliance_value_human_verified` is wired. Its continued failure is the fold-in tripwire.

---

## 7. Branch estimates

### Branch A — Clean substrate-first

**Effort:** Medium — 3 implementation prompts, ~8-12 sprint days total.

#### Phase A-1: Wire anchor-additive document events (2 days)

Files touched:
- `src/services/documentService.js` — call `recordDocumentUploaded()` after `finalize_document_upload`
- `src/pages/compliance/ComplianceSafePage.jsx` — call `recordDocumentServedAsserted()` when served_at is set
- `src/services/legalSecurityService.js` — wire `record_document_served_asserted` to compliance item service recording

No schema changes. No hot-path risk. These are additive calls after existing writes complete.

Risk: Low. Functions exist and are tested in Sprint 3.

#### Phase A-2: Anchor-atomic events (5 days)

Files/schema touched:
- `supabase/evidence_provenance_stub.sql` — implement `record_inspection_report_locked` fully
- `supabase/legal_security_phase3.sql` — add `provenance_event_id` reference column to `inspection_reports` (optional — for cross-reference)
- SQL RPC for locking inspection_reports — call `_append_evidence_provenance_event` inside the same transaction
- SQL RPC for signature insert — call `_append_evidence_provenance_event` with `report_content_hash = provenance_content_hash(canonical_report_json)` inside the same transaction
- `supabase/evidence_provenance_stub.sql` — implement `record_compliance_value_human_verified`
- `src/pages/compliance/ComplianceSafePage.jsx` — add verification confirmation modal that calls the RPC

Risk: Medium. Anchor-atomic events touch the hot path (signature insert, report lock). These must be within the same DB transaction as the primary mutation — if the provenance event fails, the primary mutation must also roll back.

#### Phase A-3: Pack exports + evidence timelines (3 days)

Files touched:
- `supabase/evidence_provenance_stub.sql` — implement `record_proof_pack_exported`
- `src/pages/documents/DepositDisputePackPrintPage.jsx` — replace `recordDepositDisputePackExport()` with ledger-anchored call
- `src/pages/documents/EvidenceVaultPrintPage.jsx` — add export recording (currently absent)
- Evidence timeline RPC (analogous to `get_document_service_timeline()` for inspection reports)

Risk: Low-medium. Pack exports are additive — not in the critical write path.

#### Anchor-additive events (all)
- `inspection_report.created` / `archived` / `shared_with_tenant`
- `inspection_evidence.attached` / `scan_clean`
- `deposit_dispute_pack.created` / `locked`
- `compliance_item.evidence_linked` / `acknowledged` / `expired`
- `ocr.extraction_completed` / `stale`
- `proof_pack.assembled`

All additive — no hot-path risk. Can be wired one by one.

#### Anchor-atomic events (all — require same-transaction anchoring)
- `inspection_report.locked` — **highest evidential value in the system**
- `signature.captured` — **highest integrity risk if done incorrectly**
- `compliance_item.value_human_verified` — closes OCR auto-trust gap
- `ocr.value_human_verified` — same

**Whether exercised anchor proof supports Branch A:**  
NOT RUN. Code-read analysis gives Medium-High confidence. The integration test in `e144EvidenceProvenanceFeasibility.test.js` must be run against the local harness before starting Phase A-2 (anchor-atomic wiring). If any of the three proofs fail, report the blocker and re-evaluate.

**What consumer rows become easier after Branch A:**
- E-032: delete-block + chain-anchored lock = locked reports are immutable AND detectable if deleted (deletion would break the chain)
- E-033: `signature.captured` with content hash = signature is bound to a specific document version
- E-035: already solved at SQL layer — just needs wiring
- E-036: `proof_pack.exported` with content hash = disclosure audit trail
- E-018: `compliance_item.value_human_verified` = OCR auto-trust chain gap closed
- E-084: `ocr.value_human_verified` anchored

**Tests:** All integration tests in `e144EvidenceProvenanceFeasibility.test.js` + the 6 proposed tests from Section 6.

---

### Branch B — Interim E-084 gate first

**Effort:** Small — 1 implementation prompt, ~2-3 sprint days.

**Minimal OCR verification fields:**
- Add `ocr_source_extraction_id uuid` to `tenancy_compliance_items` (FK to `document_extractions`)
- Add `human_verified_at timestamptz` to `tenancy_compliance_items`
- Add `human_verified_by uuid` to `tenancy_compliance_items` (not FK — same pattern as provenance actor_user_id)

Files touched:
- `supabase/compliance_safe_phase2.sql` — add columns (idempotent ALTER TABLE)
- `src/lib/complianceSafeStatus.js` — `deriveComplianceItemStatus()` checks `human_verified_at` before trusting `expires_at`
- `src/pages/compliance/ComplianceSafePage.jsx` — add verification confirmation step
- `src/services/legalSecurityService.js` — include new fields in COMPLIANCE_SELECT

**How it avoids conflicting with future E-144:**
The `human_verified_at` column is a simple timestamp field. When E-144 is implemented, `record_compliance_value_human_verified()` can be called from the same verification confirmation step, setting both the column and writing the provenance event. The column becomes the mutable surface representation; the ledger event is the immutable anchor. They are complementary, not conflicting.

**How it folds into E-144:**
Phase A-2 of Branch A implements `record_compliance_value_human_verified`. The fold is: the same UI confirmation that sets `human_verified_at` also calls the provenance RPC. Both happen in the same user action; no migration of data needed.

**Technical debt created:**
- `human_verified_at` is a mutable timestamp — can be overwritten without breaking anything (no immutability enforcement)
- `ocr_source_extraction_id` is bespoke to the compliance table — if OCR verification is extended to other tables, the pattern fragments
- Neither field is provenance-anchored until E-144 wires them

**Whether it risks becoming permanent bespoke infrastructure:**
Yes, if the fold tripwire (Section 6) is not left in place. A mutable `human_verified_at` that satisfies the immediate E-084 complaint will naturally be treated as "good enough" by the next sprint.

#### Branch B fold tripwire

The fold is mandatory if and only if this test is committed simultaneously with the interim columns, stays failing, and is visibly linked to the E-144 backlog item:

```js
it.fails("E-144 fold tripwire — human_verified_at must be anchored through provenance ledger", () => {
  // This test stays red until E-144 Phase A-2 wires record_compliance_value_human_verified.
  // Until then, human_verified_at is bespoke interim infrastructure.
  const stubSql = readSource("supabase/evidence_provenance_stub.sql");
  expect(stubSql).not.toContain(
    "raise exception 'record_compliance_value_human_verified: not yet implemented'",
  );
});
```

Without this test, the interim will become permanent. With it, the test is the visible forcing function — it cannot be ignored or silently closed.

**Tripwire trigger condition:** Branch B is complete when `record_compliance_value_human_verified` is implemented and wired. E-144 cannot be closed while the tripwire test is still failing.

---

## 8. Recommendation

**Recommend: Split — small E-144 foundation first, then E-084, then systematic consumer wiring.**

### Rationale

1. **Run the exercised anchor proof first.** Before any consumer wiring, run `tests/integration/e144EvidenceProvenanceFeasibility.test.js` against the local harness. This costs 30 minutes. If it passes, Branch A is confirmed feasible and the decision is straightforward. If it fails, the hard no-go finding must be resolved before any further work.

2. **Phase A-1 is essentially free.** Wiring `record_document_uploaded()` and `record_document_served_asserted()` requires calling existing Sprint 3 RPCs from the existing JS service. No schema changes. This should be the first implementation step regardless of which branch is chosen for E-084.

3. **Branch B with fold tripwire is correct for E-084.** The `human_verified_at` interim is 2 days and closes the most operationally dangerous gap (OCR misread → property shows compliant). The fold tripwire test makes the interim explicitly temporary. This is safer than waiting for full E-144 consumer wiring.

4. **Anchor-atomic events (Phase A-2) require careful design.** `signature.captured` in particular must be atomic with the signature insert — getting this wrong (anchoring after the fact) is worse than not anchoring at all, because it creates a false appearance of binding while attesting the wrong state. Phase A-2 should be its own focused implementation prompt after Phase A-1 and Branch B are verified.

### Suggested implementation order

1. **Run exercised anchor proof** (30 min, no code changes)
2. **Phase A-1** — wire anchor-additive document events (2 days)
3. **Branch B** — interim E-084 gate + fold tripwire test (2-3 days)
4. **Phase A-2** — anchor-atomic events: `inspection_report.locked`, `signature.captured`, `compliance_item.value_human_verified` (5 days)
5. **Phase A-3** — pack exports + evidence timelines (3 days)
6. **Additive backlog** — remaining additive events per consumer row (2-3 days)

---

## 9. Hard no-go findings

No blocking no-go findings identified from code-read. The following risks must be validated by the exercised anchor proof:

| Risk | Likelihood | Impact if present |
|---|---|---|
| `provenance_event_counters` upsert fails for new account | Low — same pattern works in finance and document Sprint 3 | FAIL Proof 1; fix: initialize counter row before first event |
| Head_hash null guard fires for new accounts | Low — `record_provenance_event` handles genesis case | FAIL Proof 1; fix: ensure counter upsert initializes head_hash correctly |
| Non-human source check constraint fires | Low — all proofs use actor_type='human' | Does not apply to proposed proofs |
| Advisory lock contention between proof accounts | Very Low — proofs use distinct accounts | Not a risk |
| Finance-specific event_type assumption in trigger | Not Found — trigger is entity-type agnostic | N/A |
| Payment-specific idempotency shape | Not Found — idempotency key is a free-form text | N/A |
| Chain verifier rejects non-finance events | Not Found — verifier loops over all events without entity_type check | N/A |
| `_append_document_provenance_event` hardcodes 'document' entity_type | **Confirmed** — new helper `_append_evidence_provenance_event` added to stub | Not a blocker; mitigation is in the stub |

**One confirmed structural gap (not a blocker, but must be resolved in Phase A-2):**

The anchor-atomic events (`signature.captured`, `inspection_report.locked`) require the provenance event to be inserted **inside the same transaction** as the primary mutation. The current Sprint 3 document functions use separate HTTP calls for upload vs. `record_document_uploaded()` — this is safe because document upload is additive. For anchor-atomic evidence events, the provenance insert must be in the same DB transaction, which means the consumer RPC (e.g., the inspection report lock RPC) must call `_append_evidence_provenance_event` internally, not expose a separate round-trip.

This is achievable via the SECURITY DEFINER helper pattern (same as document Sprint 3's `_append_document_provenance_event`). It requires that the lock/signature RPCs are DB-level functions, not application-layer calls.

---

## 10. Workbook update suggestion — E-144

| Field | Value |
|---|---|
| Observed Repo State | Provenance substrate fully generic (entity_type/event_type open strings, no allowlist); Sprint 3 document layer implements 12 event types proving extensibility; provenanceDocumentService.js + DocumentServiceTimelinePage exist; _append_document_provenance_event hardcodes 'document' entity_type — new generic helper needed for non-document entities; no inspection_report/signature/ocr/pack events exist yet |
| Observed Verdict | Half-built — substrate is production-ready and generic; Sprint 3 document events prove the pattern; consumer wiring for evidence entities not started |
| Confidence | Low (NOT RUN — design spike test written but not executed against live DB) |
| Layer | Architecture / Cross-cutting substrate gap |
| Linkage Axis | Built (provenance events link to any entity by UUID; entity_id deliberately not foreign-keyed for privacy and deletion safety) |
| Evidential Strength Axis | Missing (no evidence events anchored; Sprint 3 document events partially address E-035 at SQL layer but not wired from application) |
| Stopping Point | Exercised anchor proof NOT RUN; anchor-atomic event design (inspection_report.locked, signature.captured) requires same-transaction insert inside consumer RPC — not a free call from JS layer; Branch B fold tripwire not yet committed |
| Next Untaken Step | (1) Run e144EvidenceProvenanceFeasibility.test.js against local harness; (2) Wire record_document_uploaded + record_document_served_asserted from application; (3) Ship interim E-084 human_verified_at with fold tripwire test |
| Evidence Paths | supabase/provenance_events.sql, supabase/provenance_document_service.sql, src/services/provenanceDocumentService.js, src/pages/provenance/DocumentServiceTimelinePage.jsx, supabase/evidence_provenance_stub.sql (new), tests/integration/e144EvidenceProvenanceFeasibility.test.js (new) |
| Classification | Architecture gap — substrate gap blocking all Phase 3 row consumer fixes |
| Inherent Severity | High — without provenance anchoring, all 8 Phase 3 rows remain half-built regardless of individual fixes |
| Residual Risk | Medium (substrate is ready; risk is anchor-atomic event implementation complexity and discipline in same-transaction design) |
