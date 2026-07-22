# E-170 Evidence Report

**Fix:** Finance snapshot phantom accrual elimination for imported tenancies without activation.
**Date:** 2026-07-22
**Branch:** codex/hmrc-e1-hardening
**Executed by:** E-170 validation suite (`bash e170-suite/run.sh`)
**Evidence tag:** EXECUTED_INTEGRATION_DB — local disposable Supabase (127.0.0.1:61021)

---

## Summary

E-170 fixes the finance snapshot function so that imported tenancies without a
`tenancy_finance_activations` row return `balance_state='unknown_payment_history'`
and `remaining=0` instead of accruing phantom rent from `lease_start_date`.

Production evidence (screenshots captured before fix):
- **Alice**: £38,750 Overdue (31 × £1,250, lease_start 2024-01-01)
- **Bob**: £28,600 Overdue (26 × £1,100, lease_start 2024-06-01)

### Test count summary (Gate-2 amended)

| Suite | Passing | Notes |
|-------|---------|-------|
| Baseline (RED + GREEN + Gate 1) | 15/15 | RED-G1 via direct SQL; GREEN-G1 via snapshot |
| Deny | 12/12 | D-04 expanded to 3 sub-tests + PostgREST call |
| Verify | 14/14 | |
| Edge-case | 7/8 + 1 known defect | EC-02 KNOWN DEFECT E-172 (see Gate 2) |
| E2E (browser) | 6/6 | Playwright / Chromium 2026-07-22 |
| **Total** | **54 passed, 1 failed — known defect E-172** | EC-02 fails until E-172 ships |

---

## STEP 0 — Gate 1 ownership determination

**Determination: (a) — Gate 1 defect belongs to E-170.**

**Locus:** `supabase/finance_snapshot.sql`, `property_lease_end` CTE (lines 184-205,
amended to lines 184-220 after the Gate 1 fix).

**Mechanism:** The CTE's `lease_end_date` subquery filters:
```sql
AND LOWER(COALESCE(l.renewal_status, 'active')) NOT IN ('ended')
```
For `renewal_status='ended'` no rows match → subquery returns `NULL` →
`COALESCE(NULL, CURRENT_DATE) = CURRENT_DATE` → `accrual_end = CURRENT_DATE`.
A properly-ended tenancy accrued to today regardless of its `lease_end_date`.

**E-172 distinction:** E-172 is about `is_tenancy_ended = false` for import-defaulted
`renewal_status='active'` rows (wrong DB default on import). These are orthogonal bugs.
The accrual fall-through for explicitly-ended rows is entirely within this CTE.

**Fix applied (Gate 1):** `property_lease_end` CTE now uses a `CASE WHEN EXISTS
(non-ended leases) THEN (active-lease subquery) ELSE (ended-lease subquery) END` to
return the most recent ended lease's `lease_end_date` when no active leases exist.

---

## E-172-INV Finding (READ/SELECT-ONLY investigation)

Causal chain: `leases.renewal_status` DB column has default `'active'::text` (NOT NULL).
The spreadsheet import INSERT omits `renewal_status`; the DB default fires,
inserting `'active'` for every imported lease.

The pre-fix `property_tenure` CTE matched `renewal_status NOT IN ('ended')`
→ included 'active' rows → accrued from `lease_start_date` → phantom balance.

E-170 eliminates the phantom regardless of `renewal_status` by requiring an
explicit `tenancy_finance_activations` row before any balance is shown.

E-172-FIX (deferred) would correct the DB default and is NOT required to
eliminate phantoms — E-170 already eliminates them.

---

## Test Execution Results

### Phase 1 — RED baseline (pre-fix phantom reproduction) — 5/5 PASS

Pre-fix function applied from `git show HEAD:supabase/finance_snapshot.sql` via psql stdin.
Schema cache reloaded; 3 s wait. Snapshot called as authenticated ownerA.

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| RED-01: Alice remaining | ≈ 31 × £1,250 = £38,750 | **£38,750** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| RED-02: Alice paymentStatus | overdue | **overdue** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| RED-03: Bob remaining | ≈ 26 × £1,100 = £28,600 | **£28,600** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| RED-04: Bob paymentStatus | overdue | **overdue** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| RED-05: outstanding_income ≥ Alice + Bob | ≥ £67,350 | **£75,550** (includes other seed properties) | EXECUTED_INTEGRATION_DB 2026-07-22 |

**Months confirmation** (2026-07-22 execution date):
- Alice: (2026-07) − (2024-01) = 30 month gap + 1 inclusive = 31 months × £1,250 = £38,750
- Bob:   (2026-07) − (2024-06) = 25 month gap + 1 inclusive = 26 months × £1,100 = £28,600

### Phase 3A — Gate 1 RED (old CTE returns NULL for ended tenancy — direct SQL) — 1/1 PASS

The pre-E-170 function (git HEAD) does not output `accrualThrough` (E-170 addition),
so the defect is proved via direct SQL execution of the old CTE subquery.

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| RED-G1: old CTE subquery for ended tenancy | NULL (no matching row) | **NULL** | EXECUTED_INTEGRATION_DB 2026-07-22 |

**What this proves:** The old `property_lease_end` CTE subquery — filtering
`LOWER(COALESCE(renewal_status,'active')) NOT IN ('ended')` — returns `NULL` for
a lease with `renewal_status='ended'`. `NULL` means `COALESCE(NULL, CURRENT_DATE) =
CURRENT_DATE` in the `property_accumulated` CTE → accrual runs to today.
Test file: `e170-suite/integration/e170.baseline.test.js`, describe Phase 3A.

### Phase 2 — GREEN result (post-fix, no activation) — 8/8 PASS

Post-fix function applied from working tree `supabase/finance_snapshot.sql` via psql stdin.
Schema cache reloaded; 3 s wait.

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| GREEN-01: Alice balanceState | unknown_payment_history | **unknown_payment_history** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-02: Alice remaining | 0 | **0** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-03: Alice paymentStatus | unknown | **unknown** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-04: Alice outstandingMinor | null | **null** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-05: Bob balanceState | unknown_payment_history | **unknown_payment_history** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-06: Bob remaining | 0 | **0** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-07: outstanding_income excludes Alice + Bob | Alice remaining=0, Bob remaining=0 | **both 0** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| GREEN-08: unknown_tenancy_count ≥ 2 | ≥ 2 | **12** (all unactivated accountA properties) | EXECUTED_INTEGRATION_DB 2026-07-22 |

### Phase 3B — Gate 1 GREEN (ended-tenancy accrual capped at lease_end, post-fix) — 1/1 PASS

Post-fix function (with Gate 1 CASE fix) already active from Phase 2. Fixture:
`renewal_status='ended'`, `lease_end_date='2024-06-30'`, activated from `coverage_start='2024-01-01'`.

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| GREEN-G1: accrualThrough = lease_end_date for ended tenancy | '2024-06-30' | **'2024-06-30'** | EXECUTED_INTEGRATION_DB 2026-07-22 |

**What this proves:** With the Gate 1 CASE fix, the `property_lease_end` CTE's ELSE
branch returns the ended lease's `lease_end_date`. The snapshot `accrualThrough` field
reflects the evidenced close date, not `CURRENT_DATE`.

### Deny tests — 12/12 PASS (Gate 3: D-04 expanded)

Guard messages asserted verbatim (not any-error). D-04 now has three sub-tests
disambiguating the PGRST202 error as permission-based denial, not a schema miss.

| Test | Expected | Actual guard / result | Evidence tag |
|------|----------|----------------------|--------------|
| D-01: future coverage_start (2099-01-01) | error /coverage_start may not be in the future/i | **"coverage_start may not be in the future: 2099-01-01. Use the current date or an earlier confirmed start date."** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-02: p_attests = false | error /activation requires explicit.../i | **"activation requires explicit prospective-completeness attestation (p_attests_prospective_completeness must be true)"** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-02b: p_attests = null | same guard | **same message** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-03: cross-account (ownerA → accountB property) | error /permission denied/i | **"permission denied — activate_tenancy_finance_tracking"** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-04a: function exists in pg_proc (6-arg, public schema) | row returned | **activate_tenancy_finance_tracking, pronargs=6** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-04b: authenticated role has execute privilege | has_function_privilege = true | **t** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-04c: anon role has NO execute privilege | has_function_privilege = false | **f** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-04 (PostgREST): anon call returns PGRST202/permission-denied | auth denial | **PGRST202 (proved by D-04a/b/c to be permission-based, not schema miss)** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-05: no activation → balanceState | unknown_payment_history | **unknown_payment_history** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-05b: no activation → remaining | 0 | **0** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-05c: no activation → outstandingMinor | null | **null** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| D-05d: no activation → paymentStatus | unknown | **unknown** | EXECUTED_INTEGRATION_DB 2026-07-22 |

**D-04 disambiguation (Gate 3):** D-04a proves the function exists (not a missing-function
schema miss). D-04b proves `authenticated` has execute privilege (function is reachable
when signed in). D-04c proves `anon` has NO execute privilege. Together, the PGRST202 from
the anon call is specifically permission-based denial — not an ambiguous schema-cache miss.

### Verify tests — 14/14 PASS

Activation uses `p_attests_prospective_completeness=true`, `coverage_start=monthStart(2)`, `opening_balance_minor=5000`.

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| V-01: P0 typed fields present | all non-null after activation | **PASS** — balanceState='known', outstandingMinor/paidMinor/expectedMinor numeric, accrualThrough/coverageStart/balanceBasis string, reasonCode null | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-01b: coverageStart matches activation date | monthStart(2) | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-01c: balanceBasis | user_attested_opening_balance | **'user_attested_opening_balance'** (written by activate RPC) | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-02: outstanding = opening + months×rent - paid | formula check | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-02b: expectedMinor includes opening balance | ≥ 5000 + 800×100 | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-03: coverage_state = prospectively_tracked | after activation | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-03b: prospectively_tracked has coverageStart + openingBalance | | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-03c: unknown → not_configured or history_unknown | | **PASS** — not_configured | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-04: second activation creates new row | new activation ID | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-04b: only one active row after second activation | balanceState=known, coverageStart=original | **PASS** (supersede mechanism confirmed) | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-05: unknown outstandingMinor = null | not in aggregate | **null** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-05b: unknown_tenancy_count ≥ 1 | | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-06: activate unknown → known | balanceState flips, count decreases | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| V-07: opening balance in outstanding immediately | outstandingMinor ≥ 25000 | **PASS** | EXECUTED_INTEGRATION_DB 2026-07-22 |

### Edge-case and DoD tests — 7 passed, 1 failed — known defect E-172 (Gate 2)

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| EC-01: is_tenancy_ended=true (renewal_status='ended') | true | **true** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-02: **KNOWN DEFECT E-172** is_tenancy_ended for imported lease | **true** (correct target) | **false** (bug live — FAILS) | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-03: PAYMENT_HISTORY_INCOMPLETE (payments, no activation) | reasonCode=PAYMENT_HISTORY_INCOMPLETE | **PAYMENT_HISTORY_INCOMPLETE** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-04: FINANCE_COVERAGE_START_UNKNOWN (no payments, no activation) | reasonCode=FINANCE_COVERAGE_START_UNKNOWN | **FINANCE_COVERAGE_START_UNKNOWN** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-05: over-correction regression | balanceState stays known after 4 payments | **PASS** — known, remaining ≥ 0 | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-06: P0-A accrual cap — active-labelled lease, past end_date | accrualThrough = leaseEnd (not today) | **PASS** — accrualThrough = monthStart(2) confirmed | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-07: paymentStatus=paid when outstanding=0 | paid | **paid** | EXECUTED_INTEGRATION_DB 2026-07-22 |
| EC-08: paymentStatus=overdue (activated, 3 months unpaid) | overdue | **overdue** | EXECUTED_INTEGRATION_DB 2026-07-22 |

**EC-02 Gate 2 explanation:** The assertion was `toBe(false)` (asserting the broken state).
Per Gate 2, the assertion is now `toBe(true)` (the correct target). This test **FAILS** today
because `renewal_status='active'` (E-172 DB-default bug) causes `is_tenancy_ended = false`.
The failure is the signal: it will naturally pass when E-172-FIX ships, without any assertion
edit. The suite exits non-zero. Total evidence: 54 passed, 1 failed — known defect E-172.

### E2E tests (browser) — 6/6 PASS (Gate 4: Finance page only)

**Gate 4 coverage:** Finance page only (desktop table, 1280×900 viewport, per-property
rows `finance-prop-row-{id}`, status cells `finance-status-{id}`, remaining cells
`finance-remaining-{id}`, notice `finance-unknown-notice`). The E2E does NOT claim
three independent surfaces — it covers one page with consistent data-testid selectors.

Playwright 1.59.1 / Chromium. Viewport 1280×900. Local Supabase (127.0.0.1).
Alice prop `e1700001-0000-4000-8000-000000000001`; Bob prop `e1700002-0000-4000-8000-000000000002`.
Config: `e170-suite/playwright.e170.config.js`. Executed 2026-07-22.

Each test asserts the fixture row IS visible before checking its state — ruling out
vacuous passes from an absent row (the "zero for the wrong reason" guard).

| Test | Expected | Actual | Evidence tag |
|------|----------|--------|--------------|
| E2E-01: `finance-unknown-notice` visible, contains "Balance unavailable" | visible + text | **PASS** (15.1 s) | EXECUTED_E2E_BROWSER 2026-07-22 |
| E2E-02: Alice row visible; status ≠ "Overdue", matches /Unknown/i | row visible + unknown status | **PASS** (5.6 s) | EXECUTED_E2E_BROWSER 2026-07-22 |
| E2E-03: Alice row visible; remaining cell ≠ "38,750", matches /unavailable\|history\|unknown/i | row visible + no phantom | **PASS** (4.8 s) | EXECUTED_E2E_BROWSER 2026-07-22 |
| E2E-04: Bob row visible; status ≠ "Overdue" | row visible + unknown status | **PASS** (5.3 s) | EXECUTED_E2E_BROWSER 2026-07-22 |
| E2E-05: Bob row visible; remaining cell ≠ "28,600" | row visible + no phantom | **PASS** (5.9 s) | EXECUTED_E2E_BROWSER 2026-07-22 |
| E2E-06: Both `finance-prop-row-*` testids visible in desktop table | rows present | **PASS** (5.7 s) | EXECUTED_E2E_BROWSER 2026-07-22 |

---

## Gate 5a — `remaining` consumer compatibility

**Invariant:** `balance_state='unknown_payment_history'` → `payment_status='unknown'`
(SQL CASE at `finance_snapshot.sql:494-502`). This invariant is unconditional — it fires
before any `remaining`-based path. Downstream consumers are safe.

**Consumer analysis (CODE_READ_ONLY):**

| Consumer | File | Usage | Safe? |
|----------|------|-------|-------|
| `getPropertyOverdueRemaining` | `src/utils/financeSnapshot.js` | Gates on `paymentStatus === "overdue"` before reading `remaining` | Yes — unknown never reaches this branch |
| `getFinancePropertyBalanceMap` | `src/utils/financeSnapshot.js` | Accumulates `remaining` (0 for unknowns); downstream gates on status | Yes — unknown contribution is 0 |
| `financeAmountForProperty` | `src/utils/financeSnapshot.js` | Gates on `balance.status !== "overdue"` | Yes |
| `buildFinancePaymentDisplayRows` | `src/utils/financePayments.js` | Maps all properties to `remaining`; for unknowns (remaining=0) open rows get zeroed/excluded | Yes — appropriate behavior |
| `PropertyDetails.jsx:144` | `src/pages/PropertyDetails.jsx` | `calculatePropertyFinance({ property, payments: propertyPayments })` — takes raw payments array from `usePayments` hook, not from snapshot. Function signature: `({ property, payments, date, leaseEndDate })` — no RPC call inside. | n/a — not a snapshot consumer |
| `PropertyPerformanceCard.jsx:160` | `src/components/PropertyPerformanceCard.jsx` | Same pattern — `calculatePropertyFinance({ property, payments })` with payments passed from component props, not from snapshot RPC. | n/a — not a snapshot consumer |

**Conclusion:** No unconditional consumer of `remaining` exists. All snapshot consumers
gate on `paymentStatus !== "overdue"` before using `remaining` for any decision.
The SQL paymentStatus invariant (`unknown_payment_history → 'unknown'`) ensures
`remaining=0` is inert across all surfaces.

---

## Gate 5b — RED/GREEN environment honesty

**Pre-fix SHA:** `d46d7e2` (HEAD at time of RED/GREEN execution; branch `codex/hmrc-e1-hardening`)

**Working tree state at execution:** E-170 working-tree fix uncommitted. The Gate 1
CTE change (`CASE WHEN EXISTS...`) was also uncommitted (applied after the original
RED/GREEN run, re-run to confirm GREEN-G1 with the fix in place).

**Isolation method:** Same local DB instance. Pre-fix function applied via
`git show HEAD:supabase/finance_snapshot.sql | psql` (stdin). Post-fix function applied
from working tree via `fs.readFileSync + psql` (stdin). This is **same-DB function swap**,
NOT a separate worktree or separate DB. The two states are sequential in one process;
no concurrent isolation.

**Strength note:** Same-DB function swap is weaker than a separate worktree + separate DB.
It rules out data contamination (fixtures are created fresh per run) but a schema-cache
timing issue between pre/post-fix apply is theoretically possible. The 3-second wait
after each `pg_notify('pgrst', 'reload schema')` call is a mitigating safeguard.

**Schema fingerprint (post-fix, CODE_READ_ONLY):** `supabase/finance_snapshot.sql`
working tree; `supabase/finance_tracking_activation.sql` working tree. No migration
file changes — functions are replaced in-place via `CREATE OR REPLACE FUNCTION`.

---

## EC-06 design note (P0-A cap for 'ended' vs 'active-labelled' leases)

The SQL `property_lease_end` CTE (post-Gate-1-fix) uses:
- **Active tenancy** (EXISTS non-ended lease): subquery returns `lease_end_date` from
  non-ended rows. NULL = open-ended → accrue to today. `active`-labelled rows with past
  `lease_end_date` (import default) are capped at that date (EC-06).
- **Ended tenancy** (no non-ended lease): ELSE branch returns most recent ended lease's
  `lease_end_date`. Accrual stops at evidenced close (GREEN-G1).

EC-06 tests the first scenario (active-labelled, past end_date — more common import case).
GREEN-G1 tests the second scenario (renewal_status='ended'). Both paths are proven.

---

## Open bugs

| ID | Description | Blocking E-170? |
|----|-------------|-----------------|
| E-172 | `is_tenancy_ended = false` for imported leases with `renewal_status='active'` despite past `lease_end_date` (DB default on import). EC-02 asserts correct target (true) and FAILS. | **No** — E-170 eliminates phantoms regardless |
| BLOCKED-RPC-1 | `record_finance_transaction` does not exist | Deferred — not in E-170 scope. No suite test calls this RPC; 14/14 verify tests do not depend on it. |
| BLOCKED-RPC-2 | `get_finance_portfolio_summary` does not exist | Deferred — not in E-170 scope. No suite test calls this RPC; portfolio-summary assertions were omitted, not routed around. |

---

## Sign-off gate

- [x] RED baseline: phantoms reproduced (Alice £38,750 + Bob £28,600)
- [x] Gate 1 RED (STEP 0 = a, E-170 owned): CTE NULL mechanism proved by direct SQL (EXECUTED_INTEGRATION_DB)
- [x] GREEN result: phantoms eliminated (balance_state = unknown_payment_history, remaining = 0)
- [x] Gate 1 GREEN: accrualThrough = '2024-06-30' for explicitly-ended tenancy (EXECUTED_INTEGRATION_DB)
- [x] Gate 2 (EC-02): assertion target = true (correct). Test FAILS as expected — KNOWN DEFECT E-172
- [x] Gate 3 (D-04): D-04a pg_proc confirms function exists; D-04b authenticated has execute; D-04c anon lacks execute — PGRST202 is permission-based denial, not schema miss
- [x] Gate 4 (E2E): Finance page only (one page, desktop table). No "three surfaces" claim.
- [x] Gate 5a: all `remaining` consumers safe via paymentStatus SQL invariant (CODE_READ_ONLY)
- [x] Gate 5b: pre-fix SHA=d46d7e2; same-DB function swap; not separate worktree/DB; 3s schema-cache wait
- [x] Deny tests: all 12/12 guards fire with specific messages
- [x] Verify tests: 14/14 — typed fields, calculation formula, coverage_state, atomic supersede, invariant
- [x] E2E: 6/6 PASS — EXECUTED_E2E_BROWSER 2026-07-22; Chromium 1280×900; Alice/Bob rows show unknown status and no phantom balances; positive row-visibility assertion before each absence check

---

# P0-C — Shared Typed Balance Authority

**Date:** 2026-07-22  
**Scope:** Route all direct-balance surfaces through `finance_snapshot → balanceSelector → surface`. Eliminate `calculatePropertyFinance` from all governed display paths.  
**Prompt authority:** Prompt B (Implementation & Validation). PO confirmed ruled set: 5 direct + 2 aggregate surfaces.

---

## P0-C Ruled Surface Inventory

| Surface | Route | File(s) | Type |
|---------|-------|---------|------|
| Finance page (per-property table) | R0 — pre-existing compliant | `src/pages/Finance.jsx` | Direct |
| PropertyDetails financials tab | R1 | `src/pages/PropertyDetails.jsx` | Direct |
| PropertyPerformanceCard tiles + risk state | R2 | `src/components/PropertyPerformanceCard.jsx` | Direct |
| TenantHomePage outstanding card | R3 | `src/pages/TenantHomePage.jsx` | Direct (attribution-gated) |
| TenantPayments outstanding card | R3 | `src/pages/TenantPayments.jsx` | Direct (attribution-gated) |
| Command Center | Validation-only | `src/pages/CommandCenterPage.jsx` | Aggregate |
| Dashboard (Portfolio Health) | Validation-only | `src/pages/PortfolioHealthDashboardPage.jsx` | Aggregate |

---

## Authority Contract

```
finance_snapshot RPC (getFinanceSnapshot)
  ↓
useFinance() hook → propertyFinance: ParsedPropertyFinanceRow[]
  ↓
balanceSelector.js adapters:
  selectPropertyBalance(row)    — property-scoped; state-first
  findPropertyBalanceRow(rows, id) — locator
  selectTenantBalance(rows)     — attribution-gated (exactly 1 row → attributed)
  ↓
surface rendering (state-first guards)
```

**Adapter invariants (MAY NOT):**
- Recalculate rent, sum raw payments, infer status from `remaining`
- Convert unknown-state to £0
- Override `reasonCode` / `basis`
- Show monetary value when `isKnown = false`

---

## Per-Surface Structural Traces (CODE_READ_ONLY)

### R0 — Finance.jsx (pre-existing compliant, no change)

| Invariant | Evidence |
|-----------|----------|
| `p.balanceState === "known"` gate before `p.paid` | `Finance.jsx:483, 557` (mobile + desktop) |
| `BALANCE_REASON_COPY[p.reasonCode]?.primary` for unknown | `Finance.jsx:494, 565` |
| No `calculatePropertyFinance` import | Confirmed by grep — absent |
| Aggregate summary tiles from `finance_snapshot` (via `useFinance`) | `FinancePage.jsx:23-29`; `Finance.jsx:406-438` |

**Verdict: R0 surface was already compliant. No change required.**

### R1 — PropertyDetails.jsx (financials tab)

| Invariant | Evidence |
|-----------|----------|
| `calculatePropertyFinance` REMOVED | `src/pages/PropertyDetails.jsx` — absent (structural) |
| `useFinance()` called at component level | `PropertyDetails.jsx:75` |
| `findPropertyBalanceRow(propertyFinance, property.id)` | `PropertyDetails.jsx:147` |
| `selectPropertyBalance(balanceRow)` | `PropertyDetails.jsx:148` |
| Rent tile (Type C): always `formatCurrencyAmount(property.rent)` | `PropertyDetails.jsx:302` |
| Paid tile: `balance.isKnown ? formatCurrencyAmount(balance.paid) : "—"` | `PropertyDetails.jsx:308-313` |
| Remaining tile: `balance.isKnown ? amount : reason copy` with `data-testid="financials-balance-unavailable"` | `PropertyDetails.jsx:318-327` |
| `balanceRow` passed to `<PropertyPerformanceCard>` | `PropertyDetails.jsx:238` |

### R2 — PropertyPerformanceCard.jsx (current-balance tiles + risk state)

| Invariant | Evidence |
|-----------|----------|
| `calculatePropertyFinance` REMOVED | absent from import (structural) |
| `selectPropertyBalance(balanceRow)` in `summary` useMemo | `PropertyPerformanceCard.jsx:166` |
| `toneForAttention` returns `"slate"` when `!balanceIsKnown` | `PropertyPerformanceCard.jsx:30` |
| `attentionLabel = performanceBalanceUnknown` when `!balance.isKnown` | `PropertyPerformanceCard.jsx:214` |
| Collected tile: `balance.isKnown ? amount : "—"` | `PropertyPerformanceCard.jsx:443-447` |
| Overdue tile: `balance.isKnown ? amount : reason copy` + `data-testid="perf-overdue-unavailable"` | `PropertyPerformanceCard.jsx:451-457` |
| Outstanding tile: `balance.isKnown ? amount : reason copy` + `data-testid="perf-outstanding-unavailable"` | `PropertyPerformanceCard.jsx:461-467` |
| Billed-to-date (collapsible): `balance.isKnown && billedToDate != null ? amount : "—"` | `PropertyPerformanceCard.jsx:535-539` |
| Net-operating (collapsible): `balance.isKnown ? amount : "—"` | `PropertyPerformanceCard.jsx:554-558` |
| `rent-at-risk` flag: `summary.balance?.isKnown && overdueRent > 0` | `PropertyPerformanceCard.jsx:319` |
| `outstandingRent = balance.isKnown ? balance.remaining : null` | `PropertyPerformanceCard.jsx:167` |
| `overdueRent = balance.isKnown && balance.isOverdue ? outstandingRent : null` | `PropertyPerformanceCard.jsx:168` |
| `useMemo` deps: `balanceRow` replaces `payments` | `PropertyPerformanceCard.jsx:239` |

**Unknown-state invariant proof (R2):**
- `toneForAttention → "slate"` (not emerald/rose)
- `attentionLabel → "Balance not assessed"` (not "Stable" / "Needs attention: rent")
- Tiles show reason copy, not £0
- `rent-at-risk` flag does NOT fire (requires `balance.isKnown = true`)

### R3 — TenantHomePage.jsx + TenantPayments.jsx (unavailable-mode)

**PO ruling 2026-07-22 (Option B):** Attribution trace proved that while `payments.tenant_id` is filtered to the requesting tenant, the expected obligation (rent × months), `coverage_start`, `opening_balance_minor` and `lease_end_date` remain property-level values. The result is "property obligation minus this tenant's payments" — not a tenancy balance. This fails both concurrent (HMO) and sequential tenancy scenarios. Balance display denied.

**Core distinction:**
```
scope validation  = retained  (assert_tenant_scope_access validates auth.uid() matches tenant record)
balance attribution = denied   (obligation calculation is property-scoped, not tenancy-scoped)
```

**SQL attribution trace (CTE-by-CTE, `finance_snapshot.sql`):**

| CTE | Tenant filter? | Notes |
|-----|---------------|-------|
| `assert_tenant_scope_access(p_account_id, p_tenant_id)` | Identity check: `t.user_id = auth.uid()` AND `t.account_id = p_account_id` | Proves caller identity and account membership. Does NOT prove obligation calculation ownership. |
| `scoped_payments` | YES — `p.tenant_id = v_tenant_id` | Only this tenant's payment records are included. |
| `property_activation` | NO | Joins `tenancy_finance_activations` on `property_id` only — no `tenant_id` filter. The activation row belongs to the property, not the tenancy. |
| `scoped_properties` (rent) | NO | `p.rent` is a property-level field. |
| `property_lease_end` | NO | `lease_end_date` is derived from `leases.lease_end_date` filtered by `property_id` only. |
| `property_accumulated` | NO | Uses `property_activation.coverage_start`, `property_activation.opening_balance_minor`, `scoped_properties.rent` and `property_lease_end.lease_end_date` — all property-scoped. |
| `property_json` | NO | Aggregates property-level fields. `'scopeTenancyId', v_tenant_id` echoes the request scope identifier; it does not make the result tenancy-scoped. |

**Attribution denial conclusion:** Payments are correctly tenant-filtered. The obligation calculation (expected total = months × rent + opening balance) uses property-level values. In a single-occupancy, single-tenancy property this coincides with tenancy-level values — but the SQL cannot assert this in the general case (concurrent tenancies, sequential tenancies). A balance that is "property obligation minus this tenant's payments" is not a tenancy balance and must not be attributed as one.

**`scopeTenancyId` contract:** `finance_snapshot.sql` `property_json` CTE now emits `'scopeTenancyId', v_tenant_id`. This field identifies the authenticated tenant scope used for property selection and tenant-filtered payment retrieval. It is NOT evidence that rent, activation, `opening_balance_minor` or lease boundary belong to that tenancy. The rename from `tenancyId` makes the scope-only semantics explicit.

**`selectTenantBalance` behaviour (unavailable-mode):** Always returns:
```js
{ attributed: false, attributionState: "authority_unavailable",
  balance: null, reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE",
  scopeValidated: boolean }
```
`scopeValidated` (true when 1 row + `row.scopeTenancyId === activeTenantId`) is diagnostic metadata only — it never enables balance rendering.

**UI:** Outstanding card shows approved copy:
```
Balance unavailable
A tenancy-specific balance has not been established.
```
No monetary amount; no overdue state; no rent-at-risk signal. Payment transaction history (filtered by `tenant_id` at the RPC layer) remains visible and unaffected.

| Invariant | Evidence |
|-----------|----------|
| `useFinance()` + `selectTenantBalance(propertyFinance, activeTenantId)` in both pages | `TenantHomePage.jsx`; `TenantPayments.jsx` |
| `useTenant()` called in both pages | `TenantHomePage.jsx`; `TenantPayments.jsx` |
| `buildTenantPaymentSummaryFromPayments` REMOVED from TenantHomePage | `TenantHomePage.jsx` — absent (structural) |
| `selectTenantBalance` always returns `attributed: false, balance: null` | `balanceSelector.js` — no `return { attributed: true ... }` path |
| `attributionState: "authority_unavailable"` on every return | `balanceSelector.js` |
| `!tenantBalance.attributed → unavailable copy rendered` | `TenantHomePage.jsx`; `TenantPayments.jsx` |
| `data-testid="tenant-home-outstanding-card"` (card-scoped E2E boundary) | `TenantHomePage.jsx` |
| `data-testid="tenant-home-balance-unavailable"` | `TenantHomePage.jsx` |
| `data-testid="tenant-payments-outstanding-card"` (card-scoped E2E boundary) | `TenantPayments.jsx` |
| `data-testid="tenant-payments-balance-unavailable"` | `TenantPayments.jsx` |
| `finance_snapshot` SQL emits `scopeTenancyId` (scope identifier, not attribution proof) | `supabase/finance_snapshot.sql` — `property_json` CTE |
| `parsePropertyFinanceRow` parses `scopeTenancyId` | `rpcContracts.js` |
| `TENANT_BALANCE_FALLBACK` updated to `authority_unavailable` shape | `TenantPayments.jsx` |
| Positive attribution (ARCH-FIN-01) deferred — no attributed balance path in current code | `balanceSelector.js` — structural |

---

## CC + Dashboard Validation (Governed aggregate surfaces — product hardening applied)

**PO ruling 2026-07-22:** CC and Dashboard are governed Type B aggregate surfaces within the P0-C validation set. Classification as "Type D outside scope" was incorrect and removed.

**Corrected pass:** original validation grepped the page shells (`CommandCenterPage.jsx`, `PortfolioHealthDashboardPage.jsx`) and found nothing. The corrected pass checks the service layer, which is where balance data is actually consumed.

**Product hardening applied:** `getPropertyOverdueRemaining` (`src/utils/financeSnapshot.js:18-24`) now gates on `balanceState === "known"` before summing `row.remaining`. Previously it relied on the RPC invariant that unknown-state rows have `remaining = null` — this is now explicit at the client layer. An adversarial row with `balanceState !== "known"` and a non-null positive `remaining` is excluded regardless of `paymentStatus`.

### Command Center (`commandCenterService.js`)

| Check | Result |
|-------|--------|
| `calculatePropertyFinance` | NOT FOUND ✓ |
| `balanceState` / `outstandingMinor` / `balanceSelector` / `selectPropertyBalance` | NOT FOUND ✓ |
| Per-property balance display | NOT FOUND ✓ |
| `getFinanceOverdueAmount` import and call | FOUND — `commandCenterService.js:8,222-224` |

`commandCenterService.js` imports `getFinanceOverdueAmount` from `../utils/financeSnapshot` and calls it to populate `summary.overdueAmount` in the CC header tile. `getFinanceOverdueAmount` → `getPropertyOverdueRemaining` (`financeSnapshot.js:18-24`) sums `row.remaining` from property_finance rows where `paymentStatus === "overdue" && remaining > 0`. No explicit `balanceState === "known"` gate is applied at the client layer; the function relies on the RPC invariant that unknown-state rows have `remaining = null` (`safeNumber(null) = 0 → 0 > 0 = false`, contributing zero).

**CC verdict:** No `calculatePropertyFinance`. No per-property balance display. `overdueAmount` is a portfolio-wide aggregate scalar (Type D) — not a per-property display surface and not governed by P0-C direct-display rules. **No change needed.**

### Dashboard (`dashboardService.js`, `portfolioHealthService.js`)

| Check | `dashboardService.js` | `portfolioHealthService.js` |
|-------|----------------------|----------------------------|
| `calculatePropertyFinance` | NOT FOUND ✓ | NOT FOUND ✓ |
| `balanceState` / `outstandingMinor` / `balanceSelector` | NOT FOUND ✓ | NOT FOUND ✓ |
| Per-property balance display | NOT FOUND ✓ | NOT FOUND ✓ |
| `getFinanceOverdueAmount` import and call | FOUND — `dashboardService.js:3,104` | FOUND — `portfolioHealthService.js:3,97-99` |

Both services call `getFinanceOverdueAmount` to override the `overdue_amount` aggregate field on their snapshot objects. `portfolioHealthService.js` additionally sets `outstanding_amount = Math.max(snapshotField, overdueAmount)`. Same client-layer reliance on RPC invariant as CC above — no explicit `balanceState` gate.

**Dashboard verdict:** No `calculatePropertyFinance`. No per-property balance display. Both aggregate `overdue_amount` paths are Type D (portfolio-wide scalar totals from `finance_snapshot`), not governed by P0-C direct-display rules. **No change needed.**

### What `getFinanceOverdueAmount` / `getPropertyOverdueRemaining` does (service-layer shared path)

```
getFinanceOverdueAmount(snapshot)
  → if property_finance rows present:
      getPropertyOverdueRemaining(snapshot)
        → sum row.remaining for rows where paymentStatus === "overdue" && remaining > 0
        → no balanceState === "known" gate at client layer
        → unknown-state rows: remaining = null → safeNumber(null) = 0 → 0 > 0 = false → contributes zero
  → else: safeNumber(snapshot.overdue_income)  [legacy aggregate fallback]
```

This is a pre-existing aggregate utility. It is consumed exclusively for Type D header-level totals (CC, Dashboard, Portfolio Health). Per-property balance display on all three surfaces goes through `useFinance() → propertyFinance rows → balanceSelector` (the P0-C authority chain).

---

## Shared Selector Module

**File:** `src/utils/balanceSelector.js`

| Function | Purpose | Invariants |
|----------|---------|------------|
| `selectPropertyBalance(row)` | Map single snapshot row to typed display fields | State-first; `isKnown=false` when `balanceState !== "known"` or null; numeric fields null when unknown |
| `findPropertyBalanceRow(rows, id)` | Locate matching row by propertyId (camelCase or snake_case) | Returns `null` when not found — `null` → `selectPropertyBalance(null)` → unknown state, never zero |
| `selectTenantBalance(rows, activeTenantId)` | Authority-unavailable tenant balance (unavailable-mode) | Always returns `{ attributed: false, attributionState: "authority_unavailable", balance: null, reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE", scopeValidated: bool }`. No attributed=true path exists. `scopeValidated` diagnostic only — never enables rendering. See ARCH-FIN-01. |

**BALANCE_REASON_COPY import:** `src/utils/balanceSelector.js` imports from `../types/finance` — no self-contained copy map. Single source of truth.

---

## Executed Validation Tests (CODE_READ_ONLY + EXECUTED_UNIT)

**Run:** `npm run test:unit:run -- tests/unit/e170_balance_selector.test.js tests/security/tenantPortalEmptyStateContracts.test.js tests/security/financeSnapshot.test.js tests/security/rpcContracts.test.js`  
**Result: 91/91 PASS** — 2026-07-22 (all four targeted P0-C suites)

### Count reconciliation

| Suite | File | Count | Notes |
|-------|------|-------|-------|
| P0-C selector | `tests/unit/e170_balance_selector.test.js` | **65** | See breakdown below |
| Tenant portal contracts | `tests/security/tenantPortalEmptyStateContracts.test.js` | **8** | |
| Finance snapshot contracts | `tests/security/financeSnapshot.test.js` | **8** | |
| RPC contracts | `tests/security/rpcContracts.test.js` | **10** | |
| **Combined targeted** | | **91** | |

### Selector test breakdown (`e170_balance_selector.test.js` — 65 tests)

| Suite | Count | Coverage |
|-------|-------|----------|
| Case 1 — unknown state (no £0 guarantee) | 10 | `isKnown=false`, `outstandingMinor=null`, `paid=null`, `remaining=null`, `isOverdue=false`, `isClear=false`, reason copy populated, null row, not_started state |
| Case 2 — known zero/paid | 6 | `isClear=true`, `isOverdue=false`, `outstandingMinor=0`, `reasonPrimary=null`, paid surfaced |
| Case 3 — known overdue | 6 | `isOverdue=true`, `isClear=false`, `outstandingMinor>0`, `isKnown=true` (rent-at-risk eligible), remaining surfaced, `reasonPrimary=null` |
| Case 4 — authority unavailable (R3 Amendment v2) | 11 | `attributed: false` on all paths; `attributionState: "authority_unavailable"` always; `balance: null` always; `reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE"` always; `scopeValidated` true/false across 7 sub-cases (null activeTenantId, no rows, null rows, >1 rows, mismatch, null scopeTenancyId, exact match) |
| findPropertyBalanceRow | 4 | match, not-found→null, null→selectPropertyBalance→unknown, snake_case fallback |
| Structural contracts | 22 | `calculatePropertyFinance` absent (R1,R2); imports verified (R1,R2,R3); data-testids present; i18n keys EN+PL; `scopeTenancyId` field confirmed; `attributed: true` never emitted by `selectTenantBalance`; card-scoped testids present for E2E boundary assertions |

**Prior selector count (before P0-C):** 46. **After R1/R2/R3 Amendment v1:** 62. **After R3 Amendment v2:** 65. Net Δ = +19 from baseline, +3 from Amendment v2.

**Full suite (confirmed EXECUTED_UNIT 2026-07-22):** 4,724 total — 4,707 passed, 17 failed (all pre-existing, unchanged). Prior baseline: 4,703 passed. Net Δ = +4 (3 selector + 1 tenantPortal isolation proof).

### Tenant portal contract breakdown (`tenantPortalEmptyStateContracts.test.js` — 8 tests)

Payment describe (4 tests): (1) zero-row empty state with unavailable copy, (b) outstanding card with unavailable copy + scopeValidated=true, (a) Tenant A payment visible + Tenant B amount absent (isolation proof), admin/landlord actions absent.  
Documents describe (3 tests): empty groups, trust copy with documents, admin actions absent.  
Role boundary (1 test): manager dashboard absent when role=tenant.

**E2E PENDING:** Playwright tests for browser UI (PropertyDetails financials tab, PropertyPerformanceCard tiles, TenantHomePage, TenantPayments) require running dev server + local Supabase. Logged as EXECUTED_E2E_BROWSER gate pending environment.

---

## i18n

| Key | EN | PL |
|-----|----|----|
| `propertyDetails.performanceBalanceUnknown` | "Balance not assessed" | "Brak danych o saldzie" |

Added at `src/i18n/messages.js` — lines ~5118 (EN) and ~2118 (PL), adjacent to existing `performanceHealthy` and `performanceOverdueAttention` keys.

---

## RLS Acceptance

| Surface | RLS gate | Accepted? |
|---------|----------|-----------|
| R1 (PropertyDetails) | `useFinance()` → `getFinanceSnapshot(activeAccountId, ...)` — existing RLS on `finance_snapshot` RPC; same as FinancePage | Yes — no new RPC, no new RLS surface |
| R2 (PropertyPerformanceCard) | Receives `balanceRow` prop from PropertyDetails — same data, no new fetch | Yes — data flows from R1 |
| R3 (TenantHomePage, TenantPayments) | `useFinance()` → `getFinanceSnapshot(activeAccountId, activeTenantId)` — `activeTenantId` is the logged-in tenant's own ID (TenantContext lines 67-74). Tenant can only see their own snapshot. | Yes — existing auth scoping; `activeTenantId` prevents cross-tenant access |
| Finance.jsx (R0) | Pre-existing; unchanged | Yes |
| CC, Dashboard | `commandCenterService.js`, `dashboardService.js`, `portfolioHealthService.js` consume `getFinanceOverdueAmount(financeSnapshot)` for portfolio-wide aggregate `overdueAmount` scalar. Pre-existing path; no P0-C change. RLS on the underlying `finance_snapshot` RPC is unchanged — same gate as R0/R1. See CC + Dashboard Validation section for implicit-coupling finding. | Pre-existing; no new surface |

---

## Proposed Commit Boundaries

**BLOCKED — awaiting PO authorisation.**

Revised per PO ruling 2026-07-22 (two blockers addressed). Original 5-commit plan replaced with 8-commit plan.

| # | Proposed commit | Files |
|---|----------------|-------|
| 1 | `feat(finance): shared typed property balance selector` | `src/utils/balanceSelector.js` |
| 2 | `feat(finance): route PropertyDetails financials tab to typed authority (R1)` | `src/pages/PropertyDetails.jsx` |
| 3 | `feat(finance): route PropertyPerformanceCard to typed authority (R2)` | `src/components/PropertyPerformanceCard.jsx`, `src/i18n/messages.js` |
| 4 | `fix(finance): make aggregate overdue inclusion state-first` | `src/utils/financeSnapshot.js`, `tests/security/financeSnapshot.test.js` |
| 5 | `feat(finance): add scopeTenancyId scope identifier to finance_snapshot (unavailable-mode)` | `supabase/finance_snapshot.sql`, `src/services/rpcContracts.js`, `tests/security/rpcContracts.test.js` |
| 6 | `feat(finance): tenant portal balance unavailable-mode (R3); defer attribution to ARCH-FIN-01` | `src/pages/TenantHomePage.jsx`, `src/pages/TenantPayments.jsx`, `tests/security/tenantPortalEmptyStateContracts.test.js` |
| 7 | `test(finance): P0-C selectors, tenant portal and attribution contracts (91 tests)` | `tests/unit/e170_balance_selector.test.js`, `tests/security/tenantPortalEmptyStateContracts.test.js`, `e170-suite/EVIDENCE_REPORT.md` |
| 8 | `test(finance): P0-C browser and isolation validation` | PENDING — browser E2E + RLS isolation tests |

**Gate:** PO authorises → commit 1–7 in order → record SHAs → commit 8 after browser E2E environment available.

**Committed SHAs:** (pending PO authorisation)

**Post-commit clean-tree rerun:** 91/91 targeted suite tests (65+8+8+10) + full suite baseline (4,707 passed / 17 pre-existing failures) to be recorded at SHA, not working tree.

**Browser E2E:** PENDING — Playwright tests for PropertyDetails financials tab, PropertyPerformanceCard tiles, TenantHomePage, TenantPayments require running dev server + local Supabase against immutable committed build. R3 browser fixtures must not be written until after attribution contract is committed (commit 5).

**RLS isolation execution:** PENDING — four cross-tenant and anonymous isolation tests (Tenant A sees only Tenant A's balance; Tenant A cannot render Tenant B's balance; Owner A cannot read Account B; anonymous receives nothing) to be run against committed build.

---

## P0-C Disposition

**R3 implemented in unavailable-mode per PO ruling 2026-07-22.** Positive attribution deferred to ARCH-FIN-01. P0-C not yet closed — committed-SHA validation and browser evidence (commit 8) are required. E-170 remains open. E-172 still owns the lifecycle-dependent closure conditions (`is_tenancy_ended` for import-defaulted leases).

---

## PROPOSED FOLLOW-UP — ARCH-FIN-01 (NOT YET RECORDED IN REPO)

**Status:** Not found in repository (grep of entire codebase confirms zero results for `ARCH-FIN-01`). Per PO note: to be recorded in the IMR governance workbook outside the repo.

**Title:** Tenancy-Scoped Finance Authority

**Problem statement:** The current finance model calculates balance as "property obligation minus payments attributed to a tenant_id". This is not a tenancy balance because: (a) the obligation (rent × months, opening balance, coverage_start, lease_end_date) is property-scoped — it cannot be attributed to a specific tenancy in a property with concurrent tenancies; (b) in sequential tenancy scenarios, a new tenant's obligation may be computed from a coverage_start and opening balance that was set by an activation row without a tenancy foreign key. The `assert_tenant_scope_access` function proves caller identity and account membership, but does not prove that the obligation calculation belongs to the caller's tenancy.

**Minimum acceptance boundary:** A new authority (`account_effective_tenancy_finance`, or equivalent) must satisfy at least:
1. The obligation calculation (rent × months) is bounded by a tenancy record's `start_date` and `end_date` (not property-level activation coverage).
2. `opening_balance_minor` is tied to a specific tenancy FK, not a property activation row.
3. The authority can prove, for any returned balance, that the obligation accrual period belongs exclusively to the requesting tenancy and to no prior or concurrent tenancy on the same property.
4. `selectTenantBalance` returns `attributed: true` only when this authority is the source.

**What unblocks this:** A data model change — either a `tenancy_finance_activations.tenancy_id` FK column (or equivalent tenancy-scoped activation mechanism) and SQL that derives accrual boundaries from that FK rather than from the property/lease join.

**Impact of deferral:** Tenant portal outstanding balance is permanently unavailable until ARCH-FIN-01 ships. Payment transaction history (already tenant-filtered at the RPC layer) is unaffected. No monetary amount is shown; no overdue signal fires for tenants. Landlord-facing surfaces (Finance.jsx, PropertyDetails, PropertyPerformanceCard, CC, Dashboard) are unaffected — they operate at property scope, which is correct for landlord use.

