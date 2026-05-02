# Compliance & Risk Suite — Known Limitations

Captured after Phase 0 → Phase 1b. Every future phase must review this list and mark items resolved or carry them forward.

**Legend:** `[SEC]` security · `[DATA]` data integrity · `[INFRA]` infrastructure · `[UX]` user experience · `[DEFER]` deliberately deferred feature

---

## Phase 0 — Foundation

### L-001 `[INFRA]` SQL function duplication across migration files
`account_feature_required_plan` and `account_plan_rank` are each defined in **three** files:
`account_entitlements.sql`, `ai_cost_controls.sql`, `compliance_suite_phase0.sql`.
`CREATE OR REPLACE FUNCTION` means the last file applied wins. There is no single source of truth.
**Fix:** Consolidate both functions into one canonical SQL file; remove duplicate definitions from the others.

### L-002 `[INFRA]` No Supabase migration versioning
SQL files are applied manually in ad-hoc order. There is no sequential migration numbering (001_, 002_, …) or a migration runner enforcing order. Applying files out of order will silently produce wrong function bodies.
**Fix:** Adopt Supabase migrations (`supabase/migrations/`) with timestamp-prefixed filenames so Supabase CLI enforces order.

### L-003 `[DATA]` No `updated_at` auto-trigger on new tables
`tax_records`, `rent_shield_assessments`, `lease_audits`, and `lease_audit_findings` have `updated_at` columns, but no `BEFORE UPDATE` trigger sets them automatically. Every UPDATE query manually sets `updated_at = NOW()`, which will drift if a future query forgets.
**Fix:** Add a shared `tg_set_updated_at()` trigger function and attach it to each new table, matching the pattern used on `compliance_items`.

### L-004 `[DEFER]` Lease Auditor: text extraction deferred
`leases.notes` is unstructured text. Documents are stored only as `storage_path` (Supabase storage bucket) with no OCR or text extraction column. `lease_audits` and `lease_audit_findings` tables exist but the AI edge function cannot be built until a text extraction layer is available.
**Fix (future):** Add a `document_text` column to `documents` populated by an async extraction job (e.g., PDF→text via a background edge function). Wire `generate-lease-audit` to read from that column via `lease_documents` join.

### L-005 `[DEFER]` Rent Shield: score computation deferred
`rent_shield_assessments` table exists. No computation logic or UI shipped in Phase 0.
**Resolved in:** Phase 2.

### L-006 `[DEFER]` Tax Records and Exports UI deferred
`tax_records` and `tax_exports` tables exist. No UI in Phase 0.
**Resolved in:** Phase 1b.

---

## Phase 1 — Tax Deadlines Dashboard

### L-007 `[SEC]` No server-side `assert_account_feature_access` on Tax Deadlines operations
All Tax Readiness reads and writes use direct Supabase client table queries. The only server-side protection is RLS (`user_can_manage_account`), which enforces account membership but **not** plan entitlement. A starter-plan user with a valid authenticated session could query `compliance_items WHERE category='tax'` directly.
**Fix:** Wrap `listTaxItems`, `createTaxItem`, `markTaxItemFiled`, and `deleteTaxItem` in Supabase RPCs that call `assert_manage_account_access(p_account_id)` AND `assert_account_feature_access(p_account_id, 'tax_readiness_dashboard')` as their first two statements.

### L-008 `[DATA]` `deadline_date` not rolled forward on recurrence
When `completeComplianceItem` handles a recurring item, it rolls `due_date` forward but leaves `deadline_date` unchanged. `deriveTaxStatus` reads `item.deadline_date || item.due_date` — after the first recurrence, `deadline_date` is stale and the status displayed is based on the original date.
**Fix:** Override `completeComplianceItem` for tax items to also roll `deadline_date` forward by `recurrence_interval_months`. Or rewrite `deriveTaxStatus` to prefer `due_date` when `filed_at` is null.

### L-009 `[DATA]` Jurisdiction not server-validated to `['GB','PL','DE']`
The frontend caps at 2 chars and uppercases, but any 2-char string is accepted. A user can save `jurisdiction = 'XX'` via the Supabase client directly.
**Fix:** Add a `CHECK (jurisdiction IN ('GB','PL','DE'))` constraint to the `jurisdiction` column on `compliance_items`, or enforce it in a future RPC wrapper.

### L-010 `[DATA]` No audit trail for Mark as Filed
There is no record of which user marked a deadline as filed, or a log of status changes over time. Only the final `filed_at` timestamp is stored.
**Fix:** Insert a row into `document_audit_log` (or a new `compliance_audit_log` table) when `filed_at` is set, recording `performed_by = auth.uid()`, `action = 'mark_filed'`, and the `filing_reference`.

---

## Phase 1b — Tax Records & Exports

### L-011 `[SEC]` No server-side `assert_account_feature_access` on Tax Records / Exports
Same issue as L-007. `tax_records` and `tax_exports` use direct table queries protected only by RLS. A starter-plan user can read and write tax records directly.
**Fix:** Create RPCs `create_tax_record`, `update_tax_record_review_status`, `delete_tax_record`, `generate_tax_export` that call both assert functions before acting.

### L-012 `[DATA]` Currency mixing in `summariseTaxRecords`
`totalIncome` and `totalExpenses` sum all amounts regardless of currency (GBP + PLN + EUR added together). For accounts with mixed-currency records this figure is numerically meaningless.
**Fix:** Group by `currency` and return `{ GBP: { income, expenses }, PLN: { … }, EUR: { … } }`. Update `TaxRecordsTab` summary cards to show per-currency totals or a warning when multiple currencies are present.

### L-013 `[DATA]` Export does not filter by period
`TaxExportsTab` calls `listTaxRecords` with only `countryCode`. Records are **not** filtered by the `periodLabel` the user selects. A "2024" export silently includes 2023 records.
**Fix:** Add a `recordDateFrom` / `recordDateTo` range param to `listTaxRecords`, and derive the range from `periodLabel` (e.g., `"2024"` → `2024-01-01 to 2024-12-31`, `"2024-Q3"` → `2024-07-01 to 2024-09-30`).

### L-014 `[DATA]` `excluded` records appear in CSV export
`generateTaxRecordsCsv` includes all records for the jurisdiction regardless of `review_status`. Records explicitly marked `excluded` appear in the file sent to the accountant. This is disclosed in the form disclaimer but can cause confusion.
**Fix:** Add a `skipExcluded` option (default `true`) to `generateTaxRecordsCsv`, and filter out `review_status = 'excluded'` records before building the CSV rows.

### L-015 `[DATA]` Race condition in export audit logging
`downloadCsvBlob` is called before `recordTaxExport`. If the download fires but `recordTaxExport` then fails (network error), the file exists on the user's disk but no audit row was recorded. Conversely, if `downloadCsvBlob` throws, nothing is recorded.
**Fix:** Record the export row first with `status = 'pending'`, trigger the download, then patch the row to `status = 'complete'`. This ensures audit coverage even if the download fails.

### L-016 `[UX]` `listTaxExports` hard-capped at 50 rows, no pagination
Accounts with frequent exports will silently miss older history.
**Fix:** Add `limit` / `offset` params to `listTaxExports` and add a "Load more" control in `TaxExportsTab`.

### L-017 `[UX]` No pagination in `TaxRecordsTab`
All records fetched in one query. Accounts with large record sets will experience slow initial load.
**Fix:** Add server-side pagination (limit/offset) to `listTaxRecords` and a paginator in `TaxRecordsTab`.

### L-018 `[UX]` Document linkage UI missing in Records tab
`document_id` FK exists on `tax_records` and is stored, but there is no upload or link flow in the Records tab. The column is effectively write-only from the UI.
**Fix:** Add a "Link document" action to each record row that opens the existing 3-step document upload flow (reusing the `compliance_document_links` pattern).

### L-019 `[UX]` `reviewStatus` filter not exposed in `TaxRecordsTab` UI
`useTaxRecords` accepts a `reviewStatus` filter parameter, but the tab only shows country and type dropdowns. Users cannot filter for "Needs Review" records from the UI.
**Fix:** Add a third filter dropdown (`All statuses / Unreviewed / Reviewed / Excluded`) to `TaxRecordsTab`.

---

## Cross-cutting (all phases)

### L-020 `[INFRA]` No `updated_at` trigger enforcement pattern for Compliance tables
The compliance suite introduced five new tables without auto-triggers (see L-003). The existing app tables (`compliance_items`, `properties`, `payments`, etc.) also lack consistent trigger coverage. Manual `updated_at = NOW()` in every query is fragile.
**Fix:** Add `tg_set_updated_at` to the shared baseline SQL and attach it to all new tables going forward.

### L-021 `[SEC]` Frontend entitlement gates are not the security boundary
`EntitledRoute` and `hasEntitlement()` are UX conveniences. They hide gated routes in the nav and show `FeatureAccessCard` on direct navigation, but do **not** prevent API-level access. The true security boundary is server-side: RLS + `assert_account_feature_access` in RPCs. Phases 1 and 1b deployed without RPC wrappers. Until L-007 and L-011 are fixed, plan enforcement for Tax Readiness features is frontend-only.

---

---

## Phase 2 — Rent Shield Calculator

### L-022 `[SEC]` No server-side `assert_account_feature_access` on Rent Shield operations
Payments are fetched via direct Supabase client query; `rent_shield_assessments` reads/writes are direct table access protected by RLS only. A growth-plan user could not be blocked server-side from computing assessments if they called the Supabase table directly.
**Fix:** Wrap `computeAndSaveAssessment`, `listRentShieldAssessments`, and `getLatestAssessmentByProperty` in RPCs calling `assert_manage_account_access` + `assert_account_feature_access(p_account_id, 'rent_shield')`.

### L-023 `[DATA]` Score computed from all historical payments, ignoring selected period
`computeAndSaveAssessment` calls `fetchPropertyPayments` with `monthsBack=12` regardless of the `period` parameter passed to it. The saved assessment row has the correct `period` label as metadata, but the score always reflects the last 12 months of activity, not the selected calendar month.
**Fix:** Derive `dateFrom` / `dateTo` from the `period` key (YYYY-MM) and pass them as filters to `fetchPropertyPayments`. For the current month, use month-to-date.

### L-024 `[DEFER]` AI narrative deferred — `ai_narrative` always null in Phase 2
The `ai_narrative` column exists on `rent_shield_assessments`. The edge function `generate-rent-shield-explainer` is not built yet. Phase 2 shows a placeholder message.
**Fix (Phase 3):** Build `generate-rent-shield-explainer` edge function. It must receive only pre-computed metrics (not raw payment rows) to avoid PII leakage to the LLM. The score and tier from the deterministic computation are immutable inputs; the AI only writes `ai_narrative`.

### L-025 `[DATA]` P90 percentile statistically unreliable with few payments
`percentile90` sorts the overdue day values and takes the value at the 90th percentile index. With fewer than ~5 overdue payments, this is not statistically meaningful and will equal the maximum value. For properties with a single overdue payment, P90 = that one value, which may over-penalise the score.
**Fix:** Add a `sample_size` output to `computeShieldMetrics` and display it in the UI as a data confidence indicator. Optionally apply a Bayesian smoothing adjustment when `sample_size < 5`.

### L-026 `[UX]` No per-property "Recalculate all" in portfolio view
The portfolio overview shows latest assessments but offers no way to batch-recalculate all properties. Users must select each property individually and click Recalculate.
**Fix:** Add a "Recalculate all" button in the portfolio view that iterates over all properties and calls `computeAndSaveAssessment` sequentially (with progress indicator).

### L-027 `[DATA]` `getLatestAssessmentByProperty` fetches all rows then deduplicates client-side
The function fetches all assessment rows ordered by `generated_at` and deduplicates in JS. For accounts with many properties and long history, this over-fetches.
**Fix:** Use a `DISTINCT ON (property_id) ORDER BY property_id, generated_at DESC` SQL query via an RPC, or a Supabase `limit=1` subquery per property.

---

## Phase 3 — Lease Auditor (Foundation)

### L-028 `[DEFER]` No AI extraction — findings entered manually only
`generate-lease-audit` edge function is not built. All findings in Phase 3 are entered manually by the user's team. The `lease_audits.status` field can be set to `complete` but no automated clause scanning happens.
**Fix (Phase 3b):** Build `generate-lease-audit` edge function. Requires either `leases.notes` (unstructured) or OCR text from the `documents` table (via a `document_text` column — see L-004). The function must strip PII before the Claude call and write findings to `lease_audit_findings`, not `ai_insights`.

### L-029 `[SEC]` No server-side `assert_account_feature_access` on Lease Audit operations
`lease_audits` and `lease_audit_findings` use direct table queries protected by RLS only. Same pattern as L-007 / L-011 / L-022.
**Fix:** Wrap `createLeaseAudit`, `createLeaseAuditFinding`, and `dismissLeaseAuditFinding` in RPCs calling both assert functions.

### L-030 `[DATA]` `auditStatusByLease` loaded via a separate unscoped batch query
The lease list view fetches all `lease_audits` for the account ordered by `created_at DESC` and deduplicates by `lease_id` in JavaScript. For accounts with many leases and audit history, this over-fetches.
**Fix:** Use a SQL `DISTINCT ON (lease_id)` subquery or a dedicated RPC that returns only the latest audit per lease in a single round-trip.

### L-031 `[DATA]` `PGRST116` error handling in `getLatestLeaseAudit` is silent
When no audit exists, Supabase returns `PGRST116` (no rows). The service returns `null` silently. If the table is absent or the query fails for another reason, null is also returned, masking real errors.
**Fix:** Distinguish `PGRST116` (genuine empty) from other errors by checking `error.code` explicitly, and re-throw non-empty errors.

### L-032 `[UX]` No pagination on lease list or findings list
`listLeases` is called with `limit: 100`. For accounts with many leases, the first 100 are shown and the rest are silently dropped. Findings are also unbounded.
**Fix:** Add server-side pagination (limit/offset) with a "Load more" control in both lists.

### L-033 `[UX]` `overall_risk` on `lease_audits` is not auto-computed from findings
`lease_audits.overall_risk` is never written by the Phase 3 code. It stays `null` even after findings are added, because no logic computes the highest finding risk and writes it back.
**Fix:** After each `createLeaseAuditFinding` or `dismissLeaseAuditFinding`, re-query the audit's active findings, compute the highest `risk_level`, and patch `lease_audits.overall_risk` with the result.

---

## Phase 4 — Polish & Billing Integration

### L-034 `[UX]` Feature comparison matrix is client-side only — no subscription awareness
`BillingPage` renders the compliance feature matrix using hardcoded `PLAN_RANKS` and `COMPLIANCE_FEATURES` arrays. It does not highlight the current plan tier or visually distinguish the account's active features from locked ones.
**Fix:** Read `currentPlan` from the subscription and add a highlight column class for the matching plan. Also add a "current plan" indicator badge above the matching column header.

### L-035 `[UX]` Compliance sidebar hidden for Starter accounts — no discoverability path
After Phase 4, the Compliance nav section is gated on `TAX_READINESS_DASHBOARD` entitlement (growth+). Starter accounts cannot see it at all. They have no discovery path into the compliance suite.
**Fix:** Show the Compliance section in the sidebar for Starter accounts, but render items with a lock badge instead of hiding them entirely. When clicked, they navigate to the route where `EntitledRoute` / `FeatureAccessCard` shows the upgrade prompt.

### L-036 `[SEC]` Security hardening deferred to Phase 5
L-007, L-011, L-022, L-029 (missing `assert_account_feature_access` on all compliance write operations) remain open. Phase 4 adds no new RPCs.
**Fix (Phase 5):** Create `supabase/compliance_security_hardening.sql` with RPC wrappers for each gated write operation. Update service files to call RPCs instead of direct table queries.

---

## Phase 5 — Security Hardening

All five outstanding server-side entitlement gaps resolved by `supabase/compliance_security_hardening.sql`. Each write operation now routes through a `SECURITY DEFINER` RPC that calls `assert_manage_account_access` and `assert_account_feature_access` before acting. Service files updated to call `.rpc(...)` instead of `.from(table).insert/update/delete`.

No new open limitations introduced in Phase 5.

---

## Phase 6 — Limitations Register Resolution

Resolved 17 open items from the register in severity order.

**Data integrity fixes:**
- L-008: `deriveTaxStatus` now prefers `due_date` (rolled forward on recurrence) over stale `deadline_date`
- L-015: `recordTaxExport` called before `downloadCsvBlob` — audit row always exists even if download fails
- L-014: `generateTaxRecordsCsv` skips `excluded` records by default (`skipExcluded=true`)
- L-033: `recomputeOverallRisk` helper updates `lease_audits.overall_risk` after every `createLeaseAuditFinding`, `dismissLeaseAuditFinding`, `restoreLeaseAuditFinding`
- L-013: `listTaxRecords` accepts `recordDateFrom`/`recordDateTo`; `periodLabelToDateRange` helper parses YYYY / YYYY-QN / YYYY-MM; `TaxExportsTab` passes period range to query
- L-012: `summariseTaxRecords` groups by currency; `TaxRecordsTab` shows per-currency breakdown with mixed-currency warning when multiple currencies present
- L-031: `getLatestLeaseAudit` now separates PGRST116 (no rows → null) from `isMissingBackendObject` (table absent → null) from real errors (rethrown)

**Rent Shield accuracy:**
- L-023: `fetchPropertyPayments` accepts `dateFrom`/`dateTo`; `computeAndSaveAssessment` derives date range from `period` key via `periodKeyToDateRange`
- L-025: `computeShieldMetrics` returns `sampleSize` (count of overdue payments used for P90); `computeAndSaveAssessment` attaches it to returned object; `RentShieldPage` shows low-confidence badge when `sampleSize < 5`

**Performance:**
- L-027: `getLatestAssessmentByProperty` now calls `get_latest_assessments_by_property` RPC using `DISTINCT ON (property_id)` instead of fetching all rows and deduplicating in JS
- L-030: `listLatestAuditsByLease` calls `get_latest_audits_by_lease` RPC using `DISTINCT ON (lease_id)`; `LeaseAuditorPage` batch query updated

**UX:**
- L-019: `TaxRecordsTab` has a third filter dropdown for `reviewStatus` (Unreviewed / Reviewed / Excluded)
- L-034: `BillingPage` compliance feature matrix highlights the account's current plan column using `activePlan` from `AccountContext`
- L-035: Compliance sidebar section now visible to ALL `canManage` users; un-entitled items show `LockedItem` with lock badge instead of being hidden
- L-016: `listTaxExports` supports `limit`/`offset`; `TaxExportsTab` has "Load more" button
- L-017: `listTaxRecords` supports `limit`/`offset`; `useTaxRecords` hook exposes `hasMore`/`loadMore`; `TaxRecordsTab` has "Load more" button
- L-032: `listLeases` supports `offset`; `LeaseAuditorPage` loads leases in pages of 50 with "Load more" button

---

## Resolved

| ID | Resolution |
|----|-----------|
| L-005 | Phase 2 — Rent Shield computation implemented |
| L-006 | Phase 1b — Tax Records & Exports UI delivered |
| L-007 | Phase 5 — `create_tax_item`, `mark_tax_item_filed`, `delete_tax_item` RPCs enforce `tax_readiness_dashboard` entitlement |
| L-008 | Phase 6 — `deriveTaxStatus` prefers `due_date` over stale `deadline_date` |
| L-011 | Phase 5 — `create_tax_record`, `update_tax_record_review_status`, `delete_tax_record`, `record_tax_export` RPCs enforce `tax_readiness_dashboard` entitlement |
| L-012 | Phase 6 — `summariseTaxRecords` groups by currency; UI shows per-currency breakdown |
| L-013 | Phase 6 — `listTaxRecords` date-range filter; `periodLabelToDateRange` helper; `TaxExportsTab` passes period range |
| L-014 | Phase 6 — `generateTaxRecordsCsv` skips excluded records by default |
| L-015 | Phase 6 — export audit row recorded before download; trail always present |
| L-016 | Phase 6 — `listTaxExports` paginated; "Load more" in `TaxExportsTab` |
| L-017 | Phase 6 — `listTaxRecords` paginated; "Load more" in `TaxRecordsTab` |
| L-019 | Phase 6 — `reviewStatus` filter dropdown added to `TaxRecordsTab` |
| L-022 | Phase 5 — `upsert_rent_shield_assessment` RPC enforces `rent_shield` entitlement |
| L-023 | Phase 6 — `computeAndSaveAssessment` scopes payments to selected period |
| L-025 | Phase 6 — `sampleSize` returned from `computeShieldMetrics`; low-confidence badge in `RentShieldPage` |
| L-027 | Phase 6 — `get_latest_assessments_by_property` DISTINCT ON RPC; no more JS dedup |
| L-029 | Phase 5 — `create_lease_audit`, `update_lease_audit_status`, `create_lease_audit_finding`, `dismiss_lease_audit_finding`, `restore_lease_audit_finding`, `delete_lease_audit_finding` RPCs enforce `ai_lease_auditor` entitlement |
| L-030 | Phase 6 — `get_latest_audits_by_lease` DISTINCT ON RPC; no more JS dedup |
| L-031 | Phase 6 — `getLatestLeaseAudit` separates PGRST116/missing-table/real errors |
| L-032 | Phase 6 — `listLeases` paginated; "Load more" in `LeaseAuditorPage` |
| L-033 | Phase 6 — `recomputeOverallRisk` patches `lease_audits.overall_risk` after each finding write |
| L-034 | Phase 6 — compliance feature matrix highlights current plan tier |
| L-035 | Phase 6 — compliance nav visible for Starter with `LockedItem` lock badges |
| L-036 | Phase 5 — Security hardening delivered via `supabase/compliance_security_hardening.sql` |

---

## Phase 7 — Remaining Open Items Resolution

Resolved all remaining open items except those formally deferred below.

**Resolved in Phase 7:**
- L-001: `account_feature_required_plan` consolidated into `account_entitlements.sql` (single source of truth). Duplicate definitions removed from `ai_cost_controls.sql` and `compliance_suite_phase0.sql` with comments pointing to the canonical file.
- L-003/L-020: `tg_set_updated_at()` trigger attached to `tax_records`, `rent_shield_assessments`, `lease_audits`, `lease_audit_findings` via `supabase/compliance_hardening_phase7.sql`.
- L-009: `compliance_items.jurisdiction` CHECK constraint `IN ('GB','PL','DE')` added. Server-side enforcement now matches frontend validation.
- L-010: `compliance_audit_log` table created; `mark_tax_item_filed` RPC inserts an audit row (with `performed_by = auth.uid()`) before updating the item. Audit trail is now append-only and RLS-protected.
- L-021: Read RPCs (`list_tax_items`, `list_tax_records`, `list_tax_exports`, `list_rent_shield_assessments`, `list_lease_audits`, `get_latest_lease_audit`, `list_lease_audit_findings`) enforce `assert_account_feature_access` before returning data. All compliance reads now have server-side plan enforcement. JS services updated to call RPCs.
- L-026: "Recalculate all" button added to `RentShieldPage` portfolio view. Iterates over all properties sequentially with a progress counter. Best-effort: individual failures don't abort the batch.

**Formally deferred (see notes below):**
- L-002 `[INFRA]` Migration versioning — requires architectural change to adopt Supabase timestamped migrations. Deferred until the team adopts the Supabase CLI migration workflow.
- L-018 `[UX]` Document linkage UI — requires integration with the existing document upload/link flow. Deferred; the `document_id` FK exists on `tax_records` and can be linked manually via Supabase Studio.
- L-024 `[DEFER]` AI Rent Shield explainer — requires building `generate-rent-shield-explainer` Supabase edge function. Deferred to a future sprint.
- L-028 `[DEFER]` AI lease extraction — requires `document_text` column on `documents` (L-004 infrastructure). Deferred until text extraction layer is available.

---

| L-001 | Phase 7 — `account_feature_required_plan` consolidated into `account_entitlements.sql`; duplicates removed from `ai_cost_controls.sql` and `compliance_suite_phase0.sql` |
| L-003 | Phase 7 — `tg_set_updated_at()` trigger attached to all four Phase-0 compliance tables via `compliance_hardening_phase7.sql` |
| L-009 | Phase 7 — `compliance_items.jurisdiction CHECK IN ('GB','PL','DE')` constraint added |
| L-010 | Phase 7 — `compliance_audit_log` table; `mark_tax_item_filed` RPC logs each filing event with `performed_by = auth.uid()` |
| L-020 | Phase 7 — same as L-003 (cross-cutting `updated_at` trigger coverage) |
| L-021 | Phase 7 — seven read RPCs (`list_tax_items`, `list_tax_records`, `list_tax_exports`, `list_rent_shield_assessments`, `list_lease_audits`, `get_latest_lease_audit`, `list_lease_audit_findings`) enforce plan entitlement; all JS services updated |
| L-026 | Phase 7 — "Recalculate all" button in `RentShieldPage` portfolio view with sequential iteration and progress counter |
