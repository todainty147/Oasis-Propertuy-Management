# Renters' Rights Readiness Pack

## Legal Disclaimer

**OASIS does not provide legal advice.**

OASIS Renters' Rights tools help landlords and property managers organise records, track tasks, and prepare evidence for review. They do not provide legal advice and do not determine whether any tenancy, notice, rent increase, pet decision, possession action, or landlord action is legally valid. Please seek advice from a qualified professional where needed.

---

## Purpose

The Renters' Rights Readiness Pack helps landlords and property managers in England organise operational tasks, evidence, and records related to the Renters' Rights Act 2025.

The reforms affect private rented tenancies in England from 1 May 2026.

### What this module does

- Tracks whether the official GOV.UK Information Sheet has been provided to each relevant tenant
- Provides a per-tenant status tracker with delivery method and date recording
- Auto-creates tasks for all active tenants via "Sync tenants"
- Surfaces overdue and due items in the Attention Center feed
- Logs all actions to the security audit ledger

### What this module does NOT do

- It does not provide legal advice
- It does not determine whether a tenancy or action is legally valid
- It does not generate legal notices
- It does not store the official GOV.UK PDF — it tracks evidence that it was provided
- It does not claim government certification or legal compliance certification
- All legal and regulated decisions remain with the landlord and their qualified adviser

---

## Phase 1 Scope (current)

- **Module 1 — Information Sheet Tracker**: Track per-tenant delivery of the GOV.UK Information Sheet
- **Feature gate**: `renters_rights_readiness` (Growth plan and above)
- **Route**: `/compliance/renters-rights`
- **Attention Center**: `renters_rights_information_sheet_due` and `renters_rights_information_sheet_overdue` items
- **Audit events**: `renters_rights_info_sheet_marked_sent`, `renters_rights_info_sheet_evidence_linked`, `renters_rights_info_sheet_status_changed`, `renters_rights_tasks_auto_created`
- **i18n**: English, Polish, German

## Future Phases (not yet built)

- **Phase 2**: Tenancy Agreement Review Prompts, Rent Review Guardrails, Attention Center full integration
- **Phase 3**: Pet Request Workflow with tenant-side submission and manager approval
- **Phase 4**: Possession Evidence Pack, Compliance Timeline, export
- **Phase 5**: AI review support (if existing AI infra is safe and appropriate)

---

## Data Model

### `renters_rights_tasks`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `account_id` | UUID | Account (landlord) — FK → accounts ON DELETE CASCADE |
| `property_id` | UUID | Linked property (nullable) |
| `tenant_id` | UUID | Linked tenant (nullable) |
| `lease_id` | UUID | Linked lease (nullable) |
| `requirement_type` | TEXT | e.g. `renters_rights_information_sheet` |
| `jurisdiction` | TEXT | `GB-ENG` (England only in Phase 1) |
| `due_date` | DATE | Default `2026-05-31` for information sheet |
| `status` | TEXT | `not_required` / `required` / `sent` / `evidence_uploaded` / `reviewed` / `overdue` |
| `sent_at` | TIMESTAMPTZ | When the sheet was sent |
| `sent_by` | UUID | User who marked as sent |
| `delivery_method` | TEXT | `email` / `sms` / `printed_hand_delivery` / `post` / `other` |
| `document_id` | UUID | Linked evidence document (nullable) |
| `notes` | TEXT | Free-form notes |
| `metadata` | JSONB | Extensible metadata |

**RLS**: Manager-only SELECT (owner / admin / staff). All writes via SECURITY DEFINER RPCs.

---

## RPCs

| Function | Description |
|---|---|
| `list_renters_rights_tasks(account_id, status, limit, offset)` | Paginated list with tenant/property names joined |
| `upsert_renters_rights_task(account_id, ...)` | Create task or return existing one |
| `create_rr_tasks_for_active_tenants(account_id, ...)` | Bulk-create tasks for all active non-applicant tenants |
| `mark_rr_task_sent(task_id, account_id, delivery_method, sent_at, notes)` | Mark as sent + audit log |
| `set_rr_task_not_required(task_id, account_id, notes)` | Mark as not required + audit log |
| `link_rr_task_document(task_id, account_id, document_id)` | Link evidence document + audit log |
| `list_rr_attention_items(account_id, limit)` | Returns attention-center-compatible rows for overdue/due tasks |

All RPCs call `assert_account_feature_access(account_id, 'renters_rights_readiness')` and `is_account_manager(account_id, auth.uid())`.

---

## Permissions and Feature Gate

**Feature key**: `renters_rights_readiness`
**Minimum plan**: `growth`
**Frontend**: `ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS` in `src/lib/entitlements.js`
**Route guard**: `<EntitledRoute feature={ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS}>`
**Backend enforcement**: `assert_account_feature_access()` in every RPC

Access by role:
- **owner / admin / staff**: full access (manager role check via `is_account_manager`)
- **tenant**: no access in Phase 1
- **contractor**: no access
- **root/support**: follows existing support model (service_role bypasses RLS)

---

## Attention Center Integration

Two item types are returned by `list_rr_attention_items()`:

| `item_type` | `bucket` | Trigger |
|---|---|---|
| `renters_rights_information_sheet_overdue` | `urgent` | Task is `required` and `due_date < today` |
| `renters_rights_information_sheet_due` | `action` | Task is `required` and `due_date <= today + 60 days` |

`link_path` points to `/compliance/renters-rights`.

The frontend can call `listRrAttentionItems()` separately and merge with the main attention feed.

---

## Audit Events

All events written to `security_audit_ledger` via `log_security_event()`:

| Action | Trigger |
|---|---|
| `renters_rights_info_sheet_marked_sent` | `mark_rr_task_sent()` |
| `renters_rights_info_sheet_evidence_linked` | `link_rr_task_document()` |
| `renters_rights_info_sheet_status_changed` | `set_rr_task_not_required()` |
| `renters_rights_tasks_auto_created` | `create_rr_tasks_for_active_tenants()` |

---

## SQL Overlays Applied

Applied in this order by `dbBootstrap.js` and `dbApplyRepoSql.js`:

1. `supabase/renters_rights_readiness.sql` — table, constraints, indexes, trigger, RLS, RPCs
2. `supabase/renters_rights_entitlement.sql` — adds `renters_rights_readiness → growth` to `account_feature_required_plan()`

---

## Frontend Files

| File | Purpose |
|---|---|
| `src/pages/compliance/RentersRightsPage.jsx` | Main page with tabs and Information Sheet tracker |
| `src/services/rentersRightsService.js` | Service layer — RPC calls and row parsing |
| `src/lib/entitlements.js` | `RENTERS_RIGHTS_READINESS` feature key added |
| `src/routes/ManagerRoutes.jsx` | Route `compliance/renters-rights` + lazy import added |
| `src/i18n/messages.js` | EN / PL / DE strings added |

---

## Tests

| File | Coverage |
|---|---|
| `tests/security/rentersRightsContracts.test.js` | parseRrTaskRow, input guards, entitlement contract, i18n key coverage (EN/PL/DE), legal safety contract, attention item_type contract |

Future test files (Phase 2):
- `tests/integration/rentersRightsBackendSecurity.test.js` — RLS isolation, account cross-access, feature gate enforcement against live DB

---

## Known Limitations (by design)

1. **No legal validation** — status of "sent" means the manager recorded that they sent it. OASIS does not verify that the correct PDF was used or that delivery was legally effective.
2. **England only** — jurisdiction is hardcoded to `GB-ENG`. Polish and German i18n strings are app localisation only, not PL/DE legal applicability.
3. **No tenant access in Phase 1** — tenants cannot view or interact with their information sheet status in Phase 1.
4. **No export in Phase 1** — evidence pack export is deferred to Phase 4.
5. **Attention Center integration is a companion function** — `list_rr_attention_items()` is called separately; it is not yet merged into the main `attention_center_items()` SQL function.

---

## Next Recommended Pass (Phase 2)

**Small, reviewable next step:**

Add Tenancy Agreement Review Prompts (Module 2):
- Deterministic checks on structured lease fields (fixed end date, pet clause, missing notice period, renewal_status unclear)
- Store review findings in `renters_rights_tasks` with `requirement_type = 'tenancy_review_prompt'`
- Add "Tenancy Review" tab to `RentersRightsPage.jsx`
- Add Attention Center item: `renters_rights_lease_review_needed`
- Add integration test: manager can see prompts, tenant cannot
