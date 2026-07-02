# E-150 Maintenance Photo Evidence — Preflight Trace

**Version:** 1.0  
**Date:** 2026-07-02  
**Type:** Read-only trace. No code changed.  
**Branch:** codex/hmrc-e1-hardening  

---

## 1. Starting scenario

**Scenario 4 — existing but weak photo upload path that needs provenance hardening.**

Two upload paths already exist. Neither is provisioned with evidence semantics: no `received_at` anchor, no `capture_method`, no `maintenance_stage`, no `image_content_hash`, no provenance event. E-150 is therefore a hardening exercise on top of existing substrate, not a greenfield build.

---

## 2. All relevant files found

| File | Role |
|---|---|
| `src/services/workOrderAttachmentsService.js` | Upload/list/delete for `work_order_attachments` table |
| `src/services/maintenanceRequestAttachmentsService.js` | Upload/list/delete for maintenance-request-attachments bucket (storage-only) |
| `src/components/work-orders/ContractorAttachmentsPanel.jsx` | Work-order UI panel (contractor + manager) |
| `src/components/maintenance/MaintenanceRequestAttachmentsPanel.jsx` | Request-level UI panel (tenant + manager) |
| `src/components/mobile/MobileUploadZone.jsx` | Mobile upload component with `capture="environment"` (camera) — NOT wired to any maintenance surface |
| `src/hooks/useMobileUpload.js` | `UPLOAD_PRESETS.maintenancePhoto` and `UPLOAD_PRESETS.workOrderPhoto` defined — NOT used |
| `supabase/phase2_repair_e066b_e077_e074.sql` | Adds `attester_role` to `work_order_attachments`; evidence lock at work-order completion |
| `supabase/storage_maintenance_request_attachments_policies.sql` | RLS for `maintenance-request-attachments` bucket |
| `supabase/storage_buckets.sql` | Declares both storage buckets |
| `supabase/baseline_schema.sql` | `work_order_attachments` table + RLS policies + `work_order_attachments_list` RPC |
| `supabase/legal_security_phase3.sql` | `inspection_photos` table with `captured_at timestamptz default now()` |
| `supabase/maintenance_smart_diagnostics.sql` | `photo_prompt` info step ("Photos can be added after submission…") |
| `src/pages/ContractorJobDetails.jsx` | Wires `ContractorAttachmentsPanel`; "Add Photo" button scrolls to attachment panel |

---

## 3. Current UI surfaces

### 3a. Tenant — maintenance request creation

**File:** Multiple (AI diagnostic flow in `MaintenanceInboxPage.jsx` / tenant portal)  
**Role:** Tenant  
**Action:** Raise a maintenance request via diagnostic wizard  
**Supports images:** No — the diagnostic flow does not include file upload at creation time  
**Camera capture:** No  
**Stage stored:** No stage model  
**Note:** The `maintenance_smart_diagnostics.sql` seed data for the `other` issue type has a `photo_prompt` info step (type `'info'`, not `'photo'`): *"Photos can be added after submission from the request details panel."* This is a text notice in the diagnostic wizard, not an upload widget. Photos cannot be attached during request creation.

### 3b. Tenant / manager — maintenance request follow-up (post-submission)

**File:** `src/components/maintenance/MaintenanceRequestAttachmentsPanel.jsx`  
**Role:** Tenant and manager (controlled by `canUpload` prop)  
**Action:** Upload files to an existing maintenance request  
**Supports images:** Yes — `isImage()` check detects jpg/jpeg/png/gif/webp/bmp/svg for preview rendering  
**Camera capture:** No — `<input type="file" multiple>` only; no `capture="environment"` attribute  
**Stage stored:** No — no stage/context field. Attachments go to a flat folder per request  
**Upload guard:** Blocked if `status === 'closed'`. All other statuses permit upload at any time (post-hoc upload possible at any point before closure)  
**Provenance event:** None emitted  

### 3c. Contractor / manager — work order completion photos

**File:** `src/components/work-orders/ContractorAttachmentsPanel.jsx`  
**Role:** Contractor (assigned `contractor_user_id`) and manager (owner/admin/staff)  
**Action:** Upload files to a work order  
**Supports images:** Yes — `isImage()` check for preview; `kind` field auto-set to `'photo'` for `image/*` MIME types  
**Camera capture:** No — `<input type="file" multiple>` only; no `capture="environment"` attribute  
**Stage stored:** No — `attester_role` exists on the DB row but is **never passed from the UI**. `ContractorAttachmentsPanel` calls `uploadWorkOrderAttachments({ accountId, workOrderId, files })` without `attesterRole`. The DB column exists but is always `null` in practice.  
**Stage binding:** No — no field for `contractor_arrival`, `contractor_completion`, etc.  
**Provenance event:** None emitted  
**Post-hoc upload:** Allowed until work-order completion (E-077 lock fires at completion status via DB trigger, preventing uploader-delete; but new uploads are not blocked until the work order is completed)  

### 3d. Contractor portal — `ContractorJobDetails.jsx`

**File:** `src/pages/ContractorJobDetails.jsx`  
**Role:** Contractor  
**Action:** View/manage work order; "Add Photo" CTA button scrolls to `ContractorAttachmentsPanel`  
**Supports images:** Yes (via ContractorAttachmentsPanel)  
**Camera capture:** No  
**Stage stored:** No  

### 3e. Landlord/staff maintenance follow-up

Uses `ContractorAttachmentsPanel` or `MaintenanceRequestAttachmentsPanel` where rendered in `MaintenanceInboxPage`. No stage binding.

### 3f. MobileUploadZone — not yet wired

**File:** `src/components/mobile/MobileUploadZone.jsx`  
**Status:** Component implemented; camera shortcut (`capture="environment"`, mobile-only) present. `UPLOAD_PRESETS.maintenancePhoto` and `UPLOAD_PRESETS.workOrderPhoto` defined in `src/hooks/useMobileUpload.js`. Neither the component nor the presets are imported anywhere outside their own files. This is dead scaffold — built but not wired to any maintenance surface.

---

## 4. Storage paths and policies

### 4a. `maintenance-request-attachments` bucket

| Property | Value |
|---|---|
| Bucket | `maintenance-request-attachments` (private) |
| Path convention | `account/<accountId>/maintenance_requests/<requestId>/<ts>_<safeName>` |
| RLS / storage policy | `mr_attach_select_access` (SELECT), `mr_attach_insert_access` (INSERT), `mr_attach_delete_access` (DELETE) in `supabase/storage_maintenance_request_attachments_policies.sql` |
| Allowed roles | SELECT: `can_view_maintenance_request_attachment` — members + assigned contractors; INSERT: `can_manage_maintenance_request_attachment` — members + tenant owner of the request; DELETE: same as insert |
| Max file/MIME | 10 files × 15 MB in service; no bucket-level restrictions set |
| Virus scanning | **None** — no scan/quarantine path. The antivirus path exists only for the `documents` bucket via `document_antivirus_scanning.sql` |
| DB row | **No** — storage object only. No `maintenance_request_attachments` table. List via `storage.objects` `list()` API |
| Timestamps | `storage.objects.created_at` (storage insert time = server time) |
| Content hash | **None** |

### 4b. `work-order-attachments` bucket

| Property | Value |
|---|---|
| Bucket | `work-order-attachments` (private) |
| Path convention | `account/<accountId>/work_orders/<workOrderId>/<ts>_<safeName>` |
| RLS / storage policy | Multiple overlapping sets in `baseline_schema.sql` (`wo_attach_*`, `wo_attachments_*`, `woa_*`). Effective: SELECT and INSERT require `can_access_work_order`; DELETE allows uploader or owner/admin/staff |
| Allowed roles | Manager (owner/admin/staff) and assigned contractor |
| Max file/MIME | 10 files × 15 MB in service |
| Virus scanning | **None** |
| DB row | **Yes** — `work_order_attachments` table (see §5) |
| Timestamps | `created_at timestamptz default now()` = server insert time |
| Content hash | **None** |

---

## 5. Database model

### 5a. `work_order_attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL → `accounts.id` CASCADE | Account scope |
| `work_order_id` | uuid NOT NULL → `work_orders.id` CASCADE | Work-order binding |
| `uploaded_by` | uuid | `auth.uid()` at upload time |
| `attester_role` | text CHECK (null or 'contractor','landlord','tenant','admin','system') | Added by E-077. **Never set from UI — always null** |
| `file_name` | text | Client-supplied filename |
| `mime_type` | text | Client-supplied; not server-verified |
| `file_size` | bigint | Client-supplied; not server-verified |
| `storage_bucket` | text CHECK = 'work-order-attachments' | |
| `storage_path` | text CHECK ~~ 'account/%/work_orders/%/%' | |
| `kind` | text CHECK ('photo','document') DEFAULT 'photo' | Set from `file.type.startsWith('image/')` client-side |
| `created_at` | timestamptz DEFAULT now() | Server-assigned insert time = closest to `received_at` |

**Foreign keys:** `work_order_id → work_orders.id ON DELETE CASCADE`  
**Missing:** No `maintenance_request_id`, no `maintenance_stage`, no `capture_method`, no `image_content_hash`, no `captured_at`, no `received_at` (the `created_at` is functionally `received_at` but not named or anchored as such)

**Post-hoc upload:** The E-077 evidence lock fires at work-order completion — it blocks `uploaded_by` from deleting attachments after completion, but does NOT prevent new uploads to a completed work order. The insert RLS policy checks `can_access_work_order` without a completion-status guard.

### 5b. `maintenance_request_attachments` — does not exist

There is **no** `maintenance_request_attachments` table. The request-level path is storage-object-only. There is no DB row for request-level uploads — meaning no `attester_role`, no `kind`, no `uploaded_by`, no scoping beyond path parsing.

### 5c. `inspection_photos` (evidence vault — not maintenance)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid | |
| `evidence_item_id` | uuid → `inspection_evidence_items.id` CASCADE | |
| `document_id` | uuid | FK to documents (nullable) |
| `storage_path` | text | |
| `caption` | text | |
| `captured_at` | timestamptz DEFAULT now() | Server-assigned at insert — **not EXIF** |
| `created_by` | uuid | |

This is for inspection report room evidence, not maintenance requests or work orders.

---

## 6. Provenance / event anchoring

**Neither attachment path emits any provenance event.**

Searched for: `_append_evidence_provenance_event`, `record_provenance_event`, `maintenance_photo`, `work_order_photo`, `attachment.captured`, `photo.captured` — zero matches in either service or SQL.

The only maintenance-related provenance event anywhere near the attachment path is the E-077 evidence lock trigger, which fires an audit event in `work_order_audit_log` at completion — not a provenance event in `provenance_events`.

No `occurred_at` source is anchored for any maintenance photo. No `image_content_hash`. No `capture_method`.

---

## 7. "Photographic evidence awaited"

**Result: NOT FOUND anywhere in the codebase.**

Exhaustive search across `src/`, `supabase/`, `tests/`, and `docs/` — zero matches for `"photographic evidence awaited"` or any close variant.

The closest references found:

1. **`supabase/maintenance_smart_diagnostics.sql`**: `photo_prompt` info step (type `'info'`) with text *"Photos can be added after submission from the request details panel."* — this is a non-upload informational step in the AI diagnostic wizard telling tenants where to upload later. Not a photo-required or awaited signal.

2. **`src/lib/depositDisputePack.js`**: `photo_evidence` as a `deposit_dispute_pack_items.item_type` enum option — a categorisation label in the pack builder, not a UI phrase.

3. **`src/pages/documents/DepositDisputePackPrintPage.jsx`**: "…signed inspection reports, tenant comments and photo evidence where relevant." — instructional copy in the print page, not a status flag.

**The phrase does not exist as a status, placeholder, dead code, or test fixture in this repo.** If it appeared in a founder/early-user observation, it was likely describing the absence of photos, not a literal string rendered by the app.

---

## 8. EXIF / client timestamp handling

**None found.** Zero references to `EXIF`, `DateTimeOriginal`, or any EXIF library in `src/`, `supabase/`, or `tests/`.

`inspection_photos.captured_at` defaults to `now()` (server insert time). It is not populated from the client and is not EXIF-derived. The legalSecurityService.js reads `captured_at` for display purposes only — it receives the server-assigned value.

No current path trusts EXIF. No current path reads client-side file timestamps. **EXIF risk is a future-build concern, not a current gap.**

---

## 9. Maintenance stage binding

**None exists.** No field for `tenant_reported`, `contractor_arrival`, `contractor_completion`, `follow_up`, `before`, `after` in either attachment path or any upload API call.

`work_order_attachments.kind` distinguishes photo vs document but not maintenance stage. `work_order_attachments.attester_role` distinguishes who uploaded but is never set from the UI.

There is no way to distinguish a contractor arrival photo from a completion photo in the current data model.

---

## 10. Reuse candidates for E-150 build

| Candidate | File | Notes |
|---|---|---|
| `work_order_attachments` table | `supabase/baseline_schema.sql` + `phase2_repair_e066b_e077_e074.sql` | Has `attester_role`, `kind`, `created_at` (functional `received_at`). Add `maintenance_stage`, `image_content_hash`, populate `attester_role` from caller context |
| `workOrderAttachmentsService.js` | `src/services/workOrderAttachmentsService.js` | Upload/list/delete infra ready. Needs: pass `attesterRole` and `maintenanceStage` at call sites; emit provenance event after DB insert |
| `maintenanceRequestAttachmentsService.js` | `src/services/maintenanceRequestAttachmentsService.js` | Needs: a `maintenance_request_attachments` table (or migrate to use a shared attachments table with polymorphic FK); currently storage-only |
| `MobileUploadZone` component | `src/components/mobile/MobileUploadZone.jsx` | Built with `capture="environment"` camera support. Needs wiring to maintenance surfaces |
| `useMobileUpload` hook + presets | `src/hooks/useMobileUpload.js` | `UPLOAD_PRESETS.maintenancePhoto` and `UPLOAD_PRESETS.workOrderPhoto` already defined. Unused — ready to wire |
| `can_view/can_manage_maintenance_request_attachment` helpers | `supabase/storage_maintenance_request_attachments_policies.sql` | RLS helper functions; reusable for any table-level RLS on a `maintenance_request_attachments` table |
| `provenance_content_hash(jsonb)` | `supabase/evidence_provenance_stub.sql` | SHA-256 helper; reusable for `image_content_hash` computation |
| `_append_evidence_provenance_event` | `supabase/evidence_provenance_stub.sql` | Provenance anchor pattern from E-033/E-084; reusable for `photo.received` event |
| E-077 evidence lock pattern | `supabase/phase2_repair_e066b_e077_e074.sql` | Trigger pattern for locking uploads at stage completion — reusable for stage-level freeze |
| `assertFiles` validation util | `src/utils/validation.js` | MIME/size validation already used by both services |

---

## 11. False-attestation risks found

| Risk | Current state | Severity |
|---|---|---|
| 1. EXIF/client timestamp as authoritative capture time | Not present — no EXIF reading anywhere | Low (future risk only) |
| 2. Uploaded photo presented as system-captured photo | No current claim, but `kind='photo'` on work-order attachments makes no capture method distinction. The `MobileUploadZone` camera shortcut uses `capture="environment"` (device camera) but is not wired — when it is wired, the two capture methods will be indistinguishable in the data model | Medium — needs `capture_method` column before MobileUploadZone is wired |
| 3. Contractor completion photo not bound to completion stage | No stage field exists. Any contractor can upload at any time. A photo uploaded before arrival is indistinguishable from a completion photo | **High** — no binding, no control |
| 4. Tenant photo not bound to maintenance request/report stage | Request-level path is storage-only with no stage. `photo_prompt` info step says "photos can be added after submission" — explicitly post-hoc | **High** — post-hoc upload weakens received_at claim |
| 5. Same image reused across stages | No stage model → no uniqueness per stage; same file can be re-uploaded | Medium |
| 6. Photo not account/property/work-order scoped | Work-order path: scoped to account + work_order ✓. Request path: scoped to account + maintenance_request via path parsing ✓. But no property/tenant field on either attachment row — only inherited through work order or request FK | Low |
| 7. No image content hash | Confirmed absent from both paths | **High** — integrity not verifiable |
| 8. No scan/validation path | Confirmed absent from both buckets (scan exists only for `documents` bucket) | High |
| 9. Evidence pack shows photo without capture method or stage | `deposit_dispute_pack_items.item_type = 'maintenance_request'` or `'work_order'` can reference the whole request/order — the pack renderer has no way to surface which specific attachment was "completion evidence" vs "arrival context" | **High** — pack disclosure is currently blind to stage |
| 10. `attester_role` exists in DB but always null | Service accepts it, never passes it from the UI. E-034 open finding is precisely that `attester_role` is not surfaced in the pack print | **High** (pre-existing E-034 gap) |
| 11. Post-hoc request-level upload | Tenant can upload months after raising the request (until status='closed') and the upload timestamp will be presented as part of the request evidence | **High** — `received_at` semantics unclear |

---

## 12. Recommended first build slice

**Slice: Work-order-level contractor stage photos (`contractor_completion` stage first)**

Rationale:
- The `work_order_attachments` table already has `attester_role`, `kind`, `account_id`, `work_order_id`, DB row per attachment, and evidence lock at completion.
- The `ContractorAttachmentsPanel` is the existing upload surface.
- `attesterRole` is already a parameter in `uploadWorkOrderAttachments` — just never passed. Setting it to `'contractor'` at the contractor call site closes the E-034 attestation gap.
- `contractor_completion` is the highest-value stage for evidence — it's the stage that deposit disputes and compliance records cite.
- Adding `maintenance_stage` column to `work_order_attachments` + wiring it at the work-order status transition (UI forces stage selection on upload when work order is in completion status) is a contained DB + service + UI change.
- `image_content_hash` can be computed server-side on INSERT via a trigger that calls `provenance_content_hash()` on `{'storage_path': ..., 'file_size': ..., 'created_at': ...}`.
- A `photo.received` provenance event (entity_type='work_order', entity_id=work_order_id, occurred_at=created_at) can be anchored in the insert trigger.

**Defer**: Tenant request-level photos. That path requires creating a `maintenance_request_attachments` table (currently storage-only) and deciding whether the first-slice evidence claim is `received_at = server insert time` (honest for uploaded files) or something stronger. The post-hoc upload window on the request path also needs a design decision (restrict to same-day / same-session, or accept post-hoc with explicit disclaimer).

**Defer**: `MobileUploadZone` + `capture_method`. Wire the camera shortcut only after `maintenance_stage` and `capture_method` columns exist, so the two capture modes are distinguishable in the data model.

---

## 13. New findings to log before implementation

1. **`attester_role` is never set from the UI** — `ContractorAttachmentsPanel` does not pass `attesterRole`. E-034's finding ("attester_role not rendered in pack") has a silent prerequisite: the column is always null, so the pack cannot surface it even if the rendering was wired. E-150 first slice must fix the call site, not just the pack renderer.

2. **Two duplicate RLS policy sets on `work_order_attachments`** — `baseline_schema.sql` contains three overlapping policy sets (`wo_attach_*`, `wo_attachments_*`, `woa_*`). This should be resolved before adding a fourth policy. Recommend a cleanup pass that drops the two legacy sets and keeps `woa_*` only.

3. **Request-level path is storage-only — no DB table** — if E-150 first slice stays at work-order level, the request-level path can stay storage-only. If tenant request-creation photos are added later, a `maintenance_request_attachments` table is needed with the same shape as `work_order_attachments` plus a `maintenance_request_id` FK. This is a separate build.

4. **`maintenance_smart_diagnostics.sql` `photo_prompt` info step** — the current text is a post-submission redirect, not an in-flow upload prompt. If the first E-150 slice adds request-creation photos, this step should be replaced with an actual upload widget. If work-order-level is the first slice, this step can stay as-is.

5. **`MobileUploadZone` is dead scaffold** — built, not wired, not tested. Before wiring it to any maintenance surface, confirm it is covered by a test contract checking that `capture="environment"` is present and that `capture_method` is passed to the service. Otherwise the mobile camera path will silently omit stage/method metadata.

6. **No antivirus scan on either attachment bucket** — the quarantine-first scan path in `document_antivirus_scanning.sql` covers only the `documents` bucket. E-150 build should decide whether to extend scan to `work-order-attachments` and `maintenance-request-attachments`, or accept that maintenance photos are unscanned.

---

## Acceptance criteria check

| Criterion | Met? |
|---|---|
| Identifies whether E-150 starts from no implementation, generic attachments, or partial photo evidence | ✓ Scenario 4: existing weak generic path |
| Traces tenant and contractor maintenance surfaces | ✓ §3a–3e |
| Traces storage and DB support | ✓ §4–5 |
| Checks for existing provenance/event anchoring | ✓ §6 — none found |
| Checks for EXIF/client timestamp trust | ✓ §8 — none found |
| Checks for maintenance stage binding | ✓ §9 — none found |
| Does not implement any code | ✓ Read-only trace |
| Produces concrete first-slice recommendation | ✓ §12 — contractor_completion stage on work_order_attachments |
