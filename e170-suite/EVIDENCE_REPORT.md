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
| **Total** | **54/55 + 1 documented expected-failure** | EC-02 fails until E-172 ships |

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

### Edge-case and DoD tests — 7/8 PASS + 1 documented expected-failure (Gate 2)

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
edit. The suite exits non-zero. Total evidence: 54/55 passing + 1 documented expected-failure.

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
| `PropertyDetails.jsx:308` | `src/pages/PropertyDetails.jsx` | Uses `calculatePropertyFinance` (local util, not snapshot consumer) | n/a — not a snapshot consumer |
| `PropertyPerformanceCard.jsx:166` | `src/pages/PropertyDetails.jsx` | Uses `calculatePropertyFinance` (local util, not snapshot consumer) | n/a — not a snapshot consumer |

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
| BLOCKED-RPC-1 | `record_finance_transaction` does not exist | Deferred — not in E-170 scope |
| BLOCKED-RPC-2 | `get_finance_portfolio_summary` does not exist | Deferred — not in E-170 scope |

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
