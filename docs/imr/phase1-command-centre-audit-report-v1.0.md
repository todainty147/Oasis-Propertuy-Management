# Phase 1 — Command Centre / Attention Engine / Operating Layer
## IMR Audit Report v1.0

**Date:** 2026-06-29 / updated 2026-06-30
**Auditor:** IMR-000 programme, automated
**Evidence type:** Mixed — CODE-READ (initial) + EXECUTION-VERIFIED (E-014, E-140, E-141). See individual findings for confidence level.
**Confidence:** Varies by finding — see each section. E-014, E-140, E-141 are High (execution-verified). Others remain Low (code-read only).
**Governing principles:** Tenaqo Founder Strategy Book v1.3, Constitutional Articles 1–9

---

## Phase 1 Summary Table

| ID | Topic | Verdict | Confidence | Layer | Risk † | Stopping Point | Next Untaken Step |
|---|---|---|---|---|---|---|---|
| E-013 | Command Centre / Attention Centre | **Built verified** | Low (code-read) | Aggregation (core) | Low | Full aggregation surface exists with sort/bucket/filter/link/realtime | Execute full loop against live instance |
| E-014 | Attention items aggregation | **Built verified** | High (execution-verified) | Aggregation (core) | **Low** | 11 of 12 source categories wired; **Documents** has no expiry to wire (file management only); **HMRC** correctly absent (deferred-by-design, sandbox-only) | — (bucket-priority defect promoted to E-141 and fixed) |
| E-141 | Compliance bucket ordering — due-soon certs silently dropped | **Fixed** | High (execution-verified) | Aggregation (core) | **High inherent / Low residual †** | `compliance_due_soon` promoted to `action` bucket, sort_order 20 (before marketplace); fix deployed and verified | Regression guard pending; displacement check pending |
| E-005 | Attention Engine positioning | **Built verified** | Low (code-read) | Aggregation (core) | Low | Real engine (SQL aggregation + sort + ranking + realtime); not branding | — |
| E-015 | Portfolio Health | **Built verified** | Low (code-read) | Derived view | Low | Live-computed SQL function (not stored snapshot); realtime-refreshed | Execute: change source, reload, verify reflection |
| E-016 | Overnight/daily operational summary | **Half-built** | Low (code-read) | Derived view | Medium | Weekly summary infrastructure built (settings, RPC, edge fn, UI); **no automated scheduler** | Wire cron/pg_cron to fire `sendWeeklySummaryNow` on schedule |
| E-081 | Attention centre AI surfaces | **Built verified** | Low (code-read) | AI-on-aggregation | Low | Full pipeline: OpenAI + fallback + cache + quota + E2E test | Execute: confirm AI cites real inputs; test fabrication boundary |
| E-080 | Portfolio health AI | **Built verified** | Low (code-read) | AI-on-aggregation | Low | Per-property explainer + weekly portfolio insight; grounded in source data | Execute: verify grounding against property state |
| E-079 | AI maintenance KPI | **Missing** | Low (code-read) | AI-on-aggregation | Medium | No AI surface on Maintenance KPI Dashboard | No build implied unless prioritised — if prioritised, follow the CC / Portfolio Health AI pattern |
| E-140 | CC initial-load latency | **Measured / authz fix applied** | High (A/B measured) | Aggregation (core) | Low | ~62ms steady-state; authz resolve-once fix applied (−189 buffers); two deferred items remain | E-140a: flatten property-CTE correlated subquery; E-140b: implement progressive load |
| E-140a | CC property-CTE correlated subquery | **Deferred** | High (auto_explain) | Aggregation (core) | Low (scaling hygiene) | 127 per-property Seq Scans of leases; fine at 41 properties; degrades as leases grows | Flatten to join/aggregate before leases table grows (P3 — not urgent) |
| E-140b | CC progressive load | **Deferred** | High (A/B measured) | Aggregation (core) | Low | ~62ms is intrinsic to 11-CTE breadth; perceived-latency improvement requires progressive paint, not SQL micro-opt | Paint cheap/cached buckets first; hydrate aggregation after initial paint (P2 — highest perceived-latency lever) |

---

> **Caution on Low-confidence Built verdicts:** Rows marked **Built verified** with **Low confidence** (E-013, E-005, E-015, E-080, E-081) are provisional. **3 of 3 execution-checked findings moved from their code-read verdict**: E-014 (launch-blocker → resolved), E-140 (cold-start hypothesis → ruled out), E-141 (surfaced by execution — did not exist as a finding pre-execution). The 5 Built/Low rows are execution-unverified — treat them as "claimed verified by inspection" until the source→card→link→clear loop is executed.
>
> † *Risk column: where inherent severity and residual risk diverge, both are shown (e.g. E-141: **High inherent / Low residual**). Single values indicate both dimensions are equal — inherent risk was never elevated or has been fully mitigated.*

## E-013 — Command Centre / Attention Centre

### Claimed scope
Hub that aggregates attention items across the platform.

### Observed repository state
The Command Centre is implemented in [CommandCenterPage.jsx](src/pages/CommandCenterPage.jsx) backed by [commandCenterService.js](src/services/commandCenterService.js) which calls the [`command_center_items`](supabase/command_center_items.sql) SQL function (1577 lines). This is a real aggregation surface:

- **SQL function:** Single `command_center_items(p_account_id, p_limit)` RPC with 11 UNION ALL CTEs covering payments, maintenance requests, work orders, leases, preventive maintenance, compliance, notifications, marketplace jobs, automation runs, security alerts, and long-vacant properties.
- **Client-side merge:** Two additional sources merged in JS — `list_rr_attention_items` (Renters Rights) and `getPlComplianceCommandItems` (Poland compliance).
- **Sorting:** Bucket (urgent > action > upcoming > recent) → sort_order → age → due_days → item_key.
- **Bucketing:** Items classified into urgent/action/upcoming/recent with per-bucket limits.
- **Filtering:** Category filter UI (finance, maintenance, contractor, lease, compliance, preventive, marketplace, security).
- **Linkage:** Every item has a `link_path` pointing to the entity detail page (verified: `/tenants/<id>`, `/finance`, `/maintenance-inbox`, `/work-orders/<id>`, `/properties/<id>`, `/settings/security-audit`, `/compliance/poland`).
- **Realtime:** Subscribed to 13 Supabase realtime channels for live reload on source changes.

### Source-event provenance
See E-014 source-wiring matrix below.

### Verb tested
**CODE-READ ONLY.** Traced every CTE's WHERE clause and link_path. All 21 Command Centre security/isolation contract tests pass. E2E test `command-center-ai.spec.js` exists for AI action drill-through. No live instance available for full loop execution.

### Layer classification
Command Centre (aggregation core).

### Verdict
**Built verified** (code-read confidence)

### Confidence
Low (code-read only — the full source→card→link→resolve loop was not executed)

### What works
- Real aggregation from 11 SQL source CTEs + 2 client-side merges
- Sort/rank/bucket logic with priority-based ordering
- Link paths point to valid application routes
- Realtime subscriptions for live refresh across 13 source tables
- Account isolation enforced via `assert_manage_account_access` + feature gate
- Category and severity filtering in UI
- Security alert surfacing with configurable severity threshold

### What is stubbed / incomplete / lies
- No resolve/dismiss buttons in UI — but this is by design: items reflect live conditions and disappear when conditions clear. This is sound architecture, not a gap.

### Next untaken step
Execute the full loop per source against a running instance: create overdue rent → verify card → click → verify target page → pay rent → verify card clears.

### Risk
Low

---

## E-014 — Attention items aggregation

### Claimed scope
Aggregates finance, maintenance, compliance, documents, HMRC into a unified attention surface.

### Observed repository state
The `command_center_items` SQL function aggregates from the following source tables:

### Source-Wiring Matrix (execution-verified 2026-06-29)

| Source | Wired? | Item types | Source table(s) | Evidence |
|---|---|---|---|---|
| **Finance** | **YES** | `overdue_rent`, `due_soon_rent`, `pending_quote_approval`, `invoice_awaiting_approval`, `long_vacant_property` | `payments`, `work_order_financials`, `properties` | Lines 80–160, 639–703, 1448–1502 |
| **Maintenance** | **YES** | `request_without_work_order`, `triage_over_24h`, `high_priority_unresolved`, `stuck_waiting_over_48h`, `work_order_overdue`, `stalled_in_progress_repair`, `long_running_repair`, `repeated_repairs_property`, `pending_cancellation_request`, `recently_updated_open` | `maintenance_requests`, `work_orders` | Lines 161–638 |
| **Contractor** | **YES** | `work_order_without_contractor`, `contractor_no_response`, `work_order_blocked_follow_up` | `work_orders` | Lines 370–489 |
| **Leases** | **YES** | `lease_expired`, `lease_expiring_soon`, `lease_renewal_in_progress` | `leases` | Lines 763–876 |
| **Preventive maintenance** | **YES** | `preventive_task_overdue`, `preventive_task_due_soon` | `preventive_maintenance_tasks` | Lines 877–958 |
| **Compliance** | **YES** | `compliance_overdue`, `compliance_due_soon`, `compliance_missing_setup` + PL compliance + Renters Rights | `compliance_items` + client-side RPCs | Lines 959–1115 + JS merge |
| **Notifications** | **YES** | `notification_alert` (unread only) | `notifications` | Lines 1116–1160 |
| **Marketplace** | **YES** | `marketplace_ready_to_submit`, `marketplace_failed_submission`, `marketplace_manual_follow_up`, `marketplace_quote_received` | `external_marketplace_jobs` | Lines 1161–1295 |
| **Automation** | **YES** | Automation signals (property_health_watch etc.) | `automation_runs` | Lines 1312–1381 |
| **Security** | **YES** | `security_alert` (configurable severity) | `security_anomaly_alerts` | Lines 1382–1447 |
| **Documents** | **N/A — no expiry to wire** | — | `documents` (41 cols, zero expiry fields) | File management only (upload, scan, tag, version, review). Cert expiry lives in `compliance_items`, which IS wired. |
| **HMRC** | **NOT WIRED (correct)** | — | — | Deferred-by-design: sandbox-only, gated. See below. |

### Verb tested
**EXECUTION-VERIFIED 2026-06-29.** Three-step verification against running Supabase instance:

1. **Step 1 (gating check):** Documents page is ungated (universal). Compliance Safe gated at `starter` (all paying users). Neither is blocked.
2. **Step 2 (seed-and-walk):** Inserted overdue gas safety cert into `compliance_items` for Starlight Properties → appeared in CC as `compliance_overdue / urgent / due_days = -14`. Also seeded EPC due-soon (+16 days, within 30-day window) — matched SQL filter but pushed off by 80-item LIMIT because `compliance_missing_setup` (bucket='action', rank 2) outranks `compliance_due_soon` (bucket='upcoming', rank 3). Test data cleaned up.
3. **Step 3 (schema verification):** `documents` table has 41 columns, zero expiry/due_date fields. Purely file management.

### Three compliance tracking systems (discovered during verification)

| System | Table | Rows | Wired to CC? | Own UI surface |
|---|---|---|---|---|
| **Compliance Calendar** | `compliance_items` | 18 (all sandbox accounts) | **YES** — overdue, due_soon, missing_setup | PropertyComplianceCard (overdue/due-soon/OK indicators) |
| **Compliance Safe** | `tenancy_compliance_items` | 0 | **NO** — has own dedicated page | ComplianceSafePage (expires_at, expiring-soon/expired counts) |
| **Compliance Checklists** | `compliance_checklist_items` | 0 | **NO** — part of Compliance Safe detail view | Checklist sub-items within ComplianceSafePage |

### Layer classification
**Command Centre finding** — the original "Documents not wired = launch blocker" was an over-classification based on code-read only. Third finding in this lane to move when checked against execution (after HMRC and E-140 cold-start).

### Verdict
**Built verified** — 11 of 12 source categories wired. The "Documents" gap does not exist: `documents` table is file management with no expiry to wire; cert expiry lives in `compliance_items`, which IS wired. HMRC correctly absent (deferred-by-design).

### Confidence
**High** (execution-verified with seed-and-walk test)

### What works
- 11 source categories with 30+ distinct item types, all verified
- Compliance cert expiry → CC pipeline confirmed end-to-end (seed test)
- PropertyComplianceCard surfaces per-property overdue/due-soon on property detail pages
- Compliance Safe has independent full expiry tracking for tenancy-level documents
- Finance enrichment, multi-jurisdictional compliance (UK RR + Poland), security alerts, marketplace lifecycle

### Minor finding → E-141 (FIXED)
`compliance_due_soon` originally used `bucket = 'upcoming'` (rank 3) and `sort_order = 57`. With enough marketplace action items in the UNION, this caused due-soon certs to fall silently past the 200-item global LIMIT (and the 80-item default). A cert due in 16 days produced zero CC signal. Promoted to E-141 on user challenge — "trace before you label." **Root cause, fix, and execution verification are in E-141 below.** Fix applied 2026-06-29.

### HMRC — not wired (DEFERRED-BY-DESIGN — correct)
Sandbox-only, read-only, gated from everyone including root. **Revisit trigger:** wire HMRC into CC only when the module goes live (real submissions enabled, beyond sandbox). Tracked with E-135 as intentional deferral.

### Next untaken step
None remaining. Bucket-priority defect promoted to E-141 and fixed. HMRC wiring deferred until live-submission go-live (E-135).

### Risk
**Low** — The original "High" was based on a code-read inference that cert expiry had no CC surface. Execution proved it does. Bucket-priority ordering defect (E-141) is now fixed — due-soon certs appear at the top of the action bucket, before any marketplace items.

### Workbook update
Observed Repo State: 11/12 sources wired (Documents has no expiry to wire; HMRC deferred-by-design) · Observed Verdict: Built verified · Confidence: High (execution-verified) · Stopping Point: Compliance cert expiry→CC pipeline confirmed end-to-end · Next Untaken Step: Tune compliance bucket priority · Evidence Paths: `supabase/command_center_items.sql`, `src/components/PropertyComplianceCard.jsx`, `src/pages/compliance/ComplianceSafePage.jsx`, `src/pages/Documents.jsx`

### Methodology note
Third finding in this lane where a code-read conclusion changed when checked against execution:
1. **HMRC** — code-read said "not wired = launch blocker"; execution showed sandbox-only, correctly absent
2. **E-140** — code-read said "57ms cold-start planning"; execution showed plan_time = 0.00ms, pool runs warm
3. **E-014 Documents** — code-read said "documents not wired = launch blocker"; execution showed `documents` table has no expiry field, cert expiry lives in `compliance_items` which IS wired
---

## E-141 — Command Centre: compliance_due_soon silently dropped by 200-item LIMIT

### Claimed scope
`compliance_due_soon` items (cert due within 30 days) must appear in Command Centre.

### Root cause chain

Three-way interaction in `command_center_items.sql`:

1. **`cfg` CTE** clamps max_items hard at 200: `greatest(1, least(coalesce(p_limit, 80), 200))`
2. **`compliance_due_soon`** had `bucket = 'upcoming'` (rank 3) and `sort_order = 57`
3. **`limited_marketplace_job_items`** contributes 48 items at action bucket (sort_orders 33–35)

With 34 urgent + 142+ action items already present, the combined total exceeded 200. Items are sorted `bucket_rank → sort_order`, placing due-soon (rank 3, sort_order 57) at positions 201–202. Silent cut. An EPC cert due in 16 days: zero CC signal.

### Discovery methodology: flood test → bisect

E-014 seed test (see above) surfaced the problem: `compliance_overdue` appeared in CC (urgent bucket); `compliance_due_soon` did not, despite seeding an EPC due in 16 days. User challenged the initial "minor polish" label and required the root cause to be traced before filing a verdict.

**MATERIALIZED hypothesis (ruled out first):** Made `compliance_due_items`, `compliance_missing_setup`, `limited_compliance_items`, and `unioned` all MATERIALIZED. No effect. Ruled out planner-inlining / constraint-propagation as the cause.

**Bisect approach:**
1. Tested compliance-only UNION (drop all non-compliance CTEs from `unioned`) → both `compliance_overdue` and `compliance_due_soon` appeared
2. Re-added `limited_payment_items` → still appeared
3. Re-added `limited_request_items`, `limited_work_order_items`, `limited_lease_items`, `limited_preventive_items` → still appeared (first 6 CTEs)
4. **Re-added `limited_marketplace_job_items`** → `compliance_due_soon` fell to zero
5. Confirmed: `limited_marketplace_job_items` alone (48 items, sort_orders 33–35, action bucket) was the trigger

**Why marketplace specifically:** At the default 80-item limit, 34 urgent items fill the first 34 slots. 48 marketplace items (sort_orders 33–35, action bucket, rank 2) fill the next 48 slots — total 82, exceeding the 80-item budget. `compliance_due_soon` at rank 3 / sort_order 57 never reached position 80.

### Fix applied (2026-06-29)

Two changes to `supabase/command_center_items.sql`:

**Change 1 — bucket promotion** (line ~1064):
```sql
-- Before:
'upcoming'::text,  -- bucket

-- After:
'action'::text,    -- bucket (was 'upcoming', now 'action')
```

**Change 2 — sort order** (line ~1087):
```sql
-- Before:
57 as sort_order

-- After:
20 as sort_order   -- just after compliance_overdue (19), before marketplace (33)
```

This places due-soon certs immediately after overdue certs in the sort hierarchy: overdue (urgent, sort 19) → due-soon (action, sort 20) → marketplace (action, sort 33+) → setup nudges (upcoming, sort 59+).

### Verification (execution-verified 2026-06-29)

Function re-deployed via `docker cp` + `psql -f`. Query against running Supabase instance with test data seeded (1 overdue + 2 due-soon certs):

```
 bucket | sort_order |           item_type            | count
--------+------------+--------------------------------+-------
 urgent |         12 | lease_expired                  |    10
 urgent |         13 | marketplace_failed_submission  |     6
 urgent |         15 | stuck_waiting_over_48h         |    14
 urgent |         18 | security_alert                 |     2
 urgent |         19 | compliance_overdue             |     1
 urgent |         25 | contractor_no_response         |     1
 action |         20 | compliance_due_soon            |     2  ← FIXED: was absent, now at top of action
 action |         33 | marketplace_ready_to_submit    |    30
 action |         34 | marketplace_manual_follow_up   |     6
 action |         35 | marketplace_quote_received     |     6
 action |         44 | long_running_repair            |     2
```

With 34 urgent + 2 due-soon = 36 items, 44 remaining slots in the 80-item budget go to marketplace (42) and long-running repair (2). Total = 80, budget exact. No cert is silently dropped.

Test data (3 seeded `compliance_items` rows) cleaned up after verification. Test functions (`_test_cc_compliance`, `_test_compliance_items`) dropped from DB.

### Why "minor polish" was wrong

- A gas safety certificate due in 16 days is a statutory compliance obligation. Silent CC non-appearance is a **functional gap**, not a priority-ordering preference.
- The miss was invisible: no error, no fallback card, no indicator — the cert simply did not appear.
- 16 days is within the legal notice period for gas safety renewal in England.
- The PropertyComplianceCard on the property detail page may show the cert, but the CC is the only surface that aggregates compliance signals across all properties simultaneously — if a landlord has 10 properties, the CC is the single-screen warning system.

### Verdict
**Fixed** (execution-verified 2026-06-29)

### Confidence
**High** (seed test confirmed absence before fix, confirmed presence after fix)

### Risk
**High inherent severity / Low residual risk.**

- **Inherent:** A due-soon statutory cert (e.g. gas safety, EPC) producing zero Command Centre signal defeats Tenaqo's core prevention promise — "surfaces what needs attention before it lapses." Silent non-appearance at the shipping limit (80 items) is a functional gap, not a priority-ordering preference. The inherent severity is High.
- **Residual:** The fix is execution-verified at the shipping limit. Due-soon certs (action/sort_order 20) now surface before marketplace items (action/sort_order 33+). Overdue certs were never at risk. The residual risk is Low.
- **Current status:** Fixed and execution-verified; regression guard pending. The residual is the operative current-state number. High inherent is the severity that applies if the fix regresses — it justifies requiring a guard, not re-prioritising active work.

### Next untaken step

Two follow-ups remain before this can be closed:

1. **Regression guard:** Seed a realistic CC volume (≥80 items including marketplace, lease, maintenance, and preventive items). Assert that both `compliance_overdue` AND `compliance_due_soon` items remain visible at the default 80-item limit AND at the max 200-item limit. Assert that setup nudges and marketplace items do not outrank statutory due-soon items. This is the same flood-test discipline that found the original bug — turned on the fix itself.

2. **Displacement check:** Verify that promoting `compliance_due_soon` to action/sort_order 20 did not silently push higher-value repair, contractor, security, or urgent items past the limit. "What appeared?" is only half the question; "What did we displace?" is the other half and requires the same bisect methodology used in the original fix.

---

## E-005 — Attention Engine positioning

### Claimed scope
"What needs attention today?" — is there a real engine?

### Observed repository state
This is a **real engine**, not branding over a query:

1. **Aggregation:** `command_center_items` SQL function with 11 CTEs scanning real source tables with time-based conditions.
2. **Ranking:** Multi-level sort — bucket priority (urgent/action/upcoming/recent), then sort_order (numeric), then age/due.
3. **Severity classification:** Items classified as urgent/action/info based on source conditions (overdue = urgent, due-soon = action, recent = info).
4. **Filtering:** Category filter with 8 categories, each with item count badges.
5. **Realtime refresh:** 13 Supabase channels trigger reload on any source change.
6. **AI layer:** `generate-attention-insight` edge function produces an operator briefing grounded in the same `command_center_items` data.
7. **Dedup:** Implicit via distinct `item_key` prefixes per CTE (e.g., `payment-overdue-<id>`, `maint-triage-<id>`).

The word "engine" is justified: it has aggregation, ranking, filtering, realtime, and AI. It is not a static dashboard.

### Verb tested
**CODE-READ ONLY.** All 21 contract tests pass. E2E test confirms AI action link navigation.

### Layer classification
Command Centre (aggregation core).

### Verdict
**Built verified**

### Confidence
Low (code-read only)

### What works
- Genuine multi-source aggregation engine
- Priority-based ranking with configurable severity
- Realtime refresh eliminates polling
- AI briefing layer adds synthesized operator intelligence

### What is stubbed / incomplete / lies
- Nothing at the engine level. The gaps are at the source-wiring level (see E-014).

### Next untaken step
None at the engine level.

### Risk
Low

---

## E-015 — Portfolio Health

### Claimed scope
Snapshot risk/health view — is it computed from live source state or a stored/stale snapshot?

### Observed repository state
The Portfolio Health Dashboard is at [PortfolioHealthDashboardPage.jsx](src/pages/PortfolioHealthDashboardPage.jsx), backed by:

1. **`portfolio_health_snapshot` SQL function** ([portfolio_health_snapshot.sql](supabase/portfolio_health_snapshot.sql)) — a `LANGUAGE sql` function (NOT a materialized view). It computes occupancy, finance, maintenance, and work order metrics directly from current source tables at call time. Every call gets fresh data.
2. **`portfolio_attention_items` RPC** — attention items derived live from source tables.
3. **`portfolio_weekly_summary` RPC** — weekly summary computed from current state.
4. **`listPropertyOperationalHealthScores`** — per-property health scores.
5. **Realtime subscriptions** on 7 tables (properties, tenants, payments, leases, maintenance_requests, work_orders, account_report_settings).

**Key question answered: Live, not stale.** The function is a SQL function, not a materialized view or cached table. Each call queries the current state. The realtime subscriptions trigger re-fetch on source change. There is also a client-side `snapshotCache` but it has a TTL and is busted by realtime events.

### AI surfaces (also covering E-080)
- **Property Health Explainer:** `generate-property-health-explainer` edge function produces per-property AI insight.
- **Weekly Portfolio Insight:** `generate-weekly-portfolio-summary` edge function produces weekly AI summary.
- Both have fallback (deterministic when no API key), cache (with TTL + source hash), and quota tracking.

### Verb tested
**CODE-READ ONLY.** Portfolio health service tests pass. E2E test `portfolio-health-ai.spec.js` confirms AI drill-through to property record.

### Layer classification
Derived view.

### Verdict
**Built verified** — live-computed, realtime-refreshed, with AI insight layers.

### Confidence
Low (code-read only — the key test "change source condition → reload → verify reflection" was not executed)

### What works
- Live SQL computation from current source tables
- Realtime refresh on 7 tables
- Arrears aging breakdown (0-7, 8-30, 30+ days)
- Maintenance pressure metrics (stalled, long-running, repeat repairs)
- Lease attention items (expired, expiring soon, renewal in progress)
- AI property health explainer with risk drivers and recommended next step
- AI weekly portfolio insight with wins, risks, focus areas
- Email reporting settings UI (weekly_summary_enabled, day, hour, timezone)

### What is stubbed / incomplete / lies
- **Weekly email delivery is manual-trigger only.** The `sendWeeklySummaryNow` function exists and works, but there is no automated scheduler (cron, pg_cron, or edge function schedule) that fires it on the configured schedule. The `weekly_summary_enabled` flag is stored but never consumed by an automated process. This overlaps with E-016.

### Next untaken step
Execute: add a property with overdue rent → load Portfolio Health → verify overdue_amount reflects it → pay rent → reload → verify it clears.

### Risk
Low

---

## E-016 — Overnight / daily operational summary

### Claimed scope
Claimed **Planned** — confirm genuinely absent vs partially wired.

### Observed repository state
**Half-wired — weekly manual, not overnight/daily automated.**

Infrastructure present:
1. **`account_report_settings` table** — stores `weekly_summary_enabled`, `weekly_summary_day`, `weekly_summary_hour`, `timezone`.
2. **`getAccountReportSettings` / `upsertAccountReportSettings`** — CRUD for settings.
3. **`getWeeklyPortfolioSummary` RPC** — computes summary from live data.
4. **`sendWeeklySummaryNow`** — generates summary + creates notifications for manager-role members.
5. **`generate-weekly-portfolio-summary` edge function** — AI weekly insight.
6. **UI** — Settings accordion on Portfolio Health page with day/hour/timezone pickers + "Send Now" button.

Infrastructure absent:
- **No automated scheduler.** No cron job, pg_cron entry, edge function schedule, or background worker calls `sendWeeklySummaryNow` automatically.
- **No daily frequency.** Only weekly cadence is supported.
- **No overnight timing.** The scheduled hour is stored but never acted on.

### Verb tested
**CODE-READ ONLY.** Searched for cron, schedule, pg_cron across the codebase — no hits relevant to weekly summary delivery.

### Layer classification
Derived view.

### Verdict
**Half-built** — weekly summary infrastructure is functional (manual trigger works), but the automated delivery claimed by "Planned" is the missing piece. More accurately: the *plumbing* is built, the *valve* (scheduler) is not.

### Confidence
Low (code-read only)

### What works
- Weekly summary RPC computes live data
- "Send Now" manually delivers to manager-role users via notifications
- Settings UI allows configuration of day/hour/timezone
- AI weekly portfolio insight (separate from delivery)

### What is stubbed / incomplete / lies
- `weekly_summary_enabled` flag is stored but never consumed by an automated process
- No daily/overnight cadence — only weekly
- "Planned" is accurate for automated delivery; "Half-built" for the infrastructure

### Next untaken step
Wire pg_cron or edge function schedule to fire `sendWeeklySummaryNow` for accounts where `weekly_summary_enabled = true` at the configured day/hour.

### Risk
Medium — users who enable weekly summaries expect to receive them. The flag stores a promise the system doesn't keep.

---

## E-081 — Attention Centre AI surfaces

### Claimed scope
AI "what needs attention" — must cite real inputs, not invent items.

### Observed repository state
Full AI pipeline at [generate-attention-insight/index.ts](supabase/functions/generate-attention-insight/index.ts):

1. **Input grounding:** The edge function calls `command_center_items` RPC and `dashboard_snapshot` RPC to get real source data. The AI prompt is built FROM these items — the AI cannot invent items the engine didn't surface.
2. **Structured output:** JSON schema enforced (`attention_briefing` schema with `summary`, `priority`, `top_reasons`, `suggested_actions`, `confidence`, `source`).
3. **Fallback:** When no OpenAI API key or on error, `buildFallbackAttentionInsight` produces a deterministic briefing from the source data. No AI hallucination possible in fallback mode.
4. **Caching:** Cached in `ai_insights` table with TTL + source hash. Re-generates only when inputs change or cache expires.
5. **Quota control:** `checkAndReserveAiCall` with per-account rate limiting.
6. **Prompt run logging:** Every AI call logged in `ai_prompt_runs` with tokens, model, status.
7. **Payload clamping:** `clampAiInsightPayload` enforces size limits.
8. **Authorization:** Requires `assert_manage_account_access` + `assert_account_feature_access("command_center")`.

### Verb tested
**CODE-READ ONLY.** All 127 AI-related contract tests pass. E2E test `command-center-ai.spec.js` verifies owner can follow action link from insight to target surface. Edge function has full error handling for network failures, parse failures, and quota exhaustion.

### Layer classification
Command Centre (AI-on-aggregation).

### Verdict
**Built verified**

### Confidence
Low (code-read only — fabrication boundary not tested against live AI responses)

### What works
- AI input is grounded in real `command_center_items` data — cannot fabricate items
- Structured JSON output enforced by schema
- Fallback produces deterministic output (no hallucination)
- Suggested actions include `linkPath` and `entityId` — traceable to real entities
- Caching with source hash prevents stale insights
- Quota + rate limiting prevents cost overruns
- Prompt run audit trail

### What is stubbed / incomplete / lies
- The AI CAN produce suggested actions with `entityId` and `linkPath` that reference items from the input — but if the underlying condition resolves between insight generation and user interaction, the link could lead to a resolved state. This is inherent to cached insights, not a fabrication issue.

### Next untaken step
Execute: confirm AI cites real inputs by comparing `top_reasons` against actual `command_center_items`. Test with thin inputs (empty portfolio) to verify graceful degradation.

### Risk
Low

---

## E-080 — Portfolio health AI

### Claimed scope
AI health reasoning — grounded in source facts, no unsupported claims.

### Observed repository state
Two AI surfaces on the Portfolio Health Dashboard:

**1. Property Health Explainer** ([propertyHealthInsightService.js](src/services/propertyHealthInsightService.js)):
- Edge function: `generate-property-health-explainer`
- Per-property AI insight with category (healthy/attention_needed/high_risk), risk drivers, recommended next step
- `factsUsed` field explicitly shows non-AI facts used for the explanation
- E2E test: `portfolio-health-ai.spec.js` verifies drill-through to property record

**2. Weekly Portfolio Insight** ([weeklyPortfolioInsightService.js](src/services/weeklyPortfolioInsightService.js)):
- Edge function: `generate-weekly-portfolio-summary`
- Portfolio-level AI with headline, wins, risks, recommended focus, properties to watch, cashflow notes
- Used on Portfolio Health page with refresh button

Both follow the same pattern as E-081: OpenAI + fallback + cache + quota + structured output.

### Verb tested
**CODE-READ ONLY.** Property health insight helper and service tests pass. E2E test confirms drill-through.

### Layer classification
AI-on-aggregation (Portfolio Health).

### Verdict
**Built verified**

### Confidence
Low (code-read only)

### What works
- Per-property explainer with grounding via `non_ai_facts_used`
- Weekly portfolio insight with wins/risks/focus structure
- Both have fallback mode (deterministic, no hallucination)
- Property health card links to actual property record

### What is stubbed / incomplete / lies
- Nothing at the AI layer level.

### Next untaken step
Execute: verify grounding — compare `non_ai_facts_used` against actual property state.

### Risk
Low

---

## E-079 — AI maintenance KPI

### Claimed scope
KPI intelligence — derived from real maintenance events, not fabricated.

### Observed repository state
**No AI surface exists on the Maintenance KPI Dashboard.**

The [MaintenanceKPIDashboardPage.jsx](src/pages/MaintenanceKPIDashboardPage.jsx) imports:
- `getMaintenanceKpiSnapshot` — SQL RPC
- `getMaintenanceAttention` — SQL RPC
- `getMaintenanceRecentActivity` — SQL RPC
- `getMaintenanceFinancialAnalytics` — SQL RPC
- `getMaintenanceSlaAnalytics` — SQL RPC
- `getPreventiveMaintenanceOverview` — SQL RPC

**No AI insight service is imported.** No AI card component is rendered. No edge function `generate-maintenance-kpi-insight` exists. The only maintenance-related AI is `generate-maintenance-triage` which is used for individual request triage (in the maintenance inbox), not for KPI intelligence.

### Verb tested
**CODE-READ ONLY.** Searched for `maintenance.*kpi.*ai`, `maintenanceKpiInsight`, AI-related imports on the KPI page — zero hits.

### Layer classification
Command Centre finding — the AI-on-aggregation layer claimed for maintenance KPIs does not exist.

### Verdict
**Missing** — the "Built" claim in the workbook is incorrect. No AI intelligence layer exists on the Maintenance KPI Dashboard.

### Confidence
Low (code-read only — but this is an absence finding; absence is hard to miss)

### What works
- The non-AI Maintenance KPI Dashboard is a comprehensive operational surface with snapshot, attention items, financial analytics, SLA analytics, preventive overview, and activity feed.
- The `generate-maintenance-triage` edge function provides AI triage for individual requests (but this is a different feature).

### What is stubbed / incomplete / lies
- **E-079 is claimed Built but is Missing.** There is no AI maintenance KPI intelligence surface.

### Next untaken step
No build implied unless prioritised. If later prioritised, follow the pattern of `generate-attention-insight` / `generate-property-health-explainer` (input grounding in KPI snapshot + attention items, structured output, fallback, quota, cache). Non-AI KPI dashboard is functional and comprehensive — the gap is in the AI intelligence layer which is a differentiator, not a safety-critical surface.

### Risk
Medium — the non-AI KPI dashboard is functional and comprehensive. The gap is in the AI intelligence layer which is a differentiator, not a safety-critical surface.

---

## Final Deliverables

### 1. Phase 1 Summary Table
See table at top of report.

### 2. Layer Split

**Command Centre findings (this lane's backlog):**
- **E-014:** ~~Documents and HMRC source wiring missing~~ RESOLVED: Documents has no expiry to wire (file management only); cert expiry via `compliance_items` IS wired. HMRC deferred-by-design.
- **E-141:** ~~compliance_due_soon silently dropped by LIMIT trap~~ FIXED: bucket promoted to `action`, sort_order moved to 20. Execution-verified 2026-06-29. Regression guard and displacement check pending.
- **E-079:** AI maintenance KPI intelligence surface missing.
- **E-016:** Automated weekly summary delivery scheduler missing (manual-trigger only).
- **E-140a:** Property-CTE correlated subquery — 127 per-property Seq Scans of leases. Scaling hygiene (fine now; degrades as leases grows). P3 deferred.
- **E-140b:** Progressive load — ~62ms is intrinsic to 11-CTE breadth; perceived-latency improvement requires progressive paint, not SQL micro-opt. P2 deferred (highest perceived-latency lever).

**Source-module findings (handed off):**
- None identified. The gap is in the aggregation layer, not in the source modules.

### 3. Source-Wiring Matrix
See E-014 section above.

### 4. Classification

| Finding | Classification | Reason |
|---|---|---|
| E-014: Documents not wired | ~~Launch blocker~~ **Resolved** | Execution-verified: `documents` table has no expiry field (file management only). Cert expiry lives in `compliance_items`, which IS wired to CC. Bucket-priority defect promoted to E-141 and fixed. |
| E-141: compliance_due_soon silently dropped | **Fixed / High inherent / Low residual** | Bisect-confirmed: `limited_marketplace_job_items` (48 items) pushed due-soon certs past the LIMIT. Fix: bucket `'upcoming'→'action'`, sort_order `57→20`. Execution-verified 2026-06-29. Inherent severity High (defeats prevention promise); residual Low (fix verified at shipping limit). Status: fixed but undefended — regression guard and displacement check pending. |
| E-014: HMRC not wired | **Deferred-by-design** | HMRC module is sandbox-only, read-only, live submission explicitly disabled, gated from everyone including root. No user has a real HMRC obligation. Wiring sandbox state into operator attention would be the bug. **Revisit trigger:** live-submission go-live. Sits with E-135 as tracked intentional deferral. |
| E-079: AI maintenance KPI missing | **Backlog** | Non-AI KPI dashboard is comprehensive. AI layer is a differentiator, not safety-critical. No build implied unless prioritised — if prioritised, follow CC / Portfolio Health AI pattern. |
| E-016: No automated scheduler | **Doc gap → Backlog** | Weekly summary infrastructure works via manual trigger. Automated delivery is a quality-of-life feature. But the `weekly_summary_enabled` flag stores a promise the system doesn't keep — that should be documented or disabled. |
| E-140a: Property-CTE correlated subquery | **Deferred / P3** | Scaling hygiene — 127 per-property Seq Scans of leases, fine at current scale. Flatten to join/aggregate before leases grows. Not urgent. |
| E-140b: Progressive load | **Deferred / P2** | Highest perceived-latency lever. ~62ms is intrinsic to 11-CTE aggregation breadth; the SQL fix ceiling is ~5ms. Progressive paint addresses the lived complaint directly. |

### 5. Drift Assessment

| Area | Drift? | Breaks a verb? | Misleads user? |
|---|---|---|---|
| Documents → Command Centre | ~~Yes~~ **No** | N/A (no verb) | ~~Yes~~ **No** — `documents` table has no expiry field. Cert expiry lives in `compliance_items`, which IS wired. |
| compliance_due_soon bucket ordering (E-141) | ~~Yes~~ **No (fixed)** | **Yes (before fix)** | **Yes (before fix)** — due-soon cert silent miss. Fixed 2026-06-29. Regression guard and displacement check pending. High inherent / Low residual. |
| HMRC → Command Centre | **No** | N/A | **No** — absence is correct. Module is sandbox-only, gated from all users including root. Surfacing sandbox state as operator attention would be the actual bug. Converts to drift at live-submission go-live. |
| Weekly summary auto-delivery | **Yes** | No (manual works) | **Yes** — `weekly_summary_enabled` stores an unkept promise |
| E-079 "Built" claim | **Yes** | N/A (no verb) | No (users don't see the claim) |

### 6. E-140 — Initial-Load Latency (traced and measured)

**Hypothesis tested:** E-136's per-row SECURITY DEFINER RLS cost repeating on the aggregation path.

**Hypothesis falsified.** Three converging measurements:

| Method | Result |
|---|---|
| `relforcerowsecurity` + `rolbypassrls` check | postgres has `rolbypassrls = true`; BYPASSRLS overrides FORCE ROW LEVEL SECURITY. Confirmed: `maintenance_requests` query as postgres = 0.066ms / 1 buffer vs authenticated = 11.6ms / 1064 buffers. RLS does not fire inside the SECURITY DEFINER function. |
| `pg_stat_statements` (10 separate connections) | Mean exec: **60.5ms**, min 55.3ms, max 81.3ms, stddev 7.25ms. **Plan time: 0.00ms.** |
| Real client path (Node.js → Kong → PostgREST → DB → JSON) | First call: 297ms (cold-pool artifact, self-heals). **Steady state: ~75ms** (P50: 76.5ms, P90: 94.7ms). |

**Cold-start theory killed by `plan_time = 0.00ms`.** The earlier EXPLAIN ANALYZE warm-up (93→35ms) was partly instrumentation overhead. Real same-connection curve: 59→41ms (~18ms per-connection plan-caching effect). The 297ms first call is TCP + first backend + cold buffers — genuine cold-pool artifact. The ~75ms steady state is the per-load tax.

**Per-CTE buffer breakdown (auto_explain trace — NOTE: auto_explain inflates buffer counts ~3x and nested function timings ~4x vs real execution; use for relative ranking only):**

| Source CTE | Buffers (auto_explain) | Time (auto_explain) | Rows |
|---|---|---|---|
| **authz (materialized)** | **954** | **14.6ms** | 1 |
| property_items | 649 | 0.7ms | 0 |
| marketplace_job_items | 356 | 1.7ms | 48 |
| notification_items | 153 | 12.2ms | 80 |
| lease_items | 75 | 0.2ms | 10 |
| work_order_items | 39 | 0.4ms | 32 |
| request_items | 28 | 0.9ms | 14 |
| compliance_items | 10 | 0.9ms | 80 |
| payment_items | 9 | 0.2ms | 1 |
| security_alert_items | 9 | 0.1ms | 2 |
| preventive_items | 2 | 0.2ms | 0 |
| automation_items | 1 | 0.04ms | 0 |

**Real buffer count (pg_stat_statements, instrumentation-free):** ~2000/call pre-fix, ~1811/call post-fix. The auto_explain "6159" was ~3x inflated by catalog reads for nested function plan capture.

**Cost decomposition (steady state ~62ms client / ~41ms DB):**
- ~38ms: 11-CTE aggregation breadth (intrinsic to query shape)
- ~3ms: authz overhead (after resolve-once fix)
- ~21ms: HTTP/PostgREST/JSON serialization (infrastructure, not SQL-fixable)

**Authz resolve-once fix (applied):**

Created `assert_command_center_access(uuid)` — computes `user_is_root_operator()` once and does both management-access and feature-access checks in a single pass. Third instance of the E-136/E-138 "resolve membership once" pattern.

A/B measurement (50 warm client-path calls each, back-to-back, controlled):

| Metric | Pre-fix | Post-fix | Delta |
|---|---|---|---|
| Client P50 | 61.5ms | 60.7ms | -0.8ms (noise) |
| Client P90 | 72.2ms | 69.6ms | -2.6ms |
| Client Max | 93.5ms | 77.6ms | **-15.9ms** |
| Cold start | 97.7ms | 77.5ms | **-20.2ms** |
| DB Mean | 43.25ms | 40.80ms | -2.45ms |
| DB Max | 68.57ms | 51.62ms | **-16.95ms** |
| Buffers/call | 2000 | 1811 | **-189 (9.5%)** |

Security verification: 15/15 command center tests pass. Error paths verified — unauthenticated, unauthorized tenant, null account all raise with identical messages.

The auto_explain trace predicted ~15ms mean saving; the A/B measured ~2ms. The buffer count (−189, 9.5%) is the reliable signal — exact, warmth-independent, confirms one redundant root-operator scan removed. Timing deltas are noise (P50) to modest (mean) to significant only at tail/cold.

**Pool warmth question: CLOSED.** The A/B (50 back-to-back calls) showed steady-state holds at ~60ms client / ~41ms DB with same-backend plan-cache benefit showing through. PostgREST's pool serves warm backends in steady state. The authz fix's saving correctly overlaps the warm-pool saving — which is why the measured improvement is small. This was the predicted outcome if pool runs warm; it does.

**Methodology note:** Size perf fixes from `pg_stat_statements` + client-path A/B, not from auto_explain nested costs. `auto_explain` with `log_nested_statements` reads catalog pages for every nested function call, inflating buffer counts ~3x and per-function timings ~4x. The 6159-buffer trace and the 3.7–4.3ms `user_is_root_operator` readings were instrumentation artifacts; real cost is ~2000 buffers and sub-millisecond calls.

**Remaining items:**

1. **Property CTE correlated subquery** — 127 per-property Seq Scans of leases. Fine at 41 rows, scales badly. Flatten to join/aggregate before leases grows. Scaling hygiene, not urgent.
2. **Progressive load** — highest perceived-latency lever. ~62ms is one of several requests firing on Command Centre page load; the user's "slow initially" is the aggregate page load plus cold first paint, not this query in isolation. Painting cheap/cached buckets first and hydrating the aggregation after addresses the lived complaint directly. This is the move that'll change what the user feels; the SQL micro-opts are correctness/scaling hygiene.

**Verdict:** Not E-136 (RLS bypassed, proven). Not cold-start (plan_time zero). Pool runs warm (proven by A/B). Real ~62ms per-load tax dominated by aggregation breadth. Authz resolve-once fix applied (−189 buffers, −2ms mean, −17ms tail — done on principle, not for a dramatic number). SQL micro-opts are hygiene; progressive load is the lever.

### 7. Design observations (not findings)

**Dedup model:** A single maintenance request can generate multiple attention items from different CTEs (e.g., `request_without_work_order` + `high_priority_unresolved` + `triage_over_24h`). Each uses a different `item_key` prefix so they're not deduplicated. This is a legitimate design choice — each highlights a different actionable signal — but could produce noise for a property with one overdue high-priority request: three cards, one condition. Consider a "collapse related items" UI or consolidation CTE if this proves noisy in practice.

**Resolution model:** Items have no explicit resolve/dismiss action in the CC UI. They disappear when the underlying condition clears (payment paid, work order completed, etc.). This is architecturally sound — it prevents false resolution where a user dismisses a card but the problem persists. The one exception: notifications have `is_read` flag, automation_runs have `state`, security alerts have `status`. These are the only items with explicit lifecycle.
