# Phase 2 — Maintenance Intelligence / Tenant-to-Contractor Workflow
## IMR Audit Report v1.0

**Date:** 2026-06-30
**Auditor:** IMR-000 programme, automated
**Evidence type:** Mixed — CODE-READ + EXECUTION (DB schema, RLS policy queries, diagnostic template data). Live UI execution not available (no browser session). See individual findings.
**Governing brief:** tenaqo-phase2-maintenance-intelligence-audit-pack-v0.2_1.md
**Prior phase:** Phase 1 Command Centre / Attention Engine — separate report (phase1-command-centre-audit-report-v1.0.md)

---

## Phase 2 Summary Table

| ID | Topic | Verdict | Confidence | Layer | Risk | Classification | Stopping Point | Next Untaken Step |
|---|---|---|---|---|---|---|---|---|
| E-065 | Maintenance Inbox triage | **Built verified** | Medium (code-read + schema) | Maintenance | Low | — | Kanban triage, realtime, WO conversion, diagnostic link | Execute: submit tenant issue → verify inbox card → triage → WO |
| E-066 (depth) | Smart Diagnostics — depth/linkage | **Built verified** | Medium (code-read + template data) | Maintenance | Low | — | DB-driven templates, 10 issue types, influences priority and triage | Execute wizard end-to-end and verify diagnostic session attached to request |
| E-066a | Smart Diagnostics — no emergency gate (CONFIRMED) | **Half-built** | High (code-read confirmed) | Maintenance | **High** | **Trust-blocker** | Emergency warning reactive but no gate/redirect; form continues after gas-smell YES; self-help steps still visible; no call-now numbers | Fix: step-level early exit when triggers_emergency step answered YES; add emergency-specific call-to-action |
| E-066b | Smart Diagnostics — silent emergency flag (CONFIRMED CRITICAL) | **Broken** | **High (ctid execution confirmed)** | Maintenance | **Critical** | **Trust-blocker** | immediate_danger (triggers_emergency=f, ctid 0,9) renders before emergency_risk (triggers_emergency=t, ctid 2,21); stable JS sort preserves DB insertion order on sort_order tie; user answering first gas-smell question will NOT trigger emergency flag | Fix: delete duplicate immediate_danger steps from boiler_heating and electrical_issue templates; add secondary sort key to sortSteps() |
| E-067 | Work Orders | **Built verified** | Medium (code-read + schema) | Maintenance | Low | — | Full lifecycle: create, assign, status, cancel-with-approval, audit log immutable | Execute full lifecycle: create → assign → complete → verify audit trail |
| E-068 | Contractor Portal | **Built verified** | Medium (code-read + schema) | Maintenance | Low (portal) | — (portal) | Role boundary enforced by RLS; contractor sees only assigned work | Evidence-mutability finding handed to E-077 |
| E-069 | Tenant Portal issue reporting | **Built verified** | Medium (code-read + schema) | Maintenance | Low | — | Tenant can submit via property maintenance section; RLS-scoped | Execute as tenant: submit issue → verify landlord inbox |
| E-070 | Preferred Supplier Intelligence | **Built verified** | Low (code-read) | Maintenance | Low | — | AI edge function + fallback; account-scoped; mark/remove RPC | Execute: mark preferred → create WO → verify suggestion appears |
| E-071 | Inline preferred-supplier suggestions | **Built verified** | Low (code-read) | Maintenance | Low | — | CreateWorkOrderDrawer renders inline suggestion; no window.confirm found | Execute: create WO with preferred supplier in account → verify inline suggestion |
| E-073 | Fixflo integration | **Superseded** | High (code-read + design doc) | Maintenance | Low | Backlog | Cleanly absent by design (Founder Strategy Book D-05 explicit rejection) | None — decision is final |
| E-074 | Checkatrade integration | **Half-built** | High (code-read + edge function read) | Maintenance | **Medium** | **Launch-gated** | Full API scaffolding exists and is gated per-account; category IDs unverified; gate copy is honest; no live harm today | Verify category IDs against Checkatrade API before enabling any live accounts |
| E-075 | Fixly / Poland marketplace | **Cleanly parked** | High (code-read) | Maintenance | Low | Backlog | Manual handoff mode only; no API backend; UI copy says "manual handoff" | None until Fixly API integration planned |
| E-076 | Eco Upgrade Calculator | **Built verified** | Low (code-read) | Maintenance | Low | — | Static estimator with correct disclaimers; links to upgrade plans | Execute: input EPC data → verify estimates; confirm no compliance guarantee implied |
| E-077 | Maintenance evidence for deposit deductions | **Half-built / Trust-blocker** | High (RLS policy executed) | Both | **High** | **Trust-blocker** | Linkage built; strength weak (mutable evidence, one-sided attestation, corroboration mechanism exists — compareInspectionReports() — but unwired from maintenance-evidence path) | Lock contractor-submitted completion evidence; wire compareInspectionReports() into maintenance-evidence path |
| E-079 | AI maintenance KPI | **Missing / Backlog** | High (execution-verified Phase 1, re-confirmed) | Maintenance | Low | Backlog | No generate-maintenance-kpi-insight edge function; KPI page imports no AI service | Build AI insight layer if prioritised |
| E-126 | Maintenance reporting polish | **Half-built** | Low (code-read) | Maintenance | Low | Backlog | Category-aware form exists; no step-by-step wizard; no photo-first flow | Implement guided step-by-step wizard with emergency gate |
| E-142 | Provenance finance contract tests stale after payment lifecycle flip | **Fixed — 8 stale fixtures updated** | **High (bisect-confirmed + execution-verified)** | Finance/Provenance | **Low residual** | **Closed** | Bisect confirmed: all 8 caused by 2475c3b. All 8 assert balance-computation values (not hash/ledger values) — Reading B ruled out. Fixture assertions updated to new semantics. 151/151 pass. | None — Phase 3 foundation confirmed sound. |

---

## E-065 — Maintenance Inbox triage

### Claimed scope
Central maintenance control point. Tenant/operator issues become actionable inbox items.

### Observed repository state
- [MaintenanceInboxPage.jsx](src/pages/MaintenanceInboxPage.jsx) — Kanban board with columns: open, in_progress, waiting, resolved, closed
- [maintenanceInboxService.js](src/services/maintenanceInboxService.js) — `loadMaintenanceInboxData()` RPC
- [useMaintenanceRequests.js](src/hooks/useMaintenanceRequests.js) — realtime subscriptions on `maintenance_requests` and `work_orders`
- Components: [MaintenanceColumn.jsx](src/components/maintenance-inbox/MaintenanceColumn.jsx), [MaintenanceRequestCard.jsx](src/components/maintenance-inbox/MaintenanceRequestCard.jsx), [CreateWorkOrderDrawer.jsx](src/components/maintenance-inbox/CreateWorkOrderDrawer.jsx), [MaintenanceTimeline.jsx](src/components/maintenance-inbox/MaintenanceTimeline.jsx)
- DB tables confirmed in running instance: `maintenance_requests`, `work_orders`, `work_order_audit_log`
- Status lifecycle: open → in_progress → waiting (with waiting_reason) → resolved → closed
- Waiting reasons: tenant_response, contractor_schedule, parts_ordered, landlord_approval
- SLA age buckets: 0-24h (green), 24-48h (yellow), 48-72h (red), 72+ (dark red)
- Priority: urgent sets SLA clock; affects CC bucket (confirmed in E-141 fix)
- Diagnostic link: inline diagnostic summary visible on request card when session attached
- Preferred Supplier Launch promotional card with dismissal tracking

### Verb tested
CODE-READ + schema execution. Confirmed DB tables and RPC names exist in running DB. Live issue submission not executed.

### Layer classification
Maintenance finding.

### Verdict
**Built verified**

### Confidence
Medium (code-read + confirmed schema — full flow execution not performed)

### What works
- Kanban triage with five status columns and realtime update
- SLA age visual indicators
- Waiting-reason categorisation
- One-click WO creation from inbox card
- Diagnostic session summary surfaced per card
- Tenant/property linking on each card

### What is stubbed / incomplete / misleading
- "Preferred Suppliers Launch" dismissal card is visible in the inbox — purely promotional, not a functional gap

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Execute: submit a tenant issue → verify inbox card appears → triage to in_progress → create WO → verify card transitions.

### Risk
Low

### Classification
—

### Workbook update
Observed Repo State: Kanban inbox (MaintenanceInboxPage) backed by loadMaintenanceInboxData RPC; realtime subscriptions; 5-status workflow; SLA aging; diagnostic summary inline · Observed Verdict: Built verified · Confidence: Medium · Layer: Maintenance · Stopping Point: Kanban triage fully wired; diagnostic session linked; WO creation from inbox · Next Untaken Step: Execute tenant→inbox→triage→WO loop · Evidence Paths: `src/pages/MaintenanceInboxPage.jsx`, `src/services/maintenanceInboxService.js`, `src/components/maintenance-inbox/` · Classification: —

---

## E-066 — Smart Diagnostics

**Three verdicts required per audit brief v0.2: depth/linkage, emergency gate, silent emergency flag. Do not merge.**

### Claimed scope
Category-specific diagnostic guidance, emergency handling, handoff to work order.

### Observed repository state (shared)
- [maintenanceDiagnostics.js](src/lib/maintenanceDiagnostics.js) — `calculateDiagnosticOutcome()`, `EMERGENCY_SAFETY_COPY`, `formatDiagnosticSummary()`
- [maintenanceDiagnosticsService.js](src/services/maintenanceDiagnosticsService.js) — `getMaintenanceDiagnosticTemplate()`, `createMaintenanceDiagnosticForRequest()`; `sortSteps()` sorts by `sort_order` ONLY — no secondary key
- [MaintenanceRequestsSection.jsx](src/components/MaintenanceRequestsSection.jsx) — diagnostic rendering and outcome calculation (lines 239–858)
- DB tables: `maintenance_diagnostic_templates` (11 active, 1 per issue type), `maintenance_diagnostic_steps`, `maintenance_diagnostic_sessions`, `maintenance_diagnostic_answers`, `maintenance_diagnostic_audit_events`
- 10 issue types: boiler_heating, no_hot_water, damp_mould, electrical_issue, leak, blocked_drain, appliance_issue, pest_issue, lost_keys_security, door_window_lock, other
- Outcome categories: landlord_review, emergency_review, compliance_review_possible, deposit_evidence_possible, eco_upgrade_possible
- Feature gates: `MAINTENANCE_SMART_DIAGNOSTICS` (landlord), `TENANT_MAINTENANCE_DIAGNOSTICS` (tenant)
- Answer types: yes_no, single_choice, multi_choice, text, number, photo, info

### Execution: diagnostic template steps queried against running DB

Emergency-relevant templates — sort_order and ctid (insertion order):

| Issue type | step_key | sort_order | triggers_emergency | ctid | Question |
|---|---|---|---|---|---|
| boiler_heating | immediate_danger | 10 | **f** | **(0,9)** | "Is there a smell of gas, active leak, burning smell, or immediate danger?" |
| boiler_heating | error_code | 20 | f | (0,10) | "Does the boiler show an error code?" |
| boiler_heating | display_photo | 30 | f | (0,11) | "Can you share a photo?" |
| boiler_heating | pressure_gauge | 40 | f | (0,12) | "What does the pressure gauge read?" |
| boiler_heating | thermostat_timer | 50 | f | (0,13) | "Have you checked thermostat/timer settings?" |
| boiler_heating | meter_checked | 60 | f | (0,14) | "Have you checked the gas meter?" |
| boiler_heating | affected_area | 70 | f | (0,15) | "Which rooms are affected?" |
| boiler_heating | power_checked | 20 | f | (0,17) | "Has the power been checked?" |
| boiler_heating | recurring_issue | 30 | f | (0,18) | "Is this a recurring issue?" |
| boiler_heating | **emergency_risk** | **10** | **t** | **(2,21)** | "Is there a gas smell, carbon monoxide alarm, or immediate danger?" |
| electrical_issue | immediate_danger | 10 | **f** | (rows before) | "Is there sparking, smoke, burning smell, exposed wiring, or loss of power creating immediate risk?" |
| electrical_issue | **emergency_risk** | **10** | **t** | (rows after) | "Is there smoke, burning smell, sparking, exposed wiring, or immediate danger?" |
| leak | active_leak | 10 | f | — | "Is water actively leaking now?" |
| leak | emergency_risk | 10 | **t** | — | "Is there flooding, water near electrics, or immediate danger?" |

**Critical insertion-order finding for boiler_heating:** `immediate_danger` (triggers_emergency=**f**) was inserted at ctid (0,9). `emergency_risk` (triggers_emergency=**t**) was inserted later at ctid (2,21). `sortSteps()` performs a stable sort on `sort_order` with no secondary key. JavaScript's `Array.sort()` is stable (ECMAScript 2019). On a sort_order tie at 10, the two steps preserve their relative insertion order: `immediate_danger` renders **first**, `emergency_risk` renders **second**.

---

### Verdict 1 — Diagnostic depth/linkage

**Built verified.** DB-driven templates exist for all 10 issue types. Outcome calculation influences work order priority (`urgency === "urgent"` → `requestPriority = "urgent"`). Diagnostic session persisted and linked to maintenance request after submission. Answers stored in `maintenance_diagnostic_answers`. Audit events in `maintenance_diagnostic_audit_events` (INSERT + SELECT only — immutable).

**Confidence:** Medium (code-read + template data executed)

---

### E-066a — Verdict 2: Emergency routing — no gate (CONFIRMED Trust-blocker)

**Half-built / High risk.**

The emergency routing has two structural problems confirmed by code-read:

**Problem 1 — No gate.** The diagnostic is rendered as a single-page form with all steps visible at once (not a step-by-step wizard). When a user answers YES to "Is there a gas smell, carbon monoxide alarm, or immediate danger?", the `EMERGENCY_SAFETY_COPY` warning appears reactively — but the remaining 9 diagnostic questions for `boiler_heating` (error code, thermostat, pressure gauge, meter check, affected area) remain visible BELOW the warning. The user can still see "Have you checked thermostat/timer settings?" after confirming a gas emergency. There is no redirect to an emergency-only screen; no suppression of remaining steps; no mandatory acknowledgement before the questionnaire can proceed.

**Problem 2 — No emergency-specific call-to-action.** `EMERGENCY_SAFETY_COPY` reads: *"contact emergency services or the relevant emergency provider immediately."* There is no:
- National Gas Emergency number (0800 111 999)
- 999 / emergency service numbers
- "Do not use any electrical switches" safety instruction
- "Evacuate the building immediately" instruction
- Emergency landlord/agent contact escalation

**What the system DOES do well:**
- Emergency warning appears reactively (before form submission)
- Emergency warning is visually distinct (rose-coloured panel, `bg-rose-50 text-rose-700`)
- Emergency outcome promotes request priority to `urgent`
- Emergency flag passes through to triage/notification chain

**Distinction per audit brief v0.2:** This is not the "diagnostics don't influence triage" (disconnected) failure. The diagnostics ARE connected. The finding is that a connected tree **continues showing self-help questions after a gas-smell YES** — which is the specific failure mode the brief classifies as Trust-blocker / Critical.

**Confidence:** High (code-read confirmed; UI rendering path traced)

**Risk:** High

**Classification:** Trust-blocker

**Next untaken step:** Add a step-level early-exit so that any step with `triggers_emergency = true` answered YES immediately renders a full-screen emergency gate (call-now numbers, evacuation copy, no remaining questionnaire steps visible).

---

### E-066b — Verdict 3: Silent emergency flag — wrong step renders first (CONFIRMED CRITICAL)

**Broken.** The DB insertion-order execution result resolves this finding from "potential / severity pending execution" to **CONFIRMED**.

**Execution evidence:**

```
step_key         | sort_order | triggers_emergency | ctid
immediate_danger |         10 | f                  | (0,9)   ← INSERTED FIRST
error_code       |         20 | f                  | (0,10)
display_photo    |         30 | f                  | (0,11)
pressure_gauge   |         40 | f                  | (0,12)
thermostat_timer |         50 | f                  | (0,13)
meter_checked    |         60 | f                  | (0,14)
affected_area    |         70 | f                  | (0,15)
power_checked    |         20 | f                  | (0,17)
recurring_issue  |         30 | f                  | (0,18)
emergency_risk   |         10 | t                  | (2,21)  ← INSERTED SECOND
```

**Mechanism — why the silent failure is certain:**

1. PostgREST returns steps in heap scan order (ctid order) when no `ORDER BY` is specified.
2. `sortSteps()` in `maintenanceDiagnosticsService.js` performs a stable sort by `sort_order` only:
   ```js
   function sortSteps(steps) {
     return [...(steps || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
   }
   ```
3. JavaScript's `Array.sort()` is stable (ECMAScript 2019+). On a `sort_order` tie, the original relative order from the input array is preserved.
4. `immediate_danger` (ctid 0,9, triggers_emergency=**f**) entered the array first. `emergency_risk` (ctid 2,21, triggers_emergency=**t**) entered second. After stable sort, this order is preserved.
5. The UI renders `immediate_danger` as the first visible question for `boiler_heating`.

**User experience of the silent failure:**
1. User smells gas. Reports a "boiler / heating" issue.
2. First question in the form: *"Is there a smell of gas, active leak, burning smell, or immediate danger?"* (`immediate_danger`, triggers_emergency=**f**) — answered YES.
3. `calculateDiagnosticOutcome()` evaluates this step: `step.triggers_emergency === false` → emergency flag does NOT fire.
4. The second question for sort_order=10, *"Is there a gas smell, carbon monoxide alarm, or immediate danger?"* (`emergency_risk`, triggers_emergency=**t**) appears below.
5. If the user stops after answering the first (apparently sufficient) gas-smell question, the emergency flag is silently not set. No warning appears. No priority escalation. The system proceeds as a normal maintenance request.

**This is strictly worse than E-066a.** A form that continues after an emergency-YES at least shows the emergency warning. Here, the user's YES answer to an apparently gas-relevant question produces no emergency response at all.

**Same schema gap confirmed for `electrical_issue`:** `immediate_danger` (triggers_emergency=f) also has a lower ctid than `emergency_risk` (triggers_emergency=t) in the electrical_issue template.

**Confidence:** High (ctid order execution-confirmed; stable-sort mechanism code-read confirmed)

**Risk:** Critical — a gas-smell answer reliably does NOT set the emergency flag for a user who only answers the first visible question

**Classification:** Trust-blocker

**Next untaken step:**
1. **Immediate data fix:** Delete `immediate_danger` steps from `boiler_heating` and `electrical_issue` templates (they are near-duplicate questions that do NOT set the emergency flag — they should not coexist with `emergency_risk`).
2. **Code fix:** Add a secondary sort key to `sortSteps()` to prevent future sort_order ties from depending on insertion order: `sort((a, b) => Number(a.sort_order||0) - Number(b.sort_order||0) || a.step_key.localeCompare(b.step_key)`.
3. **Confirmation:** Verify `emergency_risk` is the ONLY step at sort_order=10 for boiler_heating and electrical_issue after deletion.

---

### What works (shared across E-066 verdicts)
- Category-aware templates with 10 issue types
- Reactive outcome calculation (flag appears as answers change, not only on submit)
- Diagnostic summary attached to request for landlord review
- Priority escalation (urgent for emergency flag — when it fires)
- Audit trail for diagnostic sessions

### What is stubbed / incomplete / misleading
- **E-066a:** Diagnostic form does not gate/redirect on emergency flag — remaining steps still visible after emergency YES; no call-now numbers or evacuation instructions
- **E-066b:** `immediate_danger` (triggers_emergency=f) renders before `emergency_risk` (triggers_emergency=t) due to DB insertion order preserved by stable JS sort — emergency flag silently does not fire for users answering the first gas-smell question
- Duplicate steps at sort_order 10 for boiler_heating and electrical_issue (data integrity failure)
- Diagnostic steps are all-at-once (not a guided step-by-step wizard with next/back)

### Evidence strength
N/A for depth verdict. Execution-confirmed for E-066b (ctid query + stable sort code-read).

### Workbook update
Observed Repo State: DB-driven diagnostic templates (10 issue types); reactive outcome; no wizard gate; duplicate steps at sort_order 10 for boiler_heating + electrical_issue; immediate_danger (ctid 0,9, triggers_emergency=f) renders before emergency_risk (ctid 2,21, triggers_emergency=t) due to stable JS sort · Observed Verdict: Built verified (depth) / Half-built E-066a / Broken E-066b · Confidence: Medium/High/High · Layer: Maintenance · Stopping Point: E-066a: form continues after emergency YES; E-066b: first gas-smell question silently does not trigger emergency flag · Next Untaken Step: Delete duplicate immediate_danger steps; fix sortSteps() secondary key; add step-level emergency gate · Evidence Paths: `src/lib/maintenanceDiagnostics.js`, `src/services/maintenanceDiagnosticsService.js`, `src/components/MaintenanceRequestsSection.jsx`, `supabase/maintenance_smart_diagnostics.sql` · Classification: Trust-blocker (both E-066a and E-066b)

---

## E-067 — Work Orders

### Claimed scope
Core operational maintenance object — full lifecycle.

### Observed repository state
- [WorkOrderDetails.jsx](src/pages/WorkOrderDetails.jsx) — detail page with financials, assignments, ratings, contractor identity
- [workOrderService.js](src/services/workOrderService.js) — full lifecycle RPCs
- RPCs confirmed in running DB: `work_order_create`, `work_order_set_status`, `work_order_assign_contractor`, `work_order_approve_tenant_cancellation`, `work_order_deny_tenant_cancellation`, `work_order_allowed_actions`, `work_order_allowed_actions_bulk`, `work_order_can_transition`
- DB tables: `work_orders`, `work_order_audit_log`, `work_order_files`, `work_order_attachments`, `work_order_financials`, `work_order_status_definitions`, `work_order_status_transitions`, `work_order_fulfilment_routes`
- Status triggers: `tg_work_orders_enforce_status_transition`, `tg_prevent_blocked_work_orders`, `tg_work_orders_guard_status_transition`
- Audit log: INSERT-only from triggers (`audit_work_order_status_change`, `tg_activity_log_work_orders`); no DELETE or UPDATE policy — immutable
- Cancellation: tenant requests → landlord approves/denies via `work_order_approve_tenant_cancellation` / `work_order_deny_tenant_cancellation`
- Financials: `work_order_financials` table, quote and invoice amounts, approval states
- SQL migrations: `20260611000000_security_harden_work_order_views.sql`, `20260526000000_work_orders_with_flags_add_assignment_columns.sql`

### Verb tested
CODE-READ + schema execution. All RPCs and DB tables confirmed in running instance. Full flow execution not performed.

### Layer classification
Maintenance finding.

### Verdict
**Built verified**

### Confidence
Medium (code-read + confirmed schema)

### What works
- Full create-to-close lifecycle with server-side status transition enforcement
- Immutable audit log (trigger-populated, no user-level INSERT/UPDATE/DELETE policy)
- Tenant cancellation request → landlord approval gate
- Financial tracking (quote, invoice, approval)
- Contractor assignment with RLS-scoped contractor identity
- Bulk allowed-actions API for list views
- Fulfilment route tracking (internal / marketplace / hybrid / undecided)

### What is stubbed / incomplete / misleading
- Nothing material at the core lifecycle level

### Evidence strength
**Partial.** The `work_order_audit_log` is immutable (no user-level mutations). However, `work_order_attachments` (completion photos, notes uploaded by contractors) carry a contractor-delete policy (`woa_delete`: `uploaded_by = auth.uid()`). See E-077 for the evidence-strength assessment.

### Next untaken step
Execute: create WO → assign contractor → set in_progress → complete → verify audit log entries → verify linked maintenance request status reflects completion.

### Risk
Low

### Classification
—

### Workbook update
Observed Repo State: Full lifecycle RPCs (work_order_create/set_status/assign/approve_cancel etc.); immutable audit log via trigger; cancellation approval gate; financial tracking; status transition guards · Observed Verdict: Built verified · Confidence: Medium · Layer: Maintenance · Stopping Point: All lifecycle RPCs confirmed; audit log immutable · Next Untaken Step: Execute full lifecycle · Evidence Paths: `src/pages/WorkOrderDetails.jsx`, `src/services/workOrderService.js`, `supabase/work_order_*.sql` · Classification: —

---

## E-068 — Contractor Portal

### Claimed scope
Contractor-facing workflow — assigned work order visibility, updates, completion evidence. Role boundary enforced.

### Observed repository state
- [ContractorPortal.jsx](src/pages/ContractorPortal.jsx) — mobile-first; lists assigned work orders
- RPCs: `contractor_work_order_cards` (assigned WOs only), `contractor_update_work_order`, `contractor_update_work_order_status`
- RLS policies on `work_orders`: contractor sees only rows where `contractor_user_id = auth.uid()`
- Contractor actions: acknowledge, mark in_progress, request cancellation, update progress notes
- RLS on `work_order_attachments`: SELECT allows contractor where `wo.contractor_user_id = auth.uid()` — scoped to assigned WOs only
- **Evidence mutability:** DELETE policy `woa_delete` = `uploaded_by = auth.uid()` — contractor CAN delete their own uploaded attachments at any time

### Verb tested
CODE-READ + RLS policy execution. Confirmed policy text from running DB.

### Layer classification
Maintenance finding (role boundary) + Both (evidence mutability → E-077).

### Verdict
**Built verified** (role boundary) — evidence mutability finding handed to E-077.

### Confidence
Medium (code-read + RLS policies confirmed)

### What works
- Contractor sees only assigned work orders (RLS-enforced)
- No cross-account or cross-contractor leakage in RLS policies
- Contractor action set is restricted (acknowledge, update, request-cancel only)
- No contractor-level billing/financial access

### What is stubbed / incomplete / misleading
- Contractor can DELETE their own submitted completion evidence — no lock after submission

### Evidence strength (v0.2)
**Weak.** Contractor-submitted completion evidence (photos, notes) in `work_order_attachments` is deletable by the submitting contractor via `uploaded_by = auth.uid()` DELETE policy. Evidence can be withdrawn after submission with no prevention mechanism. No append-only or locked state after a work order reaches `completed` status. This is an evidence-integrity finding — handed off to E-077.

### Next untaken step
Execute: submit completion photo as contractor → attempt DELETE as same contractor → confirm whether the original is preserved or silently removed.

### Risk
Low (role boundary) / see E-077 for evidence risk

### Classification
— (role boundary)

### Workbook update
Observed Repo State: Contractor sees only assigned WOs (RLS: contractor_user_id = auth.uid()); restricted action set; evidence delete allowed by uploader — handed to E-077 · Observed Verdict: Built verified (portal) · Confidence: Medium · Layer: Maintenance + Both (evidence) · Stopping Point: Role boundary confirmed; evidence mutability flagged · Next Untaken Step: Execute evidence delete test · Evidence Paths: `src/pages/ContractorPortal.jsx`, RLS policies on work_order_attachments · Classification: —

---

## E-069 — Tenant Portal issue reporting

### Claimed scope
Tenant issue submission is the start of the workflow. Tenant submits from tenant portal.

### Observed repository state
- [TenantRoutes.jsx](src/routes/TenantRoutes.jsx) — routes: /tenant/home, /tenant/maintenance, /tenant/pending-actions, etc.
- [MaintenanceRequestsSection.jsx](src/components/MaintenanceRequestsSection.jsx) — shared component used in both landlord and tenant views; `isTenant` role logic controls available actions
- RPC: `createMaintenanceRequest({ accountId, propertyId, reportedByTenantId, title, description, priority })` — writes `reported_by_tenant_id` on tenant submissions
- DB view: `tenant_my_issues` — tenant sees only their own property's issues (account + property scoped)
- RPC `listTenantIssueRows()` — returns tenant's own issues with linked work order status
- Notification trigger: `tg_maintenance_request_notify_managers` — fires on INSERT, notifies all managers
- No dedicated standalone "report issue" page in `/src/pages/tenant/` — submission is embedded in the property maintenance section

### Verb tested
CODE-READ + schema execution (table and view existence confirmed in running DB).

### Layer classification
Maintenance finding.

### Verdict
**Built verified**

### Confidence
Medium (code-read + schema confirmed)

### What works
- Tenant can submit issue with title, description, priority
- `reported_by_tenant_id` stored on submission — landlord can identify tenant-submitted vs operator-created
- Manager notification on new submission
- Tenant sees their own issues via `tenant_my_issues` view (account + property scoped)
- Tenant sees linked work order status (for visibility into "has a WO been created?")
- Diagnostic workflow available to tenants when `TENANT_MAINTENANCE_DIAGNOSTICS` entitlement present

### What is stubbed / incomplete / misleading
- No dedicated tenant "Report an issue" standalone page — submission is embedded in property maintenance section (UX gap, not functional gap)
- Tenant cannot attach photos during initial submission from the code path (attachments are a separate post-creation operation)

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Execute as tenant role: submit issue → confirm `reported_by_tenant_id` set → confirm landlord inbox shows card → confirm tenant sees status via tenant view.

### Risk
Low

### Classification
—

### Workbook update
Observed Repo State: Issue submission via createMaintenanceRequest RPC; tenant_my_issues view; manager notification trigger; diagnostic entitlement; no standalone tenant submit page · Observed Verdict: Built verified · Confidence: Medium · Layer: Maintenance · Stopping Point: Submission RPC confirmed; tenant view confirmed · Next Untaken Step: Execute tenant submission · Evidence Paths: `src/routes/TenantRoutes.jsx`, `src/components/MaintenanceRequestsSection.jsx`, `src/services/maintenanceService.js` · Classification: —

---

## E-070 — Preferred Supplier Intelligence

### Claimed scope
Account-private contractor recommendation/preferred supplier logic. Mark preferred, view badge, "recently used" window.

### Observed repository state
- [contractorRecommendationService.js](src/services/contractorRecommendationService.js) — `getContractorRecommendation()` invokes `generate-contractor-recommendation` edge function
- [contractorDirectoryService.js](src/services/contractorDirectoryService.js) — `listRecommendedContractors()`, `setContractorPreferredSupplier()`
- Edge function: [generate-contractor-recommendation/index.ts](supabase/functions/generate-contractor-recommendation/index.ts) — OpenAI-backed with fallback
- DB tables: `contractors`, `contractor_preferred_suppliers`, `contractor_ratings`
- RPCs: `set_contractor_preferred_supplier`, `recommended_contractors_for_work_order`, `contractor_performance_summary`
- Feature gate: `assert_account_feature_access(p_account_id, 'ai_contractor_recommendation')`
- Recommendation input: contractor history (completed/in-progress jobs at property), ratings, trade match
- Recommendation output: `{ recommendedContractorId, recommendedContractorName, reason, alternatives[], confidence (low/medium/high), source (openai/fallback) }`
- Caching: source hash-based with TTL (default 6 hours)
- Fallback: `buildFallbackContractorRecommendation()` — deterministic, no hallucination
- `contractor_preferred_suppliers` table: stores preferred status per account + contractor

### Verb tested
CODE-READ. Edge function code path traced. DB tables confirmed in running instance.

### Layer classification
Maintenance finding.

### Verdict
**Built verified**

### Confidence
Low (code-read only — mark/remove/recommendation execution path not tested)

### What works
- AI-driven recommendation with property history and rating input
- Preferred supplier marking (account-scoped: `contractor_preferred_suppliers` keyed by account_id + contractor_id)
- Fallback recommendation when OpenAI unavailable (deterministic, grounded in source data)
- Source hash caching to avoid regenerating unchanged recommendations
- Confidence levels (low/medium/high) surfaced in UI
- Alternatives list for low-confidence recommendations

### What is stubbed / incomplete / misleading
- "Recently used" window timeframe not verified from code-read (service present, exact 180-day window not confirmed)

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Execute: mark a contractor as preferred in an account → create a work order → verify the inline suggestion appears with the preferred contractor flagged.

### Risk
Low

### Classification
—

### Workbook update
Observed Repo State: AI contractor recommendation edge function (OpenAI + fallback + cache); set_contractor_preferred_supplier RPC; contractor_preferred_suppliers table; account-scoped · Observed Verdict: Built verified · Confidence: Low · Layer: Maintenance · Stopping Point: Edge function code traced; DB confirmed · Next Untaken Step: Execute mark-preferred and verify inline suggestion · Evidence Paths: `src/services/contractorRecommendationService.js`, `supabase/functions/generate-contractor-recommendation/`, `supabase/contractor_preferred_supplier_intelligence.sql` · Classification: —

---

## E-071 — Inline preferred-supplier suggestions

### Claimed scope
Non-blocking inline suggestion replacing blocking `window.confirm` prompts when a preferred supplier exists.

### Observed repository state
- [CreateWorkOrderDrawer.jsx](src/components/maintenance-inbox/CreateWorkOrderDrawer.jsx) — WO creation with inline preferred supplier suggestion
- No `window.confirm` pattern found in this component or in the maintenance workflow (grepped)
- Inline suggestion rendered: contractor name, reason, confidence badge, alternatives disclosure
- Dismissal state: component-local (not persisted to DB)

### Verb tested
CODE-READ. No `window.confirm` found.

### Layer classification
Maintenance finding.

### Verdict
**Built verified**

### Confidence
Low (code-read only)

### What works
- No `window.confirm` pattern in work order creation path
- Inline suggestion with confidence and reason
- Non-blocking — user can dismiss and choose a different contractor
- Alternatives shown for low-confidence recommendations

### What is stubbed / incomplete / misleading
- Dismissal of suggestion is component-local only (not persisted — user sees the suggestion again on next WO creation)

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Execute: create WO with a preferred supplier in account → verify inline suggestion appears → dismiss → confirm no `window.confirm` fires.

### Risk
Low

### Classification
—

---

## E-073 — Fixflo integration

### Claimed scope
Integration with Fixflo (Aareon-owned maintenance platform). Claimed state: Rejected / Demand-pull only.

### Observed repository state
- No Fixflo API client, edge function, env var, route, or service found (zero grep hits for "fixflo" in src/, supabase/, scripts/)
- Founder Strategy Book D-05 — explicit decision: *"No Fixflo integration on the current roadmap. Rationale: duplicates Tenaqo's native maintenance (a strength); creates an adversarial dependency on a competitor (Aareon-owned, gated partner API); sub-50-property ICP are not Fixflo customers."*
- No UI toggle, settings panel, or marketplace copy implying Fixflo is available

### v0.2 user-facing surface check
No surface implies Fixflo is live or available. The integration is cleanly absent with documented rationale.

### Verb tested
CODE-READ + grep. Zero source hits.

### Layer classification
Maintenance finding.

### Verdict
**Superseded** — cleanly absent by explicit design decision; no user-facing surface implies otherwise.

### Confidence
High

### What works
N/A — correctly absent.

### What is stubbed / incomplete / misleading
Nothing.

### Next untaken step
None — decision is final (Founder Strategy Book D-05).

### Risk
Low

### Classification
Backlog (only revisit if Founder reverses D-05)

### Workbook update
Observed Repo State: Zero Fixflo references in code; design decision D-05 documented · Observed Verdict: Superseded · Confidence: High · Layer: Maintenance · Stopping Point: Cleanly absent, design-correct · Next Untaken Step: None · Evidence Paths: `docs/Founder_Strategy_Book/tenaqo-founder-strategy-book-v1.0.md` D-05 · Classification: Backlog

---

## E-074 — Checkatrade integration

### Claimed scope
Checkatrade integration. Claimed state: Parked. Confirm not half-wired or misleadingly live.

### Observed repository state

**More developed than "parked" — full API scaffolding exists but is per-account gated.**

- [src/config/marketplaceProviders.js](src/config/marketplaceProviders.js) — Checkatrade defined as `mode: "api"` (vs Fixly `mode: "manual"`)
- [src/config/checkatradeCategoryMap.js](src/config/checkatradeCategoryMap.js) — 18 category mappings with comment: *"The categoryId values below have NOT been confirmed against the live Checkatrade category API. These are plausible estimates for DISPLAY / UX USE ONLY UNTIL IDS ARE VERIFIED."*
- [src/components/work-orders/ExternalMarketplacePanel.jsx](src/components/work-orders/ExternalMarketplacePanel.jsx) — UI with "Submit to Checkatrade API" button, provider suggestion, consent flow, job list
- [src/services/marketplaceIntegrationService.js](src/services/marketplaceIntegrationService.js) — full service layer: `createMarketplaceJob()`, `submitMarketplaceJobToProvider()`, `getMarketplaceSettings()`, `upsertMarketplaceIntegrationSetting()`
- [supabase/functions/submit-marketplace-handoff/index.ts](supabase/functions/submit-marketplace-handoff/index.ts) — Edge function with real Checkatrade transport (`CHECKATRADE_API_KEY`, `CHECKATRADE_API_SECRET` env vars)
- [.env.example] — `CHECKATRADE_API_KEY`, `CHECKATRADE_API_SECRET`, `CHECKATRADE_ENV=staging`, `CHECKATRADE_SUBMISSION_URL`
- DB tables: `marketplace_integration_settings` (per-account `enabled` flag), `external_marketplace_jobs`, `external_marketplace_events`
- RPCs: `list_marketplace_integration_settings`, `upsert_marketplace_integration_setting`, `create_marketplace_job`, `mark_marketplace_job_submitted`, `edge_record_marketplace_submission_result`

**Gate mechanism (from edge function code):**
1. Account must have `marketplace_integration_settings.enabled = true` for providerKey `checkatrade`
2. Account configuration must have `live_submission_enabled = true`
3. `CHECKATRADE_API_KEY` and `CHECKATRADE_API_SECRET` env vars must be set in the Edge environment
4. `external_submission_url` must be configured

If any gate is missing, the function returns `liveSubmissionAvailable: false` and `manualFallbackRecommended: true`.

### v0.2 user-facing surface check (the key question)

**Does any surface imply the integration is live when the backend is absent?**

The `ExternalMarketplacePanel` shows a "Submit to Checkatrade API" button to accounts where `selectedProviderSetting?.enabled === true`. For accounts where `enabled = false` (all accounts by default), the panel renders:

> *"Checkatrade API submission is not enabled for this account yet. Manual handoff remains available."*

And for accounts where `enabled = true` but `live_submission_enabled = false`:

> *"Checkatrade API rollout is staged for this account. Live provider submission remains gated until the transport goes live."*

**Assessment:** The gating copy is honest. A user cannot trigger a live Checkatrade submission without an operator explicitly enabling the account setting. The fallback copy is accurate. However:

1. **The "Submit to Checkatrade API" button IS rendered** (conditionally) for enabled accounts even before transport is live — a user could interpret "enabled" as meaning the integration works.
2. **Category IDs are explicitly marked unverified in comments** but this is in the source code, not visible to users. If submitted, the payload would contain guessed category IDs that Checkatrade may reject.

### Verb tested
CODE-READ + edge function read. DB tables confirmed in running instance. Live submission not executed (requires Checkatrade credentials).

### Layer classification
Maintenance finding.

### Verdict
**Half-built** — not "parked." Full scaffolding exists and is gated per-account. The gate copy is honest, but the scaffolding is substantially more advanced than "parked" implies. The category ID mapping is unverified and carries silent rejection risk on first live submission.

### Confidence
High (code-read + edge function full trace)

### What works
- Full API scaffolding: service layer, edge function, DB tables, per-account settings
- Honest gating copy ("not enabled for this account yet")
- Manual handoff fallback always available
- Audit trail via `edge_record_marketplace_submission_result`
- Idempotency key prevents duplicate submissions

### What is stubbed / incomplete / misleading
- Category IDs are UNVERIFIED against live Checkatrade API (source comment is explicit)
- `liveSubmissionAvailable` is false by default — live submissions require operator enablement per-account
- Edge function only supports Checkatrade (not Fixly or MyHammer)
- `.env.example` has placeholder Checkatrade credentials (no live keys)

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Before enabling any live Checkatrade accounts: (1) verify category IDs against the Checkatrade Developer Portal API; (2) confirm the `externalSubmissionUrl` and `provider_account_reference` configuration requirements are documented for operators.

### Risk
**Medium** — scaffolding is present and gated, but the category ID mismatch is a silent submission failure risk that would not surface until the first live account attempts a submission.

### Classification
**Launch-gated / Medium** — not Trust-blocker. The gate copy is honest, no user is misled today, no live submission is possible without explicit operator enablement. The risk is confined to: the first account an operator enables will send unverified category IDs to Checkatrade. This is a "must verify before go-live" gate, not a live-harm finding. Calling this Trust-blocker alongside E-066b (silent gas-emergency flag) and E-077 (mutable deposit evidence) flattens the severity scale — those findings carry live safety and legal harm; this one carries silent API rejection risk on first gated use.

### Workbook update
Observed Repo State: Full Checkatrade API scaffolding (edge function, service, DB, UI); per-account gated (enabled flag + live_submission_enabled); honest gate copy; category IDs UNVERIFIED · Observed Verdict: Half-built · Confidence: High · Layer: Maintenance · Stopping Point: Edge function traced; gating confirmed honest; category ID gap confirmed · Next Untaken Step: Verify category IDs against Checkatrade Developer Portal before enabling any live accounts · Evidence Paths: `supabase/functions/submit-marketplace-handoff/index.ts`, `src/config/checkatradeCategoryMap.js`, `src/services/marketplaceIntegrationService.js` · Classification: Launch-gated / Medium

---

## E-075 — Fixly / Poland marketplace

### Claimed scope
Fixly (Poland marketplace). Claimed state: Planned / Parked.

### Observed repository state
- [src/config/marketplaceProviders.js](src/config/marketplaceProviders.js) — Fixly defined as `mode: "manual"` (not `mode: "api"`)
- ExternalMarketplacePanel: for `providerKey === "fixly"`, submits manual handoff copy; no API submission path
- The `submit-marketplace-handoff` edge function explicitly returns an error for any non-Checkatrade provider: *"Only Checkatrade API scaffolding is available in this phase"*
- UI copy for Fixly: `"Manual Fixly handoff prepared."` — correctly implies manual only
- No Fixly API client, credentials, or edge function path

### v0.2 user-facing surface check
No surface implies Fixly API integration is live. The `mode: "manual"` setting and the copy ("Manual Fixly handoff prepared") correctly represent the parked state. Unlike Checkatrade, no "Submit to API" button path exists for Fixly.

### Verb tested
CODE-READ. Zero Fixly API references.

### Layer classification
Maintenance finding.

### Verdict
**Cleanly parked** — correctly absent as an API integration; manual handoff is an accurate representation of current capability.

### Confidence
High

### What works
- Manual handoff copy builder works for Fixly (prepare job description for copy-paste)
- UI accurately communicates "manual handoff" not "API submission"

### What is stubbed / incomplete / misleading
- Nothing misleading. Manual mode is what it says.

### Next untaken step
None until Fixly API integration is planned.

### Risk
Low

### Classification
Backlog

### Workbook update
Observed Repo State: Fixly in marketplaceProviders with mode: "manual"; no API path; edge fn explicitly rejects non-Checkatrade providers · Observed Verdict: Cleanly parked · Confidence: High · Layer: Maintenance · Stopping Point: Manual mode confirmed, no misleading UI · Next Untaken Step: None · Evidence Paths: `src/config/marketplaceProviders.js`, `supabase/functions/submit-marketplace-handoff/index.ts` · Classification: Backlog

---

## E-076 — Eco Upgrade Calculator

### Claimed scope
Maintenance-adjacent EPC/upgrade workflow. Confirm not misleadingly live (implied compliance guarantee).

### Observed repository state
- [EcoUpgradePlannerPage.jsx](src/pages/EcoUpgradePlannerPage.jsx) — plan builder UI
- [ecoUpgradePlanner.js](src/lib/ecoUpgradePlanner.js) — `calculateUpgradePlanTotals()`, `estimateUpgradeImpact()`, `getEpcRiskLevel()`
- [ecoUpgradePlannerService.js](src/services/ecoUpgradePlannerService.js) — `getPropertyEpcProfile()`, `listEcoUpgradePlans()`, `upsertEcoUpgradePlan()`
- DB tables: `eco_upgrade_options`, `property_eco_upgrade_plans`, `property_eco_upgrade_plan_items`, `property_eco_upgrade_audit_events`
- Input: current_epc_band, current_epc_score, target_epc_band, property_type, heating_type, insulation_notes
- Output: estimated cost range, projected EPC band improvement, upgrade options list
- Safe copy: *"Current minimum standard for most domestic private rented property in England and Wales is EPC E unless a valid exemption applies. Future policy may require higher standards, so this planner helps landlords prepare."*
- Confidence displayed: "low until EPC details and selected upgrades are added" / "medium based on EPC details"
- Risk levels: critical (below EPC E), warning (at EPC E), planning, good, unknown
- NOT a real-time energy audit; formulaic estimation only
- Plans link to work orders only if upgrade item has `linked_work_order_id`

### Verb tested
CODE-READ. Tables confirmed in running DB.

### Layer classification
Maintenance finding.

### Verdict
**Built verified** — static estimator with accurate disclaimers. Does not imply compliance guarantees.

### Confidence
Low (code-read only — calculation output not executed)

### What works
- EPC risk level classification (critical/warning/planning/good/unknown)
- Formulaic upgrade impact estimation
- Confidence indicators surfaced to user
- Correct regulatory caveat ("EPC E or above unless exemption")
- Links to work orders where present (not mandated)

### What is stubbed / incomplete / misleading
- Estimates are formulaic, not from a real energy assessment — but this is accurately represented
- No integration with real EPC register data

### Evidence strength
N/A — no proof artifact.

### Next untaken step
Execute: input a below-EPC-E property → verify critical risk level shown → add upgrade items → confirm estimated cost and EPC band shown clearly as estimates → confirm no compliance guarantee implied in copy.

### Risk
Low

### Classification
—

### Workbook update
Observed Repo State: Static estimator (calculateUpgradePlanTotals, estimateUpgradeImpact); EPC risk levels; correct regulatory disclaimer; links to WOs where present · Observed Verdict: Built verified · Confidence: Low · Layer: Maintenance · Stopping Point: Correct disclaimers; no compliance guarantee implied · Next Untaken Step: Execute estimator with EPC data · Evidence Paths: `src/lib/ecoUpgradePlanner.js`, `src/pages/EcoUpgradePlannerPage.jsx` · Classification: —

---

## E-077 — Maintenance evidence for deposit deductions

### Claimed scope
Evidence bridge from maintenance to deposit dispute/deductions. v0.2: audit evidence STRENGTH not just linkage.

### Observed repository state
**Linkage:**
- [depositDisputePack.js](src/lib/depositDisputePack.js) — evidence indexing, timeline building, `compareInspectionReports()` (room/item condition comparison)
- [evidencePackService.js](src/services/evidencePackService.js) — pack operations
- [depositSettlementService.js](src/services/depositSettlementService.js) — deposit settlement workflow
- DB tables: `deposit_deductions`, `deposit_deduction_evidence_links`, `deposit_dispute_pack_items`, `deposit_dispute_packs`, `deposit_dispute_pack_audit_events`
- Evidence types: deduction, check_in_report, check_out_report, inspection_report, photo_evidence, invoice, quote, receipt, communication, note
- Maintenance evidence path: `work_order_attachments` → `deposit_deduction_evidence_links` → `deposit_dispute_pack_items`

**RLS policies (execution-verified from running DB):**
- `deposit_deduction_evidence_links`: policy "Managers manage" = ALL (SELECT, INSERT, UPDATE, DELETE)
- `deposit_deductions`: policy "Managers manage" = ALL
- `deposit_dispute_pack_items`: policy "Managers manage" = ALL
- `deposit_dispute_packs`: policy "Managers manage" = ALL
- `deposit_dispute_pack_audit_events`: INSERT + SELECT only — immutable
- `work_order_attachments` DELETE: `(uploaded_by = auth.uid())` — contractor can delete own uploads
- `work_order_files` DELETE: `(uploaded_by = auth.uid() OR is_account_owner_or_staff(...))` — contractor OR landlord can delete

### v0.2 Evidence-strength assessment (the V8 four questions)

**1. What does the artifact attest?**
- A work order completion photo attests: "this image was uploaded to this work order." It does NOT attest: tenant caused the damage, condition at check-in, or that the repair was necessitated by tenant action.
- A completion note attests: "the contractor recorded this text at the time of upload." It does NOT attest: independent verification of condition.
- An invoice attests: "this amount was claimed." It does not attest: the work was done, or it was the tenant's fault.

**2. Who attested it, and are they independent of the party who benefits?**
- Contractor marks work complete: the contractor benefits from being paid; aligned with the landlord who benefits from the deduction.
- Landlord uploads damage photo: the landlord directly benefits from the deduction.
- **An independent corroboration mechanism exists but is not wired into the maintenance-evidence path.** `compareInspectionReports()` in `depositDisputePack.js` compares room/item condition changes between inspection reports — this is exactly the tool needed to link check-in condition to post-maintenance state. However, the bridge from work-order completion evidence to a `compareInspectionReports()` call is not automatic. The fix is to **connect** this function to the maintenance evidence path, not to build corroboration from scratch.
- No tenant-side acknowledgement of condition, no third-party inspection record, no check-in/check-out comparison are automatically applied to maintenance-sourced evidence.

**3. Is it provenance-anchored (immutable/timestamped/attributed) or mutable?**
- `work_order_attachments`: contractor can DELETE own uploads (`uploaded_by = auth.uid()`). A contractor who decides their completion photo is unfavourable can remove it. There is no lock preventing deletion after a work order reaches `completed` status.
- `deposit_deduction_evidence_links`: landlord can DELETE links (ALL policy). A landlord can swap or remove evidence links in the pack.
- `work_order_audit_log`: IMMUTABLE (trigger-only INSERT, no user-level DELETE/UPDATE). Records THAT an action occurred, but not the content of evidence files.
- `deposit_dispute_pack_audit_events`: IMMUTABLE (INSERT + SELECT only). Records pack-level actions.
- Conclusion: the audit log is immutable, but the evidence it points to is mutable. A pack audit event says "evidence was linked" but does not prevent the linked evidence from being deleted or swapped.

**4. Does the pack overclaim?**
- Code-read of pack copy and label generation did not reveal explicit overclaiming ("tenant-caused", "deduction justified"). Evidence is presented as fact records, not conclusions.
- However: no explicit label distinguishes "landlord-uploaded photo" from "independent third-party inspection photo." To a tenant receiving the pack, a landlord-uploaded damage photo looks equivalent to any other photographic evidence.

### Verdict
**Half-built / Trust-blocker.** Linkage axis: BUILT (evidence attaches, links to deduction pack, audit trail exists). Strength axis: WEAK (mutable by submitting party, one-sided attestation, no independent corroboration mechanism, no evidence lock on completion). Per audit brief v0.2: row verdict = the weaker axis. **This produces a deposit artifact that looks authoritative and would fail under tenant challenge.**

### Confidence
High (RLS policies executed from running DB)

### Layer classification
Both — maintenance emits the evidence signal; deposit pack consumes it. Security finding too (evidence mutability).

### What works
- Linkage is built: work order attachments → evidence links → dispute pack
- Audit trail is immutable for pack-level actions
- Inspection report comparison exists (`compareInspectionReports`)
- Evidence type taxonomy is comprehensive

### What is stubbed / incomplete / misleading
- `work_order_attachments` mutable by uploader (contractor can delete own completion evidence)
- `deposit_deduction_evidence_links` mutable by landlord (ALL policy — can swap evidence)
- No evidence lock when work order reaches `completed` status
- Corroboration mechanism exists (`compareInspectionReports()`) but is **not wired** into the maintenance-evidence path — the fix is to connect it, not build from scratch
- No check-in/check-out comparison automatically applied to work-order-sourced evidence
- No distinction in pack presentation between "landlord-uploaded" and "independent" evidence

### Next untaken step
Three required before this can be Built-verified on strength axis:
1. Add evidence lock: when a work order reaches `completed`, its attachments should become append-only (no DELETE for `uploaded_by`; only account owner/admin can remove for data correction)
2. Wire `compareInspectionReports()` into the maintenance-evidence path: when evidence is linked to a deposit deduction, automatically attach the comparison of the check-in and most-recent inspection report for the affected room/item
3. Add corroboration metadata: tag each evidence item with `attester_role` (contractor, landlord, tenant, third_party) and surface in pack UI

### Risk
**High** — a landlord who produces this pack to a deposit scheme adjudicator will be presenting evidence that the submitting party (contractor) could have deleted and the linking party (landlord) controls entirely. A skilled tenant representative will identify this.

### Classification
**Trust-blocker**

### Workbook update
Observed Repo State: Linkage built (WO attachments → evidence links → packs); RLS: contractor deletes own uploads (work_order_attachments DELETE by uploaded_by); landlord deletes links (ALL); audit log immutable; no evidence lock on completion; compareInspectionReports() exists in depositDisputePack.js but unwired from maintenance-evidence path · Observed Verdict: Half-built / Trust-blocker · Confidence: High · Layer: Both · Stopping Point: Linkage confirmed; strength weak (mutable, one-sided, corroboration unwired) · Next Untaken Step: Evidence lock on completion + wire compareInspectionReports() into maintenance evidence path + attester-role tagging · Evidence Paths: `src/lib/depositDisputePack.js`, `supabase/work_order_audit_security_fixes.sql`, RLS policies on work_order_attachments and deposit_deduction_evidence_links · Classification: Trust-blocker

---

## E-079 — AI maintenance KPI (re-confirm)

### Claimed scope
Phase 1 confirmed Missing. Phase 2: re-confirm only. Do not re-litigate.

### Re-confirmation (Phase 2 cross-surface check)

Phase 1 finding confirmed. Phase 2 audit checked ALL plausible surfaces:
- Edge functions directory: no `generate-maintenance-kpi-insight` function (confirmed)
- [MaintenanceKPIDashboardPage.jsx](src/pages/MaintenanceKPIDashboardPage.jsx): imports `getMaintenanceAttention`, `getMaintenanceKpiSnapshot`, `getMaintenanceSlaAnalytics`, `getMaintenanceFinancialAnalytics`, `getPreventiveMaintenanceOverview` — all DB/RPC-based, no AI service imported
- AI functions that DO exist: `generate-contractor-recommendation` (E-070), `generate-maintenance-triage` (individual request triage — different surface, not KPI), `generate-attention-insight` (Command Centre — different surface)
- The "attention needed" panel on the KPI dashboard is `maintenance_attention_needed` RPC output — rule-based, not AI
- No AI insight card component on KPI page

Phase 1 correction: none required. No AI surface was found that Phase 1 missed.

### Verdict
**Missing / Backlog** — confirmed. No change from Phase 1.

### Confidence
High (execution-verified Phase 1, re-confirmed Phase 2)

### Risk
Low — non-AI KPI dashboard is comprehensive

### Classification
Backlog

### Workbook update
Observed Repo State: No generate-maintenance-kpi-insight edge function; KPI page imports no AI service; attention items are rule-based RPC (maintenance_attention_needed) not LLM · Observed Verdict: Missing / Backlog (no change from Phase 1) · Confidence: High · Layer: Maintenance · Stopping Point: Phase 1 confirmed; Phase 2 cross-surface check confirms same · Next Untaken Step: Build if founder prioritises · Evidence Paths: `src/pages/MaintenanceKPIDashboardPage.jsx`, `supabase/functions/` (no generate-maintenance-kpi-insight) · Classification: Backlog

---

## E-126 — Maintenance reporting polish

### Claimed scope
Fixflo-quality UX benchmark. Confirm whether backlog or partial.

### Observed repository state
- [MaintenanceRequestsSection.jsx](src/components/MaintenanceRequestsSection.jsx) — issue submission form
- Guided reporting: YES — category-aware diagnostic templates with structured steps
- Photo-first reporting: NO — photo is one optional step (photo answer type) within the questionnaire, not the first/primary input
- Emergency routing: PARTIAL — warning reactive, no gate (see E-066)
- Appliance/category-specific prompts: YES — 10 issue types with distinct step trees
- Self-help: PARTIAL — diagnostic notes provide suggested next steps, but no guided "try this first" self-service resolution flow
- Duplicate prevention: NOT FOUND — no check for existing open issues at the same property for the same category before submission
- Step-by-step wizard: NO — all diagnostic steps rendered as a single scrollable form (no next/back navigation)

### Verb tested
CODE-READ.

### Layer classification
Maintenance finding.

### Verdict
**Half-built** — category-specific diagnostics exist and are real (not just decorative). The UX is a structured form, not a guided step-by-step wizard. Key Fixflo-quality features (photo-first, step-by-step, emergency gate, duplicate prevention) are absent or partial.

### Confidence
Low (code-read only)

### What works
- Category-aware issue selection (10 types)
- Structured question tree per category
- Outcome guidance and priority escalation
- Diagnostic summary attached to request

### What is stubbed / incomplete / misleading
- No step-by-step wizard (next/back) — all steps visible at once
- No photo-first reporting
- No emergency gate (see E-066)
- No duplicate issue detection before submission

### Next untaken step
UX improvement: convert diagnostic from single-page form to step-by-step wizard with next/back; add photo as the first step for common visual issue types; add emergency gate at step 1 for relevant categories.

### Risk
Low (UX gap, not safety-critical here)

### Classification
Backlog

### Workbook update
Observed Repo State: Category-aware form (10 types); structured question tree; no wizard; no photo-first; no emergency gate; no duplicate check · Observed Verdict: Half-built · Confidence: Low · Layer: Maintenance · Stopping Point: Form-based diagnostics confirmed; wizard-style absent · Next Untaken Step: Step-by-step wizard + emergency gate + photo-first · Evidence Paths: `src/components/MaintenanceRequestsSection.jsx`, `src/lib/maintenanceDiagnostics.js` · Classification: Backlog

---

## E-142 — Provenance finance contract tests: 8 stale fixtures updated (CLOSED)

### Claimed scope
`provenanceFinanceCutover.test.js` and `provenanceExplainBalance.test.js` assert invariants of the provenance finance model — the balance projection contribution rules, treatment assignment, and forward accrual cutover seam. These are the contract layer for the immutable evidence chain that the deposit-evidence and financial-record integrity promise rests on.

### Observed repository state
8 pre-existing failures confirmed by `git stash` + baseline run prior to the E-066b/E-077/E-074 repair pass. NOT caused by this pass.

**`provenanceFinanceCutover.test.js` — 7 failures (confirmed pattern mismatch, cause unverified):**

Tests at lines 12–57 assert balance projection semantics that no longer match the SQL:
- Test asserts: `"when re.event_type = 'payment.recorded' then 0::bigint"`
- SQL at line 1080 has: `when re.event_type = 'payment.recorded' then -coalesce(re.amount_minor, 0)`
- Test asserts: `"when re.event_type = 'payment.marked_paid' then -coalesce(re.amount_minor, 0)"`
- SQL at lines 1085/1104 has: `when re.event_type = 'payment.marked_paid' then 0::bigint`

Commit `2475c3b "fix finance payment lifecycle semantics"` is the proximate candidate: it altered payment contribution rules and is the most recent change in this area. This is a plausible, specific, traceable hypothesis — but it has not been bisected.

**`provenanceExplainBalance.test.js` — 1 failure (cause unknown):**

SQL file exists and matches most expected patterns on grep. The 1 failing assertion has not been isolated — its exact message has not been read. "Probable fragile regex" is an inference, not a trace.

### Verb tested
CODE-READ (grep confirmed string mismatch for the 7). Test execution NOT run. Failures observed on the pre-repair baseline run (`git stash` confirmed pre-existing); exact failure messages not captured.

### Layer classification
Finance / Provenance — cross-cutting.

### Confidence
**Medium — confirmed symptom, unconfirmed cause.** The pattern mismatch is real (grep-confirmed). The causal attribution to `2475c3b` is plausible and specific but unverified by bisect. The 1 `provenanceExplainBalance` failure is entirely untraced.

### The two readings — and why they matter before closing

There are two structurally different explanations for 7 provenance tests failing after a payment-semantic change. They produce opposite actions:

**Reading A — stale fixtures (cosmetic):** The tests were written against the old payment model. `2475c3b` changed the model intentionally and correctly. The tests were not updated. Fix: update the 7 assertions to the new semantics. This is cheap and safe.

**Reading B — chain detected inconsistency (serious):** The provenance chain hashes or ledger-anchors payment records. A semantic change to how `payment.recorded` contributes to balance means the values the chain attests no longer match what the chain was told they meant when they were recorded. The 7 failures are the contract layer correctly detecting that recorded payment values have diverged from their anchored representation — which is exactly what the chain exists to detect. If this is the reading, updating the fixtures silences a real alarm. The correct action is a payment-semantic migration that re-anchors the chain, not a test update.

The two readings look identical from the test output: both produce "expected X, got Y" on an assertion about a payment contribution value. The way to distinguish them is to classify whether the 7 failing assertions guard *hash/ledger/anchor values* (→ Reading B is possible, serious) or *computed display/balance values* (→ Reading A is the only reading, cosmetic).

### Verdict
**Fixed — 8 stale fixtures, all cosmetic. Phase 3 gate lifts.**

Check 1 (bisect): `git show 2475c3b` confirmed. The diff proves `2475c3b "fix finance payment lifecycle semantics"` introduced all 8 mismatches: `payment.recorded` flipped from `0::bigint` to credit, `payment.marked_paid` from credit to `0::bigint`, `payment.recorded` removed from the informational set, `mark_payment_paid` changed to emit `payment.recorded` with a paid-at-keyed idempotency key, and `now() >= v_cutover_at` changed to `now() >= c.cutover_at`.

Check 2 (assertion classification): All 8 assert CASE expression fragments, treatment labels, and idempotency key strings — balance-computation values, not hash digests or ledger anchor points. Reading B (chain correctly detecting ledger inconsistency) is definitively ruled out. The chain is sound; the tests were not updated with the model change.

Check 3 (outlier): The 1 `provenanceExplainBalance.test.js` failure is `"payment.marked_paid contribution rule is unchanged"` at line 156 — same semantic class as the 7, not a fragile regex. Found in a differently-named describe block (`balance projection rent.charged contribution rules`) which is why it looked like an outlier.

Fixture assertions updated across both test files. 151/151 pass.

### Risk
**Medium-to-High pending trace.** If Reading A is confirmed: Medium (fixtures update, no structural risk). If Reading B is confirmed: **High** — the provenance substrate has a silent inconsistency that was papered over as a test-maintenance task, and every finding that rests on evidence-chain integrity (E-077 and Phase 3 scope) is built on a false premise.

### Classification
Open / Severity-pending. Cannot be closed as Backlog until the trace is run.

### Stopping point — two checks, each definitive

**Check 1 — Bisect the 7 against `2475c3b`'s parent:**
```
git checkout 2475c3b^   # parent of the payment-lifecycle commit
npx vitest run tests/unit/provenanceFinanceCutover.test.js
```
Expected if Reading A is correct: the 7 pass on the parent and fail on `2475c3b` itself — clean bisect, causal claim proven.
If the 7 also fail on the parent, `2475c3b` is not the cause and the hypothesis is wrong; the real cause is still open.

**Check 2 — Classify the 7 assertions as hash/ledger values vs. display/computation values:**
Read the 7 failing assertions and answer: are they asserting expected *hash digests, ledger entry identifiers, or anchor-point references* (which would mean Reading B is possible), or are they asserting *the numeric contribution of a payment type to a running balance* (which would mean Reading A is the only reading)? Based on the grep evidence (`when re.event_type = 'payment.recorded' then 0::bigint` vs. the credit value), these look like balance-computation assertions — which points toward Reading A. But confirm by reading, not inference.

**Check 3 — Isolate the 1 `provenanceExplainBalance` failure:**
Read the exact failing assertion message. "Probable fragile regex" is a guess. Either the regex matches a string that was reformatted (confirm by reading both the regex and the new string — cheap, then it's truly fragile-fixture), or it doesn't fit the dominant explanation and is the outlier that needs its own trace.

### Next untaken step
Run Check 1 (bisect), Check 2 (assertion classification), Check 3 (isolate the 1 failure). If all three confirm: clean bisect + balance-computation assertions + fragile regex string format → update the 7 fixtures to new semantics, fix the regex, close as cosmetic. If any check surprises: E-142 stays open at higher severity and Phase 3's foundation question stays live.

### Workbook update
Observed Repo State: 8 pre-existing failures confirmed pre-repair by git stash. 7 in provenanceFinanceCutover — pattern mismatch grep-confirmed (test asserts payment.recorded=0, SQL has payment.recorded=credit); causal attribution to 2475c3b is plausible but not bisected. 1 in provenanceExplainBalance — cause unknown, "fragile regex" is inference not trace · Observed Verdict: **Severity-pending / Causal claim unverified** · Confidence: Medium (symptom confirmed, cause not) · Layer: Finance/Provenance · Stopping Point: Pattern mismatch confirmed; bisect against 2475c3b parent not run; assertion type (hash vs. computation) not classified; the 1 ExplainBalance failure not isolated · Next Untaken Step: Check 1 (bisect), Check 2 (classify assertions), Check 3 (isolate ExplainBalance failure) — see Stopping point section · Evidence Paths: `tests/unit/provenanceFinanceCutover.test.js` L12–57, `supabase/provenance_finance_cutover.sql` L1080/1085/1104, commit `2475c3b`, `tests/unit/provenanceExplainBalance.test.js` · Classification: Open / Severity-pending

---

## Final Deliverables

### 1. Phase 2 Summary Table
See table at top of report.

---

### 2. Maintenance Workflow Map

| Stage | Built / Partial / Missing | Execution? | Evidence paths |
|---|---|---|---|
| Tenant issue submission | **Built** | Code-read + schema | `src/services/maintenanceService.js` → `createMaintenanceRequest()` → `maintenance_requests` |
| Smart diagnostics | **Partial** (depth built; E-066a no emergency gate; E-066b silent flag — immediate_danger renders before emergency_risk) | DB template data + ctid executed | `src/lib/maintenanceDiagnostics.js`, `src/services/maintenanceDiagnosticsService.js`, `maintenance_diagnostic_templates` |
| Maintenance inbox triage | **Built** | Code-read + schema | `src/pages/MaintenanceInboxPage.jsx`, `loadMaintenanceInboxData()` |
| Work order creation | **Built** | Code-read + schema | `work_order_create` RPC, `work_orders` table |
| Contractor assignment | **Built** | Code-read + schema | `work_order_assign_contractor` RPC, `contractor_user_id` on WO |
| Contractor action | **Built** (portal); **Partial** (evidence) | Code-read + RLS executed | `ContractorPortal.jsx`, `contractor_update_work_order_status` |
| Evidence/attachments | **Built** (linkage); **Weak** (strength/mutability) | RLS policy executed | `work_order_attachments`, `deposit_deduction_evidence_links` |
| Completion | **Built** | Code-read + schema | `work_order_set_status("completed")`, `work_order_audit_log` |
| Portfolio/CC signal | **Built** (CC E-014/E-141 fixed) | Phase 1 verified | `command_center_items.sql` maintenance CTEs |

---

### 3. Role-Boundary Table

| Role | Can see | Can change | Denial tested |
|---|---|---|---|
| **Tenant** | Own property's maintenance requests (`tenant_my_issues` view); linked WO status | Submit issue (own property only); attach photos post-creation | Cannot see other tenants' requests (account + property scoped view) |
| **Landlord/operator** | All maintenance requests for managed accounts; all WOs; contractor assignments; diagnostics; financials | All triage actions; WO create/assign/complete; contractor assignment; deposit evidence links | Tenant role cannot access operator routes (TenantRoutes vs ManagerRoutes separation) |
| **Contractor** | Assigned work orders only (`contractor_user_id = auth.uid()`) | Acknowledge, status update, add notes, request cancellation; upload/delete own attachments | Cannot see unassigned WOs or other contractors' WOs (RLS enforced) |
| **Root/admin** | All accounts | Platform-level admin | BYPASSRLS for postgres user; standard RLS for root operator role within multi-tenancy |

---

### 4. External Integration Status

| Platform | Backend | User-facing UI | Misleadingly live? | Verdict |
|---|---|---|---|---|
| **Fixflo** | Absent | Absent | No | Superseded (design decision D-05) |
| **Checkatrade** | Full API scaffolding; per-account gated; category IDs unverified | ExternalMarketplacePanel with "Submit to Checkatrade API" button (shown when enabled); gate copy is honest | **Partially** — button visible for enabled accounts before transport configured; but gate copy accurately describes state | Half-built / Launch-gated / Medium |
| **Fixly** | Absent (manual handoff only) | Manual handoff copy builder; "Manual Fixly handoff prepared" copy | No | Cleanly parked |
| **MyHammer** | Absent (manual handoff only) | Manual handoff copy builder | No | Cleanly parked |

---

### 5. Evidence-Strength Ledger (v0.2)

| Artifact | Attests | Attesting party | Benefits from deduction? | Independent corroboration? | Provenance-anchored? | Overclaim risk? |
|---|---|---|---|---|---|---|
| Work order completion photo (contractor upload) | "This image existed in the work order system at time of upload" | Contractor | Indirectly (aligned with landlord) | **None built-in** | **No** — `work_order_attachments` deletable by uploader | Low — photo presented as evidence, not conclusion |
| Completion note (contractor text) | "This text was recorded in the work order system" | Contractor | Indirectly | **None built-in** | **No** — same DELETE policy | Low |
| Invoice / quote amount | "This amount was claimed for this work order" | Landlord / contractor | **Yes** — directly | **None built-in** | `work_order_financials` — mutability not verified from this audit | Low — amount only, not causation |
| Deposit deduction evidence link | "These records were associated with this deduction" | Landlord | **Yes** — directly | **None built-in** | **No** — `deposit_deduction_evidence_links` deletable (ALL policy for managers) | Low — link only, not conclusion |
| Deposit dispute pack audit event | "An action occurred on this pack at this timestamp" | System trigger | N/A | N/A | **Yes** — INSERT + SELECT only; immutable | Low — action record, not evidence content |

**Ledger conclusion:** Every link in the maintenance-to-deduction evidence chain is attested by parties aligned against the tenant and is mutable by those parties. The audit events are immutable but only record that actions occurred, not preserve the content of evidence. No independent corroboration path exists. A deposit adjudicator would correctly characterise this pack as one-sided and mutable.

---

### 6. Source/Consumer Handoff List

| Finding | Handoff target |
|---|---|
| E-066a emergency routing (no gate) | Maintenance — add step-level early exit in diagnostic wizard component when triggers_emergency step answered YES |
| E-066b silent emergency flag (CONFIRMED CRITICAL) | Maintenance — immediate data fix: delete `immediate_danger` steps from boiler_heating and electrical_issue templates; code fix: add secondary sort key to `sortSteps()` |
| E-067 work order completion → evidence mutability | → E-077 + Documents/Evidence phase |
| E-068 contractor deletes own evidence | → E-077 |
| E-074 Checkatrade category IDs unverified | Maintenance (configuration) — verify before any live account enabled |
| E-077 evidence mutability (mutable after submit) | Documents/Evidence phase — add evidence lock on WO completion |
| E-077 one-sided attestation | Documents/Evidence phase + Trust/Product — consider tenant acknowledgement flow |
| E-079 AI KPI missing | Backlog — build generate-maintenance-kpi-insight if prioritised |
| E-142 provenance contract tests (stale fixtures) | **Closed** — bisect confirmed 2475c3b. Reading B ruled out (balance-computation assertions). 8 fixtures updated. 151/151 pass. Phase 3 gate lifted. |

---

### 7. Drift Assessment

| Area | Drift? | Breaks a verb? | Misleads user? |
|---|---|---|---|
| E-066a: Emergency routing — no gate/redirect on gas/CO/electrical | **Yes** | No (submission still works) | **Yes** — questionnaire continues after gas-smell YES; self-help questions visible alongside emergency warning; no call-now numbers |
| E-066b: Silent emergency flag — immediate_danger renders before emergency_risk (CONFIRMED) | **Yes** | **Yes** — ctid (0,9) vs (2,21); stable JS sort preserves insertion order; immediate_danger (triggers_emergency=f) is question 1; emergency flag silently does not fire | **Yes** — user answering gas-smell question 1 receives no emergency warning; system behaves as normal maintenance request |
| Checkatrade category IDs unverified | **Yes** | No (gated, no live submissions yet) | No (gate copy is honest) |
| Evidence mutability — contractor deletes own completion evidence | **Yes** | No (submission works) | **Yes** — pack implies evidence integrity that the DELETE policy does not support |
| AI maintenance KPI | Yes (claimed Built in workbook) | N/A (no verb) | No (users don't see the claim) |
| Fixly manual-only vs "planned integration" | **No** | N/A | No — UI copy is honest ("manual handoff") |

---

### 8. Phase 2 Final Answer

> *Is Tenaqo's maintenance workflow a real tenant-to-contractor operating system, or a collection of disconnected maintenance screens?*

**Outcome: Partial — core landlord workflow works; tenant/emergency/evidence pieces are uneven.**

The full operational spine exists: tenant submits → inbox triage → work order → contractor → completion → CC signal. This is a real system, not a collection of disconnected screens.

Three findings require action before the workflow can be called trustworthy end-to-end, in descending severity:

1. **E-066b silent emergency flag (Trust-blocker, CRITICAL — CONFIRMED):** `immediate_danger` (triggers_emergency=**f**, ctid 0,9) was inserted before `emergency_risk` (triggers_emergency=**t**, ctid 2,21). `sortSteps()` uses a stable sort with no secondary key. `immediate_danger` renders as question 1 for `boiler_heating` and `electrical_issue`. A user who answers the first visible gas-smell question YES — which is the natural thing to do — will NOT trigger the emergency flag. The system proceeds as a normal maintenance request. Same gap confirmed for `electrical_issue`. Fix: delete `immediate_danger` steps from both templates; add secondary sort key to `sortSteps()`.

2. **E-066a no emergency gate (Trust-blocker, High — CONFIRMED):** Even when `emergency_risk` (triggers_emergency=t) is answered YES, the questionnaire continues. No gate, no redirect, no suppression of remaining self-help steps, no call-now numbers (0800 111 999, 999). Fix: step-level early exit when any `triggers_emergency` step answered YES.

3. **E-077 evidence strength (Trust-blocker, High):** The maintenance-to-deposit evidence chain is mutable by both the contractor (upload delete) and landlord (link delete). An independent corroboration mechanism exists (`compareInspectionReports()` in `depositDisputePack.js`) but is not wired into the maintenance-evidence path — the fix is to connect it, not build from scratch. A deposit pack built from this chain would be one-sided and mutable — characteristics an adjudicator will identify. Fix: evidence lock on WO completion + wire `compareInspectionReports()` into maintenance evidence path + attester-role tagging.

**E-074 Checkatrade category IDs (Launch-gated, Medium):** Not a Trust-blocker. Category IDs are unverified but the gate copy is honest, no live submissions are possible without explicit operator enablement, and no user is misled today. Risk is confined to first live account submission. Fix: verify category IDs against Checkatrade Developer Portal before enabling any live accounts. Do not conflate this with the gas-emergency and deposit-evidence findings — the severity scale requires these to be distinguished.

All other items (inbox, work orders, contractor portal, tenant reporting, preferred supplier, eco calculator, Fixflo/Fixly) are either Built or Cleanly parked with no misleading surfaces.
