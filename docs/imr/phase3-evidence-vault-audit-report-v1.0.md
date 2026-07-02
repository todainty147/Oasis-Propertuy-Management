# Tenaqo IMR Audit Report
## Phase 3 — Evidence Vault / Proof Packs / Signatures / OCR

**Version:** 1.0  
**Date:** 30 June 2026  
**Branch audited:** codex/hmrc-e1-hardening  
**Auditor method:** Code-read only (no live DB access). Evidence type: CODE-READ ONLY throughout. Confidence: Low on all rows unless stated.  
**Prior phases:** P0 Trust Sweep closed. Phase 1 Command Centre closed (E-141 regression-guard pending). Phase 2 Maintenance Intelligence: E-066b repaired and verified (this session); E-077 repair SQL (`phase2_repair_e066b_e077_e074.sql`) committed; E-074 repair committed.

---

## Core question

> Can Tenaqo preserve documents, signatures, service events, OCR outputs, evidence links, and proof packs as trustworthy evidence — or does it merely store files and generate impressive-looking artifacts?

**Audit answer:** Partial. Storage and linkage are generally solid. Evidential strength is consistently weak because the evidence substrate lacks: (1) document-version hashes at signing time, (2) a retention floor that survives after locking, (3) service event attribution beyond a timestamp, (4) scope re-verification at pack assembly, and (5) a human-verification gate between machine-extracted text and compliance status.

The pack wording is correctly hedged in both print pages. No active overclaim found in surface-facing copy.

---

## E-032 — Evidence Vault

### Claimed scope
Core photo/condition evidence store for inspection reports, underpinning check-in/check-out comparisons and deposit dispute packs.

### Observed repository state

**Schema (`supabase/legal_security_phase3.sql`):**
- `inspection_reports`: id, account_id, property_id, tenant_id, inspection_type (check_in|check_out|mid_tenancy|maintenance_evidence), status (draft|ready_for_signature|signed|locked|archived), title, inspection_date, locked_at, locked_by, archived_at, archived_by, created_by
- `inspection_rooms` → `inspection_evidence_items` → `inspection_photos`
- `inspection_signatures` (base: signer_type, signer_name, signed_at, signature_data, metadata)
- `inspection_audit_events`: event log (report_created + tenant events)

**Phase 2 overlay (`supabase/evidence_vault_phase2.sql`):**
- `inspection_report_shares`: sharing lifecycle (shared|viewed|tenant_signed|tenant_disputed|revoked|expired)
- `inspection_report_tenant_comments`: tenant dispute comments

**Immutability triggers:**
- `trg_prevent_locked_inspection_item_edits`: blocks INSERT/UPDATE/DELETE on `inspection_evidence_items` when report status = 'locked' or 'archived'
- `trg_prevent_locked_inspection_photo_edits`: same for `inspection_photos`
- `trg_prevent_locked_inspection_signature_edits`: same for `inspection_signatures`

**Document storage (`supabase/document_antivirus_scanning.sql`):**
- Quarantine-first upload: `create_document_stub` → `storage.upload` to quarantine path → `finalize_document_upload`
- Scan states: legacy_unscanned | pending_scan | clean | flagged | scan_failed
- `bypass_document_scan` raises exception (bypass disabled)
- `delete_document_and_audit` RPC: DB-first delete with audit log + security_audit_log trigger
- Rate-limit monitoring: `account_security_settings.document_delete_actor_threshold / document_delete_account_threshold`

**Evidence vault helpers (`src/lib/evidenceVault.js`):**
- Status lifecycle helpers, room/item stats, completion percentage, editable guard

**Tests (`tests/unit/evidenceVault.test.js`):**
- Tests: stats, completion, condition normalization, room sorting, editability guard
- NOT tested: deletion restrictions, immutability enforcement, cross-account scope, signature replay, locked-report deletion

### Verb tested

V1 (upload/store): CODE-READ ONLY — flow traced through `uploadDocument()` 3-step (stub→storage→finalize).  
V2 (delete/retain): CODE-READ ONLY — `delete_document_and_audit` traced; `bypass_document_scan` disabled. Inspection report header deletion not blocked.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding

### Linkage axis
**Built** — documents upload, scope correctly (account/property/tenant/shared), retrieve via signed URLs, link to inspection evidence.

### Evidential-strength axis
**Weak**

Reasons:
1. **Locked inspection report header is deletable.** The immutability triggers protect child rows (items, photos, signatures) from modification when report status = 'locked'. But `inspection_reports` itself has no delete-blocking trigger. The RLS policy `"Managers manage inspection reports"` grants `for all` (including DELETE) to `user_can_manage_account()`. An owner can delete a locked report; the CASCADE constraint then deletes all rooms, items, photos, and signatures. A locked inspection report used as check-in evidence can be silently destroyed.
2. **Signed status does not protect from mutation.** The triggers block only 'locked' and 'archived'. A report with status = 'signed' (pending locking) can still have items and photos added, edited, or deleted. The signature record cannot be altered, but the document it references can be.
3. **No legal-hold or dispute-hold.** There is no mechanism to freeze a report or document when a deposit dispute begins. The `inspection_report_shares` dispute state (`tenant_disputed`) is a status field — it does not prevent deletion.
4. **No document version hash.** `inspection_photos.document_id` links to a document, but no hash is stored at evidence-creation time. If the linked document is replaced in storage, the reference remains but the content changes.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- Three-step quarantine-first upload with scan gating
- `document_audit_log` records upload, access, download, scan results
- Security audit log trigger fires on document deletion with rate-limit monitoring
- `bypass_document_scan` is permanently disabled
- Items/photos/signatures blocked from mutation after report locking
- `locked_at`, `locked_by` timestamps recorded
- Signed URL gate through `audit_document_access` RPC
- `inspection_audit_events` records report_created and tenant events

### What is stubbed / incomplete / misleading
- No delete block on `inspection_reports` row when status = 'locked' or 'archived'
- No dispute-hold / legal-hold mechanism
- No document hash at photo-attachment time
- Signed status does not freeze items/photos (only locked/archived do)
- `evidence_vault.test.js` does not cover deletion restrictions or scope isolation

### Deletion / retention / legal-hold result
- Draft documents: may be deleted (standard RLS)
- Locked report child rows (items/photos/signatures): protected from mutation/deletion by trigger
- Locked inspection report header: **deletable by manager** (no blocking trigger on `inspection_reports` table)
- Dispute state (`tenant_disputed`): status field only — no hold mechanism
- Documents linked to reports: `delete_document_and_audit` is audited but not blocked for served/evidence documents
- **Retention floor: absent** for inspection reports. Present only for child rows after locking.

### Served vs validly-served result
N/A (this row is storage; E-035 covers served events).

### OCR extracted vs verified fact result
N/A for this row.

### Signature replay result
See E-033.

### Pack assembly scope result
See E-025/E-036.

### Next untaken step
Add a delete-blocking trigger on `inspection_reports` when status IN ('locked', 'archived').

### Risk
**High** — A locked inspection report used as deposit dispute evidence can be permanently deleted by the same party who benefits from its absence.

### Classification
**Trust blocker**

### Workbook update
- Observed Repo State: inspection_reports + rooms + items + photos + signatures + audit events; quarantine-first scan; immutability triggers on child rows only; no delete block on report header
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding
- Linkage Axis: Built
- Evidential Strength Axis: Weak
- Stopping Point: delete block on inspection_reports header absent; signed-status mutation window open; no document hash; no legal-hold
- Next Untaken Step: Add delete-blocking trigger on inspection_reports for locked/archived status
- Evidence Paths: supabase/legal_security_phase3.sql, supabase/evidence_vault_phase2.sql, src/services/documentService.js, supabase/document_antivirus_scanning.sql
- Classification: Trust blocker
- Inherent Severity: High
- Residual Risk: High

---

## E-033 — Tenant / landlord signatures split

### Claimed scope
Role-specific signatures on inspection reports with replay resistance and identity attribution.

### Observed repository state

**Base schema (`supabase/legal_security_phase3.sql`):**
- `inspection_signatures`: id, account_id, inspection_report_id, signer_type (text), signer_name (text), signed_at (timestamptz), signature_data (text), metadata (jsonb)

**Phase 2 additions (`supabase/evidence_vault_phase2.sql`):**
- Added: `signer_role text NOT NULL DEFAULT 'landlord'` — check ('landlord'|'tenant')
- Added: `signed_from text NOT NULL DEFAULT 'landlord_portal'` — check ('landlord_portal'|'tenant_portal')
- Added: `tenant_id uuid` — references tenants(id)
- Added: `share_id uuid` — references inspection_report_shares(id)
- Added: `signature_status text NOT NULL DEFAULT 'signed'` — check ('signed')

**RLS policies:**
- Tenant insert: requires `signer_type='tenant'` AND `signer_role='tenant'` AND `signed_from='tenant_portal'` AND `share_id is not null` AND active share exists for caller's tenant_id
- `trg_inspection_report_shares_tenant_update_guard`: prevents `tenant_signed` status unless a tenant signature row exists for that share
- `trg_prevent_locked_inspection_signature_edits`: blocks all operations on `inspection_signatures` when report is locked/archived

**Tests (`tests/unit/evidenceVault.test.js`):**
- No signature-specific tests

### Verb tested

V4 (sign/acknowledge): CODE-READ ONLY — policies and triggers traced.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding

### Linkage axis
**Built** — signature correctly attributed by role and portal of origin; share-linked tenant signatures enforced by RLS.

### Evidential-strength axis
**Weak**

Reasons:
1. **No document hash at signing time.** The signature record contains `inspection_report_id` and `signed_at` but no hash of the inspection report content. The signature proves "person X pressed sign at time T" but not "person X signed this specific version of the document."
2. **Signed-but-not-locked mutation window.** The immutability trigger blocks mutations only for 'locked' and 'archived' status. A report with status = 'signed' can still have items, photos, or notes modified before the manager locks it. The signature then covers a different document than what was signed.
3. **No uniqueness constraint on tenant signature per share.** The tenant insert policy gates on share existence and active state, but nothing prevents a tenant from inserting multiple signature rows for the same report/share. The `tenant_signed` status transition requires at least one signature, not exactly one.
4. **`signature_data` is unverified text.** The field holds whatever the client sends (e.g., a drawn signature image data URL). No cryptographic binding to the signer's identity.
5. **No IP/device metadata enforcement.** The `metadata` jsonb field can hold IP/device data, but no schema enforces its presence.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- `signer_role` and `signed_from` enforced by DB constraints
- Tenant insert requires active share linked to caller's tenant record — cross-tenant replay blocked
- Tenant cannot sign a revoked or expired share
- `tenant_signed` status transition requires signature existence (trigger guard)
- Locked/archived reports cannot receive new signatures

### What is stubbed / incomplete / misleading
- No document version hash in signature record
- Signed status does not protect report content from mutation (only locked/archived do)
- Multiple tenant signatures on one share not prevented
- `signature_data` is unvalidated text — no cryptographic identity binding
- No IP/device metadata required

### Deletion / retention / legal-hold result
- Signatures on locked reports: protected from deletion by trigger
- Signatures on signed-but-not-locked reports: not protected — manager could delete before locking
- No freeze on signatures when dispute begins

### Served vs validly-served result
N/A.

### OCR extracted vs verified fact result
N/A.

### Signature replay result
- **Tenant cross-report replay: blocked.** Tenant signature insert requires a valid, active share linked to the tenant's own account record. A signature from one share cannot be reused on another.
- **Signature mutation after signing: possible.** The signed document can be modified before locking. The signature remains but no longer corresponds to the current document state.
- **Multiple signatures per share: not blocked.**

### Pack assembly scope result
N/A.

### Next untaken step
Add `signature_content_hash` column to `inspection_signatures` populated at insert with a hash of the current report state; add a unique constraint on (inspection_report_id, tenant_id, share_id) to prevent duplicate signatures.

### Risk
**High** — The signature record proves identity and timing but not document version. The window between signing and locking is exploitable.

### Classification
**Trust blocker**

### Workbook update
- **CLOSED 2026-07-02 (E-033 + E-152) — full behavioural proof executed**
- Observed Repo State (updated): Single-writer model via `capture_inspection_signature` RPC (SECURITY DEFINER); canonical content hash (SHA-256, status/locked_at/locked_by/signature_data excluded — E-152); per-share uniqueness partial unique index; signer_type CHECK ('landlord','agent','tenant'); RLS INSERT policies removed; manager forgery prevention enforced server-side; tenant path server-derives signer_type/signer_role/signed_from/tenant_id; Pin 3 signed-status mutation freeze extended; production-RPC atomicity proven by GUC fault injector in `record_signature_captured`
- Observed Verdict: **Closed**
- Confidence: **High** — `npm run db:bootstrap` succeeded; integration tests 8/8 pass on live local Supabase; A-2.2 lock tests 8/8 pass; security contracts 5/5 pass; git-stash baseline confirms 4 failures are pre-existing (not introduced here). **E-154 CLOSED 2026-07-02:** deploy-path caveat lifted — all 8 integration tests re-verified on the full-overlay-produced DB (double-apply Pass 2 clean).
- Signer_type values on script-built DB: 'landlord', 'tenant' (2 rows). 'agent' requires populated production data; constraint covers all 3.
- E-152 canonical hash fix proven: status change alone (no signature added) leaves hash unchanged (Test 8). Signature addition correctly changes hash — signatures are included in canonical content.
- E-153 lock half: NOT closed here. Lock production deny-test remains open.
- E-032/E-148: Not touched.
- Evidence Paths: supabase/inspection_report_lock_signature_binding.sql, src/services/legalSecurityService.js, tests/integration/inspectionSignatureSingleWriterContracts.test.js, tests/security/inspectionSignatureSingleWriterSecurityContracts.test.js, tests/integration/inspectionLockSignatureContracts.test.js
- Classification: Closed / Trust blocker → resolved
- Residual Risk: Low

---

## E-034 — Deposit dispute pack

### Dependency gate
**E-077 repair file committed.** `supabase/phase2_repair_e066b_e077_e074.sql` exists in repo and applies:
1. `attester_role` column on `work_order_attachments` (contractor|landlord|tenant|admin|system)
2. Evidence lock at work-order completion: uploader can delete while open; only owner/admin/staff can delete after completion/cancelled
3. E-066b and E-074 repairs also in this file

E-077 repair has landed. Auditing E-034 against post-repair state.

### Claimed scope
Deposit dispute pack assembling maintenance evidence, check-in/check-out comparisons, contractor/landlord/tenant evidence with honest attestation labelling.

### Observed repository state

**Schema (`supabase/evidence_vault_phase2.sql`):**
- `deposit_dispute_packs`: id, account_id, property_id, tenant_id, tenancy_id, title, status (draft|ready|exported|locked|archived), deposit_amount, proposed_deduction_amount, summary, created_by, locked_at, archived_at
- `deposit_dispute_pack_items`: id, dispute_pack_id, item_type, title, description, claimed_amount, evidence_reference_type, evidence_reference_id, sort_order
- `deposit_dispute_pack_exports`: id, dispute_pack_id, export_type, status, document_id, storage_path, generated_by, generated_at, metadata
- `deposit_dispute_pack_audit_events`: event log
- Triggers: account mismatch prevention on items/exports/audit; `trg_deposit_dispute_packs_updated_at`

**Print page (`src/pages/documents/DepositDisputePackPrintPage.jsx`):**
- Loads pack + referenced inspection reports
- Renders: summary, timeline, deduction schedule, evidence index, check-in/check-out comparison table, signatures, tenant responses, photos
- `recordDepositDisputePackExport()` called on print — inserts into `deposit_dispute_pack_exports`
- Footer: "This pack is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice."

**Pack helpers (`src/lib/depositDisputePack.js`):**
- `buildEvidenceIndex()`: shows type label + "Tenaqo reference" vs "Manual entry"
- `buildConditionComparisonRows()`: room-by-room check-in/check-out comparison
- `buildDisputeTimeline()`: chronological event list
- `buildDisputePackItemsFromSettlement()`: imports deposit settlement items

**E-077 repair gap (post-repair):**
- `attester_role` column exists on `work_order_attachments`
- BUT `buildEvidenceIndex()` and the print page do NOT surface `attester_role` — contractor self-attested evidence is not labelled differently from independent evidence in the pack output

**Tests (`tests/unit/depositDisputePack.test.js`):**
- Tests: deduction total, evidence index, timeline, comparison, type normalization, date sorting
- NOT tested: scope isolation at assembly, attester role labelling, export record creation, deletion restrictions

### Verb tested

V7 (deposit dispute pack): CODE-READ ONLY — print page and helpers traced.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding + Consumer finding

### Linkage axis
**Built** — pack schema, items, exports, audit trail all present. Print page renders complete pack.

### Evidential-strength axis
**Weak**

Reasons:
1. **Attester role not surfaced.** `work_order_attachments.attester_role` (contractor|landlord|tenant|admin|system) exists but is not shown in `buildEvidenceIndex()` or the print page. A contractor's own completion photo and a third-party inspector's photo look identical in the pack.
2. **No version-aware display.** Pack items reference inspection reports by ID. If the inspection report is updated after pack assembly, the pack references the new version without any indication that a change occurred.
3. **No content hash at export time.** `deposit_dispute_pack_exports` records `generated_by` and `generated_at` but no hash of the assembled pack content. The pack cannot be reproduced or verified post-export.
4. **Deductions not locked after pack export.** Pack status can move to 'exported', but items can still be modified while status is 'exported'. Only 'locked' status (not automatically set on export) would protect content.
5. **Observation vs fault wording gap.** The pack renders condition comparison rows (check-in: "good", check-out: "damaged") without a disclaimer that this comparison does not constitute a finding of tenant causation.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- Pack schema with account-scoped RLS; child rows cannot be reassigned across accounts
- Export event recorded (generated_by, generated_at)
- Timeline, deduction schedule, evidence index, comparison table all rendered
- `buildConditionComparisonRows()` produces correct room-by-room view
- Footer correctly disclaims legal standing
- Audit events table for pack lifecycle
- E-077 repair landed: `attester_role` column exists; evidence locked at completion

### What is stubbed / incomplete / misleading
- `attester_role` not rendered in pack output — self-attestation vs independent not labelled
- No content hash at export time
- No version-aware display for referenced inspection reports
- Items mutable after 'exported' status (lock not auto-applied on export)
- Condition comparison shows observation but not fault/causation disclaimer

### Deletion / retention / legal-hold result
- Draft packs: deletable
- Exported/locked packs: no delete block at DB level — manager can delete anytime
- Audit events: account-scoped insert only; no deletion policy
- Work order attachments: locked at completion per E-077 repair (uploader can't delete after completion)

### Served vs validly-served result
N/A (this is a dispute pack, not a service record).

### OCR extracted vs verified fact result
N/A.

### Signature replay result
See E-033 (signatures are on inspection reports, surfaced into pack via the print page).

### Pack assembly scope result
- `getReferencedReportIds()` in print page: loads each referenced report by ID
- No explicit re-check that referenced reports belong to the same account/property/tenancy as the pack at assembly time
- RLS enforces account scope at the DB level, but no application-layer re-validation

### Next untaken step
Surface `attester_role` in `buildEvidenceIndex()` so self-attested vs independent evidence is labelled in pack output.

### Risk
**Medium** — E-077 repair landed. Main gap is attester role not rendered and no content hash at export. Pack wording is honest.

### Classification
**Launch blocker**

### Workbook update
- Observed Repo State: full schema; print page complete; export record; E-077 repair applied; attester_role exists but not rendered in pack output; no content hash
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding + Consumer finding
- Linkage Axis: Built
- Evidential Strength Axis: Weak
- Stopping Point: attester_role not surfaced; no content hash; no version-aware display; no delete block on exported packs
- Next Untaken Step: Surface attester_role in buildEvidenceIndex() and print page
- Evidence Paths: supabase/evidence_vault_phase2.sql, supabase/phase2_repair_e066b_e077_e074.sql, src/lib/depositDisputePack.js, src/pages/documents/DepositDisputePackPrintPage.jsx
- Classification: Launch blocker
- Inherent Severity: Medium
- Residual Risk: Medium

---

## E-035 — Document served events

### Claimed scope
Service event records attesting when, how, and to whom documents were served.

### Observed repository state

**`tenancy_compliance_items.served_at` (timestamptz) — added in `supabase/compliance_safe_phase2.sql`:**
- A single timestamp field on the compliance item
- No dedicated service event table

**`compliance_evidence_events` table (`supabase/legal_security_phase3.sql`):**
- id, account_id, compliance_item_id, user_id, event_type, metadata (jsonb), created_at
- Event log for compliance item lifecycle; served events would appear here if the application writes them
- No schema enforcement that a service event includes actor, recipient, channel, address, document version

**What is absent:**
- No `document_served_events` table
- No actor_id / actor_role on `served_at`
- No recipient_id / recipient_contact on service record
- No channel (email|post|hand_delivered|...) field
- No document version or hash at service time
- No immutability enforcement on `served_at` — can be overwritten
- No "record-of-service ≠ valid legal service" flag or UI copy

**Print pages:** `EvidenceVaultPrintPage` footer: "It does not guarantee the outcome of any deposit dispute and does not replace legal advice." No explicit service validity language found in the pack copy reviewed.

**`COMPLIANCE_SELECT` in `src/services/legalSecurityService.js`:**
- Selects `served_at` as a field — surfaced to UI, but no additional attribution fields retrieved

### Verb tested

V3 (serve document): CODE-READ ONLY — `served_at` field traced; no dedicated service event table found.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding + Source-module finding

### Linkage axis
**Partial** — `served_at` timestamp captured on compliance items; `compliance_evidence_events` provides lifecycle log.

### Evidential-strength axis
**Missing** — A timestamp without actor, recipient, channel, address, or document version is not a service event record.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- `served_at` timestamp recorded on compliance items
- `compliance_evidence_events` event log exists and records compliance lifecycle
- Compliance item carries `evidence_document_id` link to served document
- `compliance_item_acknowledgements` records tenant acknowledgement with timestamp

### What is stubbed / incomplete / misleading
- No dedicated service event record with: actor, recipient, channel, address, document version/hash
- `served_at` can be overwritten without audit trail
- No "served ≠ validly served" separation in UI or pack wording for compliance items
- Service method (email/post/hand-delivered) not recorded
- Jurisdiction/rule certainty absent — the system does not verify that the service method/channel is valid under the applicable legal requirement

### Deletion / retention / legal-hold result
- `served_at` field: mutable, no write-once enforcement
- `compliance_evidence_events`: insert-only RLS (managers insert, read); no delete policy found
- Compliance items with `served_at` set: deletable by manager

### Served vs validly-served result
**Critical gap.** `served_at` records a timestamp only. The system does not record:
- Who served (actor / role)
- To whom (recipient identity / contact)
- By what channel
- The document version/hash at time of service
- Whether the service method satisfies any applicable legal requirement

The system records a send/service event (the timestamp) but does not and cannot claim legal validity of service. No UI copy reviewed claims "validly served." However, the absence of explicit "served ≠ validly served" language in the compliance safe UI means the distinction is not visible to the user.

### OCR extracted vs verified fact result
N/A.

### Signature replay result
N/A.

### Pack assembly scope result
N/A.

### Next untaken step
Create a `document_service_events` table with: actor_user_id, actor_role, recipient_id, recipient_contact, channel, document_id, document_version_hash, served_at (write-once), tenancy/property context, and immutability enforcement.

### Risk
**High** — Current `served_at` field is insufficient to constitute a service event record that could support a legal claim of valid service.

### Classification
**Trust blocker**

### Workbook update
- Observed Repo State: served_at timestamp on compliance items; compliance_evidence_events log; no dedicated service event table; no actor/recipient/channel fields
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding + Source-module finding
- Linkage Axis: Partial
- Evidential Strength Axis: Missing
- Stopping Point: No dedicated service event record; served_at is mutable timestamp only; served ≠ validly served not explicit
- Next Untaken Step: Create document_service_events table with full attribution fields
- Evidence Paths: supabase/compliance_safe_phase2.sql, supabase/legal_security_phase3.sql, src/services/legalSecurityService.js
- Classification: Trust blocker
- Inherent Severity: High
- Residual Risk: High

---

## E-036 — Proof pack disclosure basis

### Claimed scope
Safe export/disclosure mechanism that records the basis for disclosure and re-checks scope for every included artifact.

### Observed repository state

**`deposit_dispute_pack_exports` table (`supabase/evidence_vault_phase2.sql`):**
- id, account_id, dispute_pack_id, export_type (pdf), status, document_id, storage_path, generated_by (uuid), generated_at, metadata (jsonb)
- RLS: Managers manage (CRUD)

**`recordDepositDisputePackExport()` in `src/services/legalSecurityService.js`:**
- Called from `DepositDisputePackPrintPage.handlePrint()` after browser-print is triggered
- Records export event with generated_by (not verified in code — assumed auth.uid())
- `metadata: { source: 'browser_print' }`

**What is absent:**
- No `disclosure_basis` field — reason for export not captured
- No content hash of assembled pack at export time
- No interstitial confirmation before export (no "are you sure?" / "breach/sensitive data" gate)
- No scope re-check per artifact at assembly time (application-layer; RLS provides DB-level account scope)
- No source set record — which specific document versions were included cannot be reproduced
- `EvidenceVaultPrintPage` (inspection report print): no export record at all — only dispute pack has `recordDepositDisputePackExport()`

### Verb tested

V8 (access/disclosure/export scope): CODE-READ ONLY — print page and export recording traced.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding + Consumer finding

### Linkage axis
**Partial** — Dispute pack export event recorded; inspection report print has no export record.

### Evidential-strength axis
**Missing** — No disclosure basis, no content hash, no source set, no scope re-check.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- `deposit_dispute_pack_exports` records generated_by and generated_at for dispute pack exports
- Export recording is best-effort (print remains available if recording fails — correct UX)
- RLS: Managers only for dispute pack exports

### What is stubbed / incomplete / misleading
- No `disclosure_basis` field on export records
- No content hash of assembled pack
- No source set record (which document versions were included)
- Inspection report print (`EvidenceVaultPrintPage`) has no export record at all
- No interstitial confirmation gate before sensitive export
- No application-layer scope re-check per artifact at assembly time

### Deletion / retention / legal-hold result
- Export records: no deletion policy found; managers can delete
- Pack after export: not locked — items remain mutable

### Served vs validly-served result
N/A.

### OCR extracted vs verified fact result
N/A.

### Signature replay result
N/A.

### Pack assembly scope result
**Partial.** RLS provides account-level scope enforcement at the DB layer. The application does not re-verify that every artifact included in the pack belongs to the same property/tenancy scope as the pack. `getReferencedReportIds()` loads reports by ID — a report from a different property under the same account could be included.

### Next untaken step
Add `disclosure_basis` field to export records; compute and store a content hash of the assembled artifact list at export time; add export recording to `EvidenceVaultPrintPage`.

### Risk
**Medium** — No active scope leakage found. Missing disclosure audit trail.

### Classification
**Launch blocker**

### Workbook update
- Observed Repo State: deposit_dispute_pack_exports with generated_by/generated_at; no disclosure_basis; no content hash; no scope re-check; inspection report print has no export record
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding + Consumer finding
- Linkage Axis: Partial
- Evidential Strength Axis: Missing
- Stopping Point: No disclosure_basis; no content hash; no scope re-check; inspection report print unrecorded
- Next Untaken Step: Add disclosure_basis field + content hash to export records; add EvidenceVaultPrintPage export recording
- Evidence Paths: supabase/evidence_vault_phase2.sql, src/pages/documents/DepositDisputePackPrintPage.jsx, src/pages/documents/EvidenceVaultPrintPage.jsx, src/services/legalSecurityService.js
- Classification: Launch blocker
- Inherent Severity: Medium
- Residual Risk: Medium

---

## E-025 — Proof Packs

### Claimed scope
Cross-module proof-pack artifact assembly with honest claims about what the evidence proves.

### Observed repository state

**Regulatory proof pack (`supabase/regulatory_proof_engine_proof_pack_vs1.sql`):**
- `get_obligation_proof_pack(p_account_id uuid, p_obligation_id uuid)` RPC
- Explicitly sets: `'pack_status_label', 'Demo proof pack — not legal sign-off'`
- Out of scope for this audit (full regulatory proof engine excluded)

**Poland evidence pack (`supabase/poland_compliance_evidence.sql`):**
- `get_evidence_pack(p_account_id uuid, p_property_id uuid, p_tenant_id uuid)` RPC
- Returns completeness summary + item detail JSON
- Not a print-pack; a data query

**Inspection report print pack (`src/pages/documents/EvidenceVaultPrintPage.jsx`):**
- Renders full inspection report with rooms, items, photos, signatures, tenant responses
- Footer: "This report is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice."

**Deposit dispute print pack (`src/pages/documents/DepositDisputePackPrintPage.jsx`):**
- Renders pack with timeline, deductions, evidence index, comparison, signatures, photos
- Footer: "This pack is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice."

**Evidence index (`src/lib/depositDisputePack.js` `buildEvidenceIndex()`):**
- Shows: number, type label, title, source ("Tenaqo reference" | "Manual entry")
- Does NOT show: attester role, document version, hash, timestamp of referenced artifact

### Verb tested

V6 (create evidence/proof pack): CODE-READ ONLY — both print pages and evidence index function traced.

**Evidence type: CODE-READ ONLY**

### Layer classification
Consumer finding

### Linkage axis
**Built** — both print pages render complete packs; evidence index and comparison table populated from live data.

### Evidential-strength axis
**Weak**

Reasons:
1. No content hash of assembled pack at export time
2. No source set record — which document versions were included is not persisted
3. Evidence index shows source type but not attester role, document version, or hash
4. Regulatory proof pack explicitly labeled "Demo — not legal sign-off"
5. No reproducibility mechanism — the same pack viewed later may differ if source data changed

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- Pack wording is correctly hedged — no overclaim of legal standing, fault, or compliance
- Both print pages include signatures and tenant response records
- Comparison table shows check-in vs check-out condition changes accurately
- Export record on dispute pack print

### What is stubbed / incomplete / misleading
- No content hash at pack assembly
- Evidence index lacks attester role and version/hash
- No source set record enabling reproduction
- Regulatory proof pack explicitly demo — should not be used as evidence

### Deletion / retention / legal-hold result
See E-036 (pack retention is handled at the export layer).

### Served vs validly-served result
N/A.

### OCR extracted vs verified fact result
N/A.

### Signature replay result
N/A.

### Pack assembly scope result
See E-036. RLS enforces account scope; no application-layer scope re-check per artifact.

### Next untaken step
Add version/hash and attester role to evidence index entries; compute content hash at pack assembly.

### Risk
**Medium** — Wording is honest; pack is Half-built but does not overclaim.

### Classification
**Launch blocker**

### Workbook update
- Observed Repo State: two print-pack pages; evidence index + comparison; regulatory proof pack explicitly demo; no content hash; no attester role in index; no source set record
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Consumer finding
- Linkage Axis: Built
- Evidential Strength Axis: Weak
- Stopping Point: No content hash; no attester role; no reproducibility
- Next Untaken Step: Add attester_role + document hash to evidence index entries
- Evidence Paths: src/pages/documents/EvidenceVaultPrintPage.jsx, src/pages/documents/DepositDisputePackPrintPage.jsx, src/lib/depositDisputePack.js, supabase/regulatory_proof_engine_proof_pack_vs1.sql
- Classification: Launch blocker
- Inherent Severity: Medium
- Residual Risk: Medium

---

## E-018 — Compliance Safe (evidence/document aspects only)

### Claimed scope
Document/evidence attachment to compliance items, tenant acknowledgement lifecycle, expiry tracking, and proof-pack handoff.

### Observed repository state

**Schema (`supabase/legal_security_phase3.sql` + `supabase/compliance_safe_phase2.sql`):**
- `tenancy_compliance_items`: status (missing|logged|acknowledged|expiring_soon|expired|needs_review|not_applicable), evidence_document_id (FK to documents), served_at, evidence_source_type (document|inspection_report|manual), evidence_source_id, reminder_days_before, expires_at, acknowledged_by_tenant_at
- `compliance_item_acknowledgements`: tenant lifecycle (pending|viewed|acknowledged|disputed|revoked), acknowledged_by, acknowledged_at, comment
- `compliance_evidence_events`: event log
- `compliance_requirements`: expiry_tracking, acknowledgement_required flags

**Access control:**
- RLS: Managers (CRUD), tenants limited via acknowledgement portal only
- `enforce_compliance_acknowledgement_tenant_update()`: tenant can only transition to viewed|acknowledged|disputed

**Expiry / status derivation (`src/lib/complianceSafeStatus.js`):**
- `deriveComplianceItemStatus()`: computes status from stored status + expires_at vs current date
- `isExpiringSoon()`: uses `reminder_days_before`
- No OCR-extracted value auto-writes to `expires_at`

**Proof-pack handoff:**
- `DISPUTE_PACK_EVIDENCE_REFERENCE_TYPES` includes `'compliance_safe_item'` in `depositDisputePack.js`
- A compliance item can be referenced from a deposit pack item, but there is no automatic handoff RPC or export

**Tests:**
- `tests/unit/legalSecurityPhase3.test.js` (not fully read — covers phase 3 SQL contracts)
- `src/lib/complianceSafeStatus.js` tested implicitly through compliance safe

### Verb tested

V1 (upload/store via evidence_document_id link): CODE-READ ONLY  
V4 (acknowledge via tenant acknowledgement): CODE-READ ONLY

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding + Consumer finding

### Linkage axis
**Built** — Evidence document linked to compliance items, acknowledgement lifecycle enforced, expiry tracking present.

### Evidential-strength axis
**Weak**

Reasons:
1. **Service attribution gap.** `served_at` is just a timestamp — same gap as E-035. No actor, recipient, channel, or document version at service time.
2. **No human-verification gate for OCR-sourced expiry.** `expires_at` on a compliance item can be set by a manager reading OCR-extracted text. There is no `ocr_verified_at` or `human_verified_by` field. If a manager copies a misread OCR expiry date, the item's status will compute as 'logged' (compliant) when it should be 'expired'. The system does not distinguish a manually verified expiry from one derived from unverified OCR output.
3. **No delete restriction on served compliance items.** A compliance item with `served_at` set can be deleted by a manager.
4. **Proof-pack handoff is reference only.** Including a compliance item in a deposit pack item adds a type reference (`'compliance_safe_item'`) but does not export the item's evidence document, acknowledgement, or event log.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- `evidence_document_id` links document evidence to compliance items
- `evidence_source_type` distinguishes document/inspection_report/manual sources
- Tenant acknowledgement lifecycle is well-structured (pending → viewed → acknowledged → disputed → revoked)
- Tenant cannot modify landlord-controlled fields (trigger enforcement)
- Expiry tracking with configurable reminder window
- `compliance_evidence_events` event log

### What is stubbed / incomplete / misleading
- `served_at` without actor/recipient/channel/version (same gap as E-035)
- No human-verification gate for OCR-derived expiry dates
- No delete restriction on items that have been served or acknowledged
- Proof-pack handoff is a type label only — no content export

### Deletion / retention / legal-hold result
- Compliance items: deletable by manager regardless of served/acknowledged state
- `compliance_evidence_events`: insert-only (no delete policy found)
- Acknowledgement records: deletable (managers manage; tenant status transition blocked but not deletion)

### Served vs validly-served result
Same gap as E-035. `served_at` is a timestamp on the compliance item — not a full service event record. No actor, recipient, channel, or document version captured.

### OCR extracted vs verified fact result
See E-084. `expires_at` on compliance items is manually set by managers; no auto-write from OCR. However, no `ocr_verified` flag prevents an unverified OCR reading from being entered as the expiry date. The distinction between "manager entered a date they read from OCR" and "manager verified the date against the original document" is absent from the data model.

### Signature replay result
N/A.

### Pack assembly scope result
When a compliance item is referenced in a deposit pack, the pack does not re-check that the item's evidence document is in scope for the pack's property/tenancy.

### Next untaken step
Add `verified_by` and `verified_at` fields to compliance items to distinguish machine-extracted from human-verified expiry dates.

### Risk
**High** — OCR misread → unverified expiry entry → property shows as compliant when not.

### Classification
**Trust blocker**

### Workbook update
- Observed Repo State: evidence_document_id + acknowledgement lifecycle + expiry tracking solid; served_at attribution gap; no OCR verification gate; no delete restriction on served items; proof-pack handoff is type label only
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding + Consumer finding
- Linkage Axis: Built
- Evidential Strength Axis: Weak
- Stopping Point: served_at attribution gap; no human-verification gate for OCR-derived expiry; no delete restriction; proof-pack handoff is reference only
- Next Untaken Step: Add verified_by/verified_at fields to compliance items to distinguish machine vs human-verified expiry
- Evidence Paths: supabase/legal_security_phase3.sql, supabase/compliance_safe_phase2.sql, src/lib/complianceSafeStatus.js, src/services/legalSecurityService.js
- Classification: Trust blocker
- Inherent Severity: High
- Residual Risk: High

---

## E-084 — OCR / scanning

### Claimed scope
Machine-extracted text and metadata must not become verified compliance/legal facts without human review.

### Observed repository state

**Antivirus scanning (`supabase/document_antivirus_scanning.sql`):**
- Quarantine-first upload enforced at DB level
- Scan states: pending_scan → clean | flagged | scan_failed
- `bypass_document_scan()` permanently disabled (raises exception)
- `record_document_scan_result()`: service_role or account owner/admin only
- `audit_document_access()`: blocks access to non-clean documents (pending_scan → "being scanned", flagged → "quarantined")

**Text extraction (`supabase/baseline_schema.sql`):**
- `document_extractions`: id, account_id, document_id, extractor (native_pdf|docling|ocrmypdf_tesseract|paddleocr|olmocr|manual), status (pending|processing|completed|failed|stale), text_content, markdown_content, structured_payload (quality_flag, recommended_extractor, page_breakdown, etc.), confidence_score, source_hash (SHA-256 of raw file bytes), completed_at, error_message
- `document_extraction_runs`: append-only run log (queued → processing → completed|failed|skipped)
- Uniqueness on (account_id, document_id, extractor, source_hash): changed file triggers new row
- RLS: `user_can_manage_account()` — staff-only; tenants and contractors blocked

**Extraction panel (`src/components/DocumentExtractionPanel.jsx`):**
- Shows confidence_score, quality_flag, extractor name
- Shows "⚠ Low confidence" when `recommended_extractor` is set
- Disclaimer: "Extracted text may contain errors. Always verify against the original document."
- `logDocumentExtractionViewed()` called on preview open — audit trail
- Component doc: "must ONLY be rendered for owner/admin/staff roles"

**Auto-trust chain check:**
- `document_extractions.text_content` is surfaced to staff as read-only preview text
- No path found from `text_content` to auto-populate `tenancy_compliance_items.expires_at`
- `expires_at` is set by manager via UI input, not extracted automatically
- No `ocr_verified_at` or `human_verified_by` field distinguishing machine vs human source of expiry dates

**Tests (`tests/security/documentAntivirusScanningContracts.test.js` — in git status modified):**
- Not read in full; listed as modified in git status

### Verb tested

V5 (OCR/scanning): CODE-READ ONLY — extraction table schema, panel, disclaimer traced. Antivirus flow fully traced.

**Evidence type: CODE-READ ONLY**

### Layer classification
Documents/Evidence finding

### Linkage axis
**Built** — extraction pipeline exists with multiple extractors, confidence scoring, source hash, run log. Antivirus gate is solid.

### Evidential-strength axis
**Weak**

Reasons:
1. **No human-verification gate in the data model.** There is no `ocr_verified_at`, `verified_by`, or `verification_status` field on `document_extractions` or on downstream compliance fields. A manager who reads OCR output and enters an expiry date without checking the original is indistinguishable in the database from one who verified against the source document.
2. **Disclaimer is UI text, not system enforcement.** "Always verify against the original document" is displayed in the extraction panel, but nothing prevents the extracted text from being acted on without verification.
3. **Confident misread not blocked at downstream use.** The dangerous OCR failure (high-confidence wrong expiry → compliance status 'OK') is possible if a manager trusts the extraction output. The system does not require confirmation that the value was cross-checked.

### Verdict
**Half-built**

### Confidence
Low (CODE-READ ONLY)

### What works
- Antivirus bypass permanently disabled — strong
- Quarantine-first upload with scan gate on all document access
- `source_hash` (SHA-256) links extraction to specific file bytes — original integrity
- `confidence_score` and `quality_flag` surfaced to user
- "Low confidence" warning when `recommended_extractor` is set
- Re-run clears stale extraction and queues fresh run
- Extraction is manual-trigger only — not automatic on upload
- Staff-only access (RLS + component gate)
- `logDocumentExtractionViewed` audit trail

### What is stubbed / incomplete / misleading
- No human-verification gate in data model — no `ocr_verified_at` or `verified_by` field
- Disclaimer is informational text, not system enforcement
- Downstream use (compliance expiry) cannot distinguish verified from unverified OCR-derived values
- `document_extraction_runs` run log does not record who acted on the extracted text

### Deletion / retention / legal-hold result
- `document_extractions`: source_hash and original file retained; extraction row is not deleted when re-run (new row added via uniqueness on source_hash)
- Scan quarantine path preserved in `storage_path_quarantine` even after clean promotion

### Served vs validly-served result
N/A.

### OCR extracted vs verified fact result
**Gap present.** OCR text is clearly labeled as extracted, with confidence score and "may contain errors" disclaimer. However, there is no system-level gate preventing OCR-derived values from driving compliance or legal status without explicit human verification and acknowledgement. The data model does not distinguish verified from unverified OCR-sourced inputs.

If a manager copies an OCR-extracted expiry date to a compliance item without checking the original, the system records `status = 'logged'` — compliant — with no indication that the source was unverified machine extraction.

### Signature replay result
N/A.

### Pack assembly result
N/A.

### Next untaken step
Add `ocr_source_extraction_id` and `human_verified_at` / `human_verified_by` fields to `tenancy_compliance_items` to distinguish OCR-sourced values from human-verified ones; require verification confirmation when linking an OCR-extracted expiry to a compliance item.

### Risk
**High** — Confident OCR misread of gas safety certificate expiry → property shown as compliant → landlord trusts false compliance. Antivirus scanning is strong.

### Classification
**Trust blocker**

### Workbook update
- Observed Repo State: document_extractions with source_hash/confidence/quality_flag; antivirus bypass disabled; extraction manual-trigger only; no human-verification gate; disclaimer is UI text not system enforcement
- Observed Verdict: Half-built
- Confidence: Low
- Layer: Documents/Evidence finding
- Linkage Axis: Built
- Evidential Strength Axis: Weak
- Stopping Point: No human-verification gate in data model; downstream compliance fields cannot distinguish verified vs unverified OCR-derived values
- Next Untaken Step: Add ocr_source_extraction_id + human_verified_at/human_verified_by to compliance items
- Evidence Paths: supabase/document_antivirus_scanning.sql, supabase/baseline_schema.sql (document_extractions), src/components/DocumentExtractionPanel.jsx
- Classification: Trust blocker
- Inherent Severity: High
- Residual Risk: High

---

## E-030 / E-040 — Provenance Centre UX, export-facing only

### Observed repository state

Proof packs reviewed (`EvidenceVaultPrintPage`, `DepositDisputePackPrintPage`): no provenance sequence, hash, or head references found in print output. Evidence index labels show type and source only.

### Verdict
**N/A** — Provenance chains do not currently surface in proof pack exports. Skip; no Phase 3 findings.

---

## Phase 3 Summary Table

| ID | Topic | Verdict | Confidence | Linkage | Evidential Strength | Layer | Risk | Classification | Stopping Point | Next Untaken Step |
|---|---|---|---|---|---|---|---|---|---|---|
| E-032 | Evidence Vault | Half-built | Low | Built | Weak | D/E | High | Trust blocker | Delete block missing on locked report header; no document hash; signed-status mutation window | Add delete-blocking trigger on inspection_reports for locked/archived status |
| E-033 | Signatures split | **Closed** | High | Strong | **Built** | D/E | ~~High~~ Low | ~~Trust blocker~~ Closed | CLOSED 2026-07-02: single-writer RPC; E-152 content hash; per-share uniqueness; INSERT policies removed; production-RPC atomicity proven; 8/8 integration + 5/5 security contracts pass | — |
| E-034 | Deposit dispute pack | Half-built | Low | Built | Weak | D/E + Consumer | Medium | Launch blocker | attester_role not rendered in pack; no content hash; items mutable after exported status | Surface attester_role in buildEvidenceIndex() |
| E-035 | Document served events | Half-built | Low | Partial | Missing | D/E + Source | High | Trust blocker | No service event record; served_at is timestamp only; no actor/recipient/channel/version | Create document_service_events table with full attribution |
| E-036 | Disclosure basis | Half-built | Low | Partial | Missing | D/E + Consumer | Medium | Launch blocker | No disclosure_basis; no content hash; no scope re-check; inspection report print unrecorded | Add disclosure_basis + content hash to export records |
| E-025 | Proof Packs | Half-built | Low | Built | Weak | Consumer | Medium | Launch blocker | No content hash; no attester role in index; no source set record; regulatory pack is demo | Add attester_role + document hash to evidence index |
| E-018 | Compliance Safe (evidence) | Half-built | Low | Built | Weak | D/E + Consumer | High | Trust blocker | served_at attribution gap; no OCR verification gate; no delete restriction on served items | Add verified_by/verified_at to compliance items |
| E-084 | OCR / scanning | Half-built | Low | Built | Weak | D/E | High | Trust blocker | No human-verification gate; no ocr_verified_at; disclaimer is UI text not system-enforced | Add ocr_source_extraction_id + human_verified_at/by to compliance items |
| E-030/040 | Provenance UX | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Not surfaced in proof packs | N/A |

**All 8 audited rows: Half-built.** No row reaches "Built verified." The substrate stores and links evidence correctly but lacks the integrity layer (hashes, immutable service records, verification gates, delete blocks) that would make the evidence trustworthy.

---

## Evidence-Strength Ledger

| Artifact | Source workflow | What it attests | Attesting party | Benefiting party? | Independent corroboration | Mutable? | Provenance anchored? | Consumed by | Overclaim risk |
|---|---|---|---|---|---|---|---|---|---|
| `inspection_photos.document_id` | Evidence vault builder | Photo taken of item at inspection date | Landlord/agent | Landlord | None system-provided | After locking: protected | No (no hash) | Evidence vault print; deposit dispute pack | Low — no fault claim |
| `inspection_signatures` (landlord) | Landlord portal sign-off | Landlord acknowledged the report | Landlord | Landlord | None | Blocked after locked | No (no doc hash) | Evidence vault print | Low |
| `inspection_signatures` (tenant) | Tenant portal (share) | Tenant acknowledged the report via share | Tenant | Landlord | Tenant dispute comments if present | Blocked after locked | No (no doc hash) | Evidence vault print; dispute pack | Medium — "signed" without doc hash could be challenged |
| `tenancy_compliance_items.served_at` | Compliance safe manual entry | "A service timestamp was recorded" | Manager | Landlord | None | Yes (mutable) | No | Compliance safe UI | **High** — timestamp alone is not service evidence |
| `deposit_dispute_pack_items` | Dispute pack builder | "Evidence referenced from source type" | Manager | Landlord | None (attester_role not rendered) | Yes (until manually locked) | No | Dispute pack print | Medium — comparison shows observation not fault |
| `work_order_attachments` (attester_role=contractor) | Work order completion | Contractor's own photo of completed work | Contractor | Contractor/landlord | No independent check | Locked at completion | No (no hash) | Dispute pack (attester not surfaced) | Medium — could be mistaken for independent evidence |
| `document_extractions.text_content` | OCR extraction worker | Machine-extracted text with confidence score | System (OCR) | N/A | Original file (source_hash retained) | Only stale (new row added) | Yes (source_hash) | Compliance safe manual entry via manager | **High** — if manager copies extracted expiry without verifying |
| `deposit_dispute_pack_exports` | Browser print/save PDF | "Pack was printed/exported at this time by this user" | Manager | Landlord | None | N/A (export record) | No (no content hash) | Audit trail | Low (no false claim) |

---

## Deletion / Retention / Legal-Hold Matrix

| Artifact | Deletable? | By whom | Block mechanism | Legal-hold mechanism | Verdict |
|---|---|---|---|---|---|
| Draft document | Yes | Manager | None required | None | Acceptable |
| Locked inspection report header | **Yes** | Manager | **None** — no trigger on inspection_reports DELETE | None | **Gap — trust blocker** |
| Locked inspection report items/photos | No | — | `trg_prevent_locked_inspection_item_edits` | None | Good |
| Signature on locked report | No | — | `trg_prevent_locked_inspection_signature_edits` | None | Good |
| Signed-not-locked report items | Yes | Manager | No protection (trigger only blocks locked/archived) | None | Gap |
| Dispute pack (exported status) | Yes | Manager | No trigger on deposit_dispute_packs DELETE | None | Gap |
| Served compliance item | Yes | Manager | None | None | Gap |
| Tenancy compliance items | Yes | Manager | None | None | Gap |
| OCR source scan (document bytes) | Yes, indirectly | Manager (via deleteDocument) | `delete_document_and_audit` audited but not blocked | None | Gap |
| `compliance_evidence_events` | No delete policy found | — | Insert-only RLS | None | Acceptable |
| `deposit_dispute_pack_audit_events` | No delete policy found | — | Insert-only RLS | None | Acceptable |

---

## Served vs Validly-Served Matrix

| Item | Service event recorded? | Actor recorded? | Recipient recorded? | Channel recorded? | Address/contact recorded? | Document version/hash? | Jurisdiction/rule certainty? | Pack wording | Overclaim risk |
|---|---|---|---|---|---|---|---|---|---|
| `tenancy_compliance_items.served_at` | Timestamp only | No | No | No | No | No | No | Not evaluated in pack copy | **High** |
| `compliance_evidence_events` | Event type + metadata | user_id | No | No | No | No | No | Not surfaced in pack | Medium |
| Inspection report share (`shared_at`) | Yes (share record) | `shared_by` uuid | `tenant_id` | Portal (tenant portal) | None (portal delivery) | No | No | Not used in "served" claim | Low |
| `deposit_dispute_pack_exports` | Yes (export record) | `generated_by` uuid | N/A (self-export) | Browser print | N/A | No | N/A | Correctly hedged footer | Low |

**Critical finding (E-035):** No row in the system constitutes a legally-adequate service record. `served_at` captures a timestamp but not who served, to whom, by what channel, or which document version. The system records that "a service event was noted" but cannot attest to the validity or completeness of the service act.

---

## OCR Extracted vs Verified Fact Matrix

| Extracted field | Confidence recorded? | Original retained? | Human verification required (system)? | Downstream use | Disclosure state | Gap |
|---|---|---|---|---|---|---|
| Full text (`text_content`) | Yes (confidence_score) | Yes (source_hash → quarantine path) | No (disclaimer only) | Staff preview; no auto-write | Disclaimer in UI | Low (staff preview, no auto-apply) |
| `structured_payload.quality_flag` | Yes | Yes | No | UI warning badge | Shown in panel | Low |
| `structured_payload.recommended_extractor` | Yes | Yes | No | "Low confidence" UI warning | Shown in panel | Low |
| Manager-entered `expires_at` from OCR reading | N/A (not captured) | N/A | No | `deriveComplianceItemStatus()` drives compliant/expired status | Not disclosed | **High** — system cannot distinguish verified from unverified OCR-sourced expiry |

**Critical finding (E-084/E-018):** The dangerous chain is not OCR auto-applying extracted values (that path does not exist). The dangerous chain is: OCR extracts date with high confidence → manager reads extracted text → manager enters date in compliance item `expires_at` without checking original → system shows property as compliant. The data model does not capture whether `expires_at` was verified against the original document. A `human_verified_at` gate would close this gap.

---

## Signature Replay / Mutation Matrix

| Signature artifact | Document version at signing | Same-share re-use | Cross-report replay | Cross-role replay | Mutation after signing | Result |
|---|---|---|---|---|---|---|
| Landlord signature (landlord_portal) | Not captured (no hash) | Not blocked by uniqueness constraint | Blocked by RLS (inspection_report_id check) | Blocked by constraint (signer_role check) | Possible until report is locked | **Weak** — no doc version |
| Tenant signature (tenant_portal, share-linked) | Not captured (no hash) | Multiple signatures per share not blocked | Blocked by RLS + share_id enforcement | Blocked by constraint (signer_role + signed_from) | Possible until report is locked | **Weak** — no doc version; duplicate allowed |

**The mutation-after-signing gap:** A tenant signs a report (status = 'signed'). The landlord then modifies room notes or adds photos. The tenant signature remains on record but now covers a different document than what was signed. The report must be locked by the manager to protect content after signing.

---

## Pack Assembly Scope Matrix

| Pack type | Included artifact | Artifact scope | Assembly-time scope re-check (app layer) | Leakage risk |
|---|---|---|---|---|
| Evidence vault print | Inspection report (single report) | account_id + property_id + tenant_id | RLS only (DB-level, account scope) | Low |
| Deposit dispute pack print | Inspection reports (referenced by ID) | account_id + property_id | No app-layer re-check | Low (same account, different property possible) |
| Deposit dispute pack print | work_order_attachments (via reference) | account_id + work_order scope | No app-layer re-check | Low |
| Compliance safe evidence | Compliance items (account-scoped) | account_id + property_id + tenant_id | RLS only | Low |
| Get evidence pack (Poland RPC) | Compliance items + evidence | account_id + property_id + tenant_id parameters | DB-level RLS | Low |

**Finding:** No active scope leakage found. RLS provides account-level isolation. Application does not re-verify that pack artifacts belong to the same property/tenancy scope — this could allow cross-property bundling within the same account (a landlord including evidence from a different property in a dispute pack). Low risk currently; medium risk if accounts grow to many properties.

---

## Dependency List

| Finding | Dependency | Status |
|---|---|---|
| E-034 | Phase 2 E-077 repair | **Lifted** — `phase2_repair_e066b_e077_e074.sql` committed. Audited post-repair. |
| All Phase 3 rows | Phase 2 E-066b repair | Lifted — diagnostic misrouting fixed; not relevant to evidence layer. |

---

## Drift Assessment

| Finding | Drift type | Affects |
|---|---|---|
| Locked inspection report header is deletable | Missing retention control | Evidence integrity — deletion of locked check-in report after dispute |
| Signed-not-locked mutation window | Missing state protection | Signature integrity — signed document can be modified before locking |
| No document hash in signatures | Missing integrity link | Evidence integrity — signature cannot be traced to specific version |
| `served_at` is unattributed timestamp | Missing service attribution | Legal/procedural overclaim risk — system implies service happened but provides no service record |
| No human-verification gate for OCR-derived expiry | Missing verification workflow | OCR extracted vs verified truth — compliance status can be set from unverified machine text |
| `attester_role` not rendered in pack | Missing self-attestation disclosure | Evidence integrity — self-attested contractor evidence not labelled |
| No content hash at pack export | Missing export integrity | Pack leakage detection — exported pack cannot be verified post-export |

---

## Final Assessment

> Is Tenaqo's evidence layer a real proof substrate, or a file store with authoritative-looking exports?

**Partial.** The current state is closer to "file store with honest-looking exports" than "real proof substrate."

**What is solid:**
- Storage mechanics: quarantine-first scan, audit logging, document deletion monitoring
- Access control: RLS throughout, staff-only OCR access, tenant scope via share
- Acknowledgement lifecycle: tenant acknowledgement chain is well-designed
- Pack wording: both print pages correctly disclaim legal standing and do not overclaim

**What is weak across all rows:**
- Retention: locked inspection reports can be deleted; no legal-hold mechanism
- Signatures: no document version hash; signed-not-locked mutation window
- Service events: `served_at` is a timestamp, not a service record
- OCR → compliance: no human-verification gate in the data model
- Pack exports: no content hash, no disclosure basis, no source set

**The most dangerous gaps (in priority order):**
1. Locked inspection report header is deletable (E-032) — High / Trust blocker
2. No human-verification gate for OCR-derived compliance expiry (E-084/E-018) — High / Trust blocker  
3. No service event record with actor/recipient/channel (E-035) — High / Trust blocker
4. Signed-not-locked mutation window (E-033) — High / Trust blocker
5. attester_role not rendered in dispute pack (E-034) — Medium / Launch blocker

A partial evidence layer is manageable. A misleading evidence layer is not. The current layer is partial, not misleading. The pack wording is appropriately hedged. The gaps are in the evidence substrate, not in the claims made about it.
