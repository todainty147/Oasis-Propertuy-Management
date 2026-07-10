# Evidence & Proof Packs Runbook

Covers three shipped pack surfaces:

1. **Compliance Proof Pack** — RRA Information Sheet obligation evidence (Renters' Rights)
2. **Maintenance Evidence Pack** — Work order attachment and provenance evidence
3. **Deposit Dispute Pack** — Inspection report and deduction evidence for deposit disputes

---

## Purpose

These packs assemble operational evidence records into landlord-readable views and PDF/print exports. They record what Tenaqo checked, what evidence is on file, and what condition or service evidence was captured. They do **not** make legal determinations, adjudicator decisions, or authenticity claims beyond what the evidence model supports.

---

## Scope and current status

| Pack | Status | Customer access | Demo watermark |
|---|---|---|---|
| Compliance Proof Pack | Live (Growth) | Growth landlords with obligations | Yes — "Demo proof pack — not legal sign-off" |
| Maintenance Evidence Pack | Live (no entitlement gate) | Any manager with work orders | Yes — "Demo maintenance pack — not legal sign-off" |
| Deposit Dispute Pack | Live (Growth, P-005) | Growth landlords | No demo watermark — amber caveat banner |

**Gate-B Full is not yet complete for Compliance and Maintenance packs.** The `customer_facing_allowed`, `gate_b_signed_off`, and `demo_mode` SQL constants are still hardcoded for those surfaces. The demo watermark is the only current guard. Do not remove it without a deliberate Gate-B Full pass that changes both SQL constants and adds frontend enforcement simultaneously.

---

## Critical invariants

- No pack may claim that damage is proven, a deduction is legally valid, a photo is authenticated, a signature legally executes an agreement, or that an adjudicator will accept the evidence.
- No pack may claim that a locked inspection report is cryptographically sealed.
- Compliance Proof Pack watermark ("Demo proof pack — not legal sign-off") must remain visible until Gate-B Full changes `customer_facing_allowed`, `gate_b_signed_off`, and `pack_status_label` in SQL — and a frontend gate on `status.customer_facing_allowed` is simultaneously deployed.
- Inspection signatures are recorded through `capture_inspection_signature` RPC only (E-033 sole-writer). Do not insert into `inspection_signatures` directly.
- Maintenance evidence pack PDF contains attachment metadata and hash records. It does not serve raw file bytes to the client.
- All pack tables are account-scoped with RLS. Cross-account access is denied at the DB layer.
- The RPE diagnostic page (`/internal/compliance/renters-rights/rpe-diagnostic`) is root-operator-only and must not be linked or described to regular landlords.

---

## Key files

### Compliance Proof Pack

| Type | Path |
|---|---|
| Page | `src/pages/compliance/RentersRightsProofPackPage.jsx` |
| Panel | `src/components/compliance/ObligationProofPackPanel.jsx` |
| Labels / copy | `src/components/compliance/proofPackPresentation.js` |
| PDF export | `src/utils/proofPackPdfExport.js` |
| Service | `src/services/regulatoryProofEngineService.js` |
| SQL (RPC) | `supabase/regulatory_proof_engine_proof_pack_vs1.sql` |
| Route | `src/routes/ManagerRoutes.jsx` lines ~625, ~633 |
| Unit tests | `tests/unit/proofPackPdfExport.test.js` |
| Integration tests | `tests/integration/rraBridgeObligation.test.js`, `tests/integration/proofPackPdfRealData.test.js` |
| Security contracts | `tests/security/regulatoryMonitoringVs25Contracts.test.js`, `tests/security/mediumSecurityContracts.test.js` |
| Demo artifact | `artifacts/compliance-proof-pack-v0-demo.pdf` |

### Maintenance Evidence Pack

| Type | Path |
|---|---|
| Export button / handler | `src/pages/WorkOrderDetails.jsx` (`handleExportPack`, "Evidence Pack" card) |
| Pack assembler | `src/services/maintenanceEvidencePackService.js` |
| RPC wrapper | `src/services/workOrderEvidencePackService.js` |
| PDF generator | `src/utils/maintenanceEvidencePackPdfExport.js` |
| SQL (RPC) | `supabase/work_order_evidence_pack.sql` |
| Route | `src/routes/ManagerRoutes.jsx` — `/work-orders/:id` (no dedicated route) |
| Unit tests | `tests/unit/maintenanceEvidencePackPdfExport.test.js` |
| Integration tests | `tests/integration/maintenanceEvidencePackRealData.test.js` |
| Security contracts | `tests/security/workOrderManagerServiceContracts.test.js`, `tests/security/workOrderViewSecurityContracts.test.js` |
| Demo artifact | `artifacts/maintenance-evidence-pack-v0-demo.pdf` |

### Deposit Dispute Pack

| Type | Path |
|---|---|
| List / edit page | `src/pages/documents/DepositDisputePacksPage.jsx` |
| Print / export page | `src/pages/documents/DepositDisputePackPrintPage.jsx` |
| Pack builder library | `src/lib/depositDisputePack.js` |
| Evidence vault helpers | `src/lib/evidenceVault.js` |
| Service | `src/services/legalSecurityService.js` |
| Settlement service | `src/services/depositSettlementService.js` |
| SQL (tables) | `supabase/evidence_vault_phase2.sql` |
| Routes | `src/routes/ManagerRoutes.jsx` lines ~386–411 |
| Unit tests | `tests/unit/depositDisputePack.test.js`, `tests/unit/depositDisputePackHtmlExport.test.js`, `tests/unit/depositSettlement.test.js`, `tests/unit/evidenceVault.test.js` |
| Integration tests | `tests/integration/depositDisputePackAssembly.test.js` |
| Demo artifact | `artifacts/deposit-dispute-pack-v0-demo.html` |

---

## Data model / RPCs / functions

### Compliance Proof Pack

- **RPC:** `get_obligation_proof_pack(p_account_id, p_obligation_instance_id)` — assembles full proof payload; hardcodes `demo_mode: true`, `customer_facing_allowed: false`, `gate_b_signed_off: false`, `pack_status_label: 'Demo proof pack — not legal sign-off'`
- **RPC:** `reconcile_rra_info_sheet_obligation(...)` — creates/updates obligation instance
- **RPC:** `captureAndDischargeRraInfoSheetObligation(...)` — records service evidence and discharges
- **Tables:** `rra_info_sheet_evaluations`, `obligation_instances`, `rra_info_sheet_service_evidence`, `provenance_events`

### Maintenance Evidence Pack

- **RPC:** `get_work_order_evidence_pack(p_account_id, p_work_order_id)` — assembles attachment + provenance payload; hardcodes `pack_status_label: 'Demo maintenance pack — not legal sign-off'`
- **Tables:** `work_orders`, `maintenance_requests`, `work_order_attachments` (includes `content_hash_client_asserted`, `content_hash_server_computed`, `hash_trust`, `content_hash_verified_at`), `provenance_events`

### Deposit Dispute Pack

- **Tables:** `deposit_dispute_packs`, `deposit_dispute_pack_items`, `deposit_dispute_pack_exports`, `deposit_dispute_pack_audit_events`
- **Tables (inspection):** `inspection_reports`, `inspection_rooms`, `inspection_evidence_items`, `inspection_photos`, `inspection_signatures`, `inspection_report_shares`, `inspection_report_tenant_comments`, `inspection_audit_events`
- **Key RPC:** `capture_inspection_signature(...)` — sole writer for inspection signatures (E-033); SECURITY DEFINER; provenance-anchored
- **Export:** browser print only; `recordDepositDisputePackExport()` writes to `deposit_dispute_pack_exports` on print

---

## Normal operation

### Compliance Proof Pack

1. Landlord marks an RRA information sheet task as sent on the Renters' Rights page.
2. `markRrTaskSentAndReconcileObligation()` bridge creates an obligation instance via `reconcile_rra_info_sheet_obligation` and captures discharge evidence via `captureAndDischargeRraInfoSheetObligation`.
3. Landlord navigates to Renters' Rights → Proof Packs.
4. Selects a pack reference from the dropdown → `get_obligation_proof_pack` RPC assembles the payload.
5. `ObligationProofPackPanel` renders the pack with the demo watermark.
6. Landlord clicks Export PDF → `generateProofPackPdf()` builds a jsPDF document with the watermark embedded.

### Maintenance Evidence Pack

1. Landlord or manager navigates to a completed work order (`/work-orders/:id`).
2. Scrolls to the "Evidence Pack" card.
3. Clicks "Export Evidence Pack" → `getWorkOrderEvidencePack()` calls the `get_work_order_evidence_pack` RPC.
4. `generateMaintenancePackPdf()` builds a jsPDF document; `doc.save()` triggers browser download as `maintenance-evidence-pack-{id8}.pdf`.
5. PDF contains: work order metadata, contractor details, attachment hashes and metadata, provenance events, watermark.

### Deposit Dispute Pack

1. Landlord creates check-in and check-out inspection reports via Evidence Vault (`/documents/evidence-vault`).
2. Landlord creates a dispute pack at `/documents/evidence-vault/dispute-packs`.
3. Adds pack items: inspection report references, deduction items with amounts, supporting documents.
4. Navigates to the print page (`:packId/print`) to preview the rendered pack.
5. Clicks "Print / save PDF" → `window.print()` opens browser print dialog; `recordDepositDisputePackExport()` fires in the background.
6. Landlord saves as PDF from the browser.

---

## Entitlement and access paths

| Pack | Entitlement key | Plan tier | Feature flag default | How to enable for a specific account |
|---|---|---|---|---|
| Compliance Proof Pack | `renters_rights_readiness` | Growth | In-plan | No action needed for Growth accounts |
| Maintenance Evidence Pack | None | All managers | N/A | No action needed |
| Deposit Dispute Pack | `evidence_vault_dispute_pack` | Growth (P-005) | `false` in DB for pre-P-005 accounts (plan-based check now supersedes for Growth) | For accounts below Growth: `UPDATE public.account_feature_flags SET enabled = true WHERE account_id = '<id>' AND feature_key = 'evidence_vault_dispute_pack'` |

---

## Common failure modes

### Compliance Proof Pack

| Symptom | Likely cause | First check |
|---|---|---|
| "No proof pack records yet" and landlord has sent tasks | Bridge not triggered — tasks were marked sent before P-003 or the bridge returned `no_lease` / `evaluation_failed` | Check `bridgeStatus` in rentersRightsService; ask landlord to re-mark the task as sent on the Renters' Rights page |
| Pack reference dropdown is empty | No obligation instances created for this account | Confirm mark-as-sent completed without error; check `obligation_instances` for `account_id` |
| PDF export button not visible | Entitlement `renters_rights_readiness` missing | Confirm account is on Growth or above |
| PDF generates but watermark says "Demo proof pack" | Expected — `pack_status_label` is hardcoded in SQL pre-Gate-B Full | Inform customer this is the current demo state; Gate-B Full is not yet shipped |
| "No proof pack loaded" in panel | `get_obligation_proof_pack` returned null | Confirm `obligation_instance_id` belongs to this account; check RLS |

### Maintenance Evidence Pack

| Symptom | Likely cause | First check |
|---|---|---|
| "Evidence Pack" card not visible | User is not a manager (`canManage = false`) | Confirm user role in `account_members` |
| "Failed to export evidence pack" error | `get_work_order_evidence_pack` RPC failed | Check work order account ownership; check RPC authorization (`user_can_manage_account`) |
| PDF downloads but is empty / missing attachments | Work order has no `work_order_attachments` rows | Confirm files were uploaded to this specific work order |
| Hash trust shows "unverified" in PDF | `content_hash_server_computed` null — scan/verification job did not run | Check ClamAV scan pipeline for this attachment; do not manually set hash trust |

### Deposit Dispute Pack

| Symptom | Likely cause | First check |
|---|---|---|
| Route shows "FeatureAccessCard" upgrade prompt | `evidence_vault_dispute_pack` not enabled — account below Growth or pre-P-005 flag row still `false` | Confirm plan is Growth; if so, confirm P-005 is deployed (entitlement now plan-based for Growth) |
| Pack list is empty | No packs created for this account | Normal — landlord must create a pack |
| Photos show "Photo preview unavailable" | `document_id` is null on inspection photo (storage-path-only upload) | Normal — signed URL requires `document_id`; photos uploaded without document association show placeholder |
| Condition comparison is empty | Check-in or check-out report not added as pack items | Landlord must add both reports as pack items with `evidence_reference_type = check_in_report / check_out_report` |
| Print page hangs loading | Pack ID doesn't exist or RLS denies access | Confirm `packId` in URL matches a `deposit_dispute_packs` row for this account |
| "Print / save PDF" not producing output | Browser print dialog blocked by browser settings | Advise user to allow pop-ups / print dialogs for the app domain |

---

## Triage checklist

Start read-only. Confirm before any remediation:

1. Which pack surface — Compliance / Maintenance / Deposit?
2. Account ID and user role.
3. Plan tier and relevant entitlement state.
4. Specific error message or symptom (exact text, screenshot).
5. For Compliance: was a task marked as sent recently? Check `bridgeStatus` in logs if available.
6. For Maintenance: does the work order have attachments? Is the user a manager?
7. For Deposit: does the pack exist in `deposit_dispute_packs` for this account? Are pack items present?
8. Check relevant test coverage exists and last run was green before concluding there is a new bug.

---

## Safe operator actions

- Read `obligation_instances`, `deposit_dispute_packs`, `work_orders` for the affected account (read-only).
- Ask the landlord to re-mark an RRA task as sent to re-trigger the obligation bridge.
- Enable `evidence_vault_dispute_pack` flag for a specific account via SQL (Growth accounts only, to bypass any stale pre-P-005 flag row).
- Advise landlord to add both check-in and check-out reports as pack items for the condition comparison to appear.
- Share `artifacts/` demo files with internal reviewers for pack content review.

---

## Unsafe actions / never do

- Do not insert directly into `inspection_signatures` — use `capture_inspection_signature` RPC only.
- Do not manually set `content_hash_server_computed` or `hash_trust` on attachments.
- Do not remove the demo watermark from Compliance or Maintenance packs without completing Gate-B Full (SQL + frontend gate simultaneously).
- Do not mark `customer_facing_allowed = true` or `gate_b_signed_off = true` in SQL for any account without a full Gate-B pass.
- Do not make `deposit_dispute_packs` or `inspection_reports` publicly accessible or copy them between accounts.
- Do not delete `inspection_audit_events` or `deposit_dispute_pack_audit_events` rows.
- Do not claim to a customer that a proof pack constitutes legal proof, that an adjudicator will accept it, or that photos are independently authenticated.

---

## Customer-safe wording

**Compliance Proof Pack:**
"The proof pack is a record of the compliance check and evidence Tenaqo captured for this tenancy. It shows what was evaluated and what service evidence is on file. It does not constitute legal advice or a deposit adjudicator's decision. The current view carries a demo watermark while the product is in its early access phase."

**Maintenance Evidence Pack:**
"The evidence pack is a record of the maintenance job, the attachments uploaded, and the provenance events captured. It records what was on file at the time of export. It does not prove that the photo is authentic, that the file is safe, or that the work was legally verified."

**Deposit Dispute Pack:**
"The dispute pack is an operational evidence record created from your inspection reports and deduction notes. It does not by itself prove legal liability or that a deduction will be accepted by a deposit scheme adjudicator. Condition ratings, notes, and deduction amounts are records you entered in Tenaqo."

---

## Escalation

Escalate to engineering if:

- A pack is accessible by a user from a different account (cross-account RLS failure).
- `inspection_signatures` has rows not created by `capture_inspection_signature` RPC.
- `hash_trust` shows `verified` but `content_hash_client_asserted` ≠ `content_hash_server_computed`.
- A customer has received a pack without the demo watermark before Gate-B Full is shipped.
- `provenance_events` rows are missing for a sequence that should be complete.

---

## Recovery / rollback notes

- Compliance Proof Pack: bridge failure (`bridgeStatus = evaluation_failed`) — ask landlord to re-mark as sent. Do not manually insert obligation instances.
- Maintenance Evidence Pack: PDF export failure — safe to retry; no state is written to DB on export (jsPDF is client-side).
- Deposit Dispute Pack: print/export failure — safe to retry; `recordDepositDisputePackExport()` failure is silent (export audit is non-blocking). Pack data is not mutated by the print action.
- If a pack item was added incorrectly, use `removeDepositDisputePackItem()` service function to remove it before the pack is locked.
- Locked packs (`status = locked`) cannot be edited through the UI. Do not unlock via direct SQL without explicit engineering approval.

---

## Verification after fix

- Compliance Proof Pack: obligation appears in pack reference dropdown; PDF exports with watermark; cross-account landlord cannot see other account's obligations.
- Maintenance Evidence Pack: PDF downloads successfully; PDF contains attachment count, hash values, and provenance events.
- Deposit Dispute Pack: pack renders on print page; caveat banner is visible; deduction total is correct; condition comparison rows appear when both report types are linked.

Run:
```bash
npx vitest run tests/security/entitlements.test.js --reporter=verbose
npx vitest run tests/unit/depositDisputePack.test.js tests/unit/proofPackPdfExport.test.js --reporter=verbose
npx vitest run --config vitest.integration.config.js tests/integration/depositDisputePackAssembly.test.js tests/integration/rraBridgeObligation.test.js --reporter=verbose
```

---

## Gate-B Full deferred items

The following must be completed as a single coordinated pass before full production customer launch of the Compliance Proof Pack:

1. Change SQL constants in `supabase/regulatory_proof_engine_proof_pack_vs1.sql`: `demo_mode → false`, `customer_facing_allowed → true`, `gate_b_signed_off → true`, `pack_status_label → production label`.
2. Add frontend enforcement: check `status.customer_facing_allowed` in `ObligationProofPackPanel` before rendering the pack body (currently renders unconditionally).
3. Update `pack_status_label` to a production label (remove "Demo proof pack" wording).
4. Apply the same pass to `work_order_evidence_pack.sql` for the Maintenance Evidence Pack.
5. Run full regression suite before deploying.

Do not do these steps partially. SQL and frontend gate must ship together.

---

## Related tests

| Test file | Protects |
|---|---|
| `tests/security/entitlements.test.js` | Plan tier assignments including `evidence_vault_dispute_pack` in Growth |
| `tests/security/regulatoryMonitoringVs25Contracts.test.js` | RRA obligation RPC contracts |
| `tests/security/mediumSecurityContracts.test.js` | Cross-cutting security contracts |
| `tests/security/workOrderManagerServiceContracts.test.js` | Work order manager access |
| `tests/security/workOrderViewSecurityContracts.test.js` | Work order view RLS |
| `tests/security/legalSecurityPhase3Contracts.test.js` | Inspection report / signature RLS |
| `tests/unit/proofPackPdfExport.test.js` | Compliance proof pack PDF content and caveats |
| `tests/unit/maintenanceEvidencePackPdfExport.test.js` | Maintenance evidence pack PDF content |
| `tests/unit/depositDisputePack.test.js` | Deposit pack builder functions |
| `tests/unit/depositDisputePackHtmlExport.test.js` | Deposit pack HTML artifact and caveat assertions |
| `tests/unit/depositSettlement.test.js` | Settlement → pack item conversion |
| `tests/unit/evidenceVault.test.js` | Evidence vault helpers and editability guards |
| `tests/integration/rraBridgeObligation.test.js` | RRA task → obligation bridge; cross-account deny |
| `tests/integration/depositDisputePackAssembly.test.js` | End-to-end deposit pack assembly; caveat banner contract |
| `tests/integration/maintenanceEvidencePackRealData.test.js` | Maintenance pack real-data assembly |
| `tests/integration/proofPackPdfRealData.test.js` | Compliance proof pack real-data PDF |
