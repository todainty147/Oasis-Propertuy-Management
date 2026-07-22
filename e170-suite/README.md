# E-170 Validation Suite

Validates that the E-170 finance-snapshot fix eliminates phantom rent accrual for imported tenancies without finance tracking activation.

## Coverage matrix

| ID | File | Description | Gate | Status |
|----|------|-------------|------|--------|
| RED-01 | baseline.test.js | Alice phantom ≈ months_elapsed × £1,250 (pre-fix) | RED | requires local DB |
| RED-02 | baseline.test.js | Alice paymentStatus = overdue (pre-fix) | RED | requires local DB |
| RED-03 | baseline.test.js | Bob phantom ≈ months_elapsed × £1,100 (pre-fix) | RED | requires local DB |
| RED-04 | baseline.test.js | Bob paymentStatus = overdue (pre-fix) | RED | requires local DB |
| RED-05 | baseline.test.js | outstanding_income includes both phantoms (pre-fix) | RED | requires local DB |
| GREEN-01 | baseline.test.js | Alice balance_state = unknown_payment_history (post-fix) | GREEN | requires local DB |
| GREEN-02 | baseline.test.js | Alice remaining = 0 (post-fix) | GREEN | requires local DB |
| GREEN-03 | baseline.test.js | Alice paymentStatus = unknown (post-fix) | GREEN | requires local DB |
| GREEN-04 | baseline.test.js | Alice outstandingMinor = null (post-fix) | GREEN | requires local DB |
| GREEN-05 | baseline.test.js | Bob balance_state = unknown_payment_history (post-fix) | GREEN | requires local DB |
| GREEN-06 | baseline.test.js | Bob remaining = 0 (post-fix) | GREEN | requires local DB |
| GREEN-07 | baseline.test.js | outstanding_income excludes Alice + Bob (post-fix) | GREEN | requires local DB |
| GREEN-08 | baseline.test.js | unknown_tenancy_count >= 2 (post-fix) | GREEN | requires local DB |
| D-01 | deny.test.js | coverage_start in future → specific guard message | DENY | requires local DB |
| D-02 | deny.test.js | p_attests = false → specific guard message | DENY | requires local DB |
| D-02b | deny.test.js | p_attests = null → specific guard message | DENY | requires local DB |
| D-03 | deny.test.js | cross-account → permission denied guard | DENY | requires local DB |
| D-04a | deny.test.js | function exists in pg_proc (6-arg, public schema) — not a schema miss | DENY | requires local DB |
| D-04b | deny.test.js | authenticated role has execute privilege (reachable when signed in) | DENY | requires local DB |
| D-04c | deny.test.js | anon role has NO execute privilege — denial is permission-based | DENY | requires local DB |
| D-04 | deny.test.js | anon PostgREST call returns PGRST202 (proved permission-based by D-04a/b/c) | DENY | requires local DB |
| D-05 | deny.test.js | no activation → balance_state = unknown_payment_history | DENY | requires local DB |
| D-05b | deny.test.js | no activation → remaining = 0 | DENY | requires local DB |
| D-05c | deny.test.js | no activation → outstandingMinor = null | DENY | requires local DB |
| D-05d | deny.test.js | no activation → paymentStatus = unknown | DENY | requires local DB |
| V-01 | verify.test.js | All P0 typed fields present after activation | VERIFY | requires local DB |
| V-01b | verify.test.js | coverageStart in JSON matches activation date | VERIFY | requires local DB |
| V-01c | verify.test.js | balance_basis is a valid enumerated value | VERIFY | requires local DB |
| V-02 | verify.test.js | outstanding_minor = opening + months×rent - paid | VERIFY | requires local DB |
| V-02b | verify.test.js | expectedMinor includes opening balance | VERIFY | requires local DB |
| V-03 | verify.test.js | get_finance_coverage_state = prospectively_tracked | VERIFY | requires local DB |
| V-03b | verify.test.js | prospectively_tracked includes coverageStart + openingBalance | VERIFY | requires local DB |
| V-03c | verify.test.js | unknown property → not_configured or history_unknown | VERIFY | requires local DB |
| V-04 | verify.test.js | second activation creates a new activation row | VERIFY | requires local DB |
| V-04b | verify.test.js | only one active row determines balance after second activation | VERIFY | requires local DB |
| V-05 | verify.test.js | unknown property outstandingMinor = null (not in aggregate) | VERIFY | requires local DB |
| V-05b | verify.test.js | unknown_tenancy_count >= 1 | VERIFY | requires local DB |
| V-06 | verify.test.js | activating unknown property flips to known | VERIFY | requires local DB |
| V-07 | verify.test.js | opening_balance_minor visible in outstanding immediately | VERIFY | requires local DB |
| EC-01 | edgecases.test.js | is_tenancy_ended = true for renewal_status='ended' | DOD | requires local DB |
| EC-02 | edgecases.test.js | **KNOWN DEFECT E-172**: is_tenancy_ended should be true (asserts true, FAILS until E-172 ships) | DOD | requires local DB |
| EC-03 | edgecases.test.js | reason_code = PAYMENT_HISTORY_INCOMPLETE when payments exist but no activation | DOD | requires local DB |
| EC-04 | edgecases.test.js | reason_code = FINANCE_COVERAGE_START_UNKNOWN when no payments no activation | DOD | requires local DB |
| EC-05 | edgecases.test.js | over-correction regression: activated stays known after payments | DOD | requires local DB |
| EC-06 | edgecases.test.js | accrual capped at lease_end for ended tenancy (P0-A fix) | DOD | requires local DB |
| EC-07 | edgecases.test.js | paymentStatus = paid when outstanding_minor = 0 | DOD | requires local DB |
| EC-08 | edgecases.test.js | paymentStatus = overdue when activated + underpaid | DOD | requires local DB |
| RED-G1 | baseline.test.js | Gate 1 RED: old CTE subquery returns NULL for ended tenancy (direct SQL) | GATE1 | requires local DB |
| GREEN-G1 | baseline.test.js | Gate 1 GREEN: accrualThrough = lease_end_date for ended tenancy (post-fix) | GATE1 | requires local DB |
| E2E-01 | e2e/e170-finance-phantom-accrual.spec.js | finance-unknown-notice visible (Finance page, browser) | E2E | PASS 2026-07-22 |
| E2E-02 | e2e/e170-finance-phantom-accrual.spec.js | Alice row visible; status = unknown not overdue (Finance page) | E2E | PASS 2026-07-22 |
| E2E-03 | e2e/e170-finance-phantom-accrual.spec.js | Alice row visible; remaining shows no phantom (Finance page) | E2E | PASS 2026-07-22 |
| E2E-04 | e2e/e170-finance-phantom-accrual.spec.js | Bob row visible; status = unknown (Finance page) | E2E | PASS 2026-07-22 |
| E2E-05 | e2e/e170-finance-phantom-accrual.spec.js | Bob row visible; remaining shows no phantom (Finance page) | E2E | PASS 2026-07-22 |
| E2E-06 | e2e/e170-finance-phantom-accrual.spec.js | Both fixture rows present in Finance page table | E2E | PASS 2026-07-22 |

## Running the suite

```bash
# Full orchestrated run (integration tests only):
bash e170-suite/run.sh

# Individual files:
npx vitest run e170-suite/integration/e170.baseline.test.js
npx vitest run e170-suite/integration/e170.deny.test.js
npx vitest run e170-suite/integration/e170.verify.test.js
npx vitest run e170-suite/integration/e170.edgecases.test.js
```

## Pre-requisites

- Local Supabase instance running (Docker)
- Integration harness configured (see `tests/integration/helpers/localSupabaseHarness.js`)
- `supabase/finance_tracking_activation.sql` applied (creates `tenancy_finance_activations` table)
- `supabase/finance_snapshot.sql` working tree = POST-FIX version
- git HEAD `supabase/finance_snapshot.sql` = PRE-FIX version (for RED baseline)

## Known open bugs / expected failures

- **E-172 (Gate 2)**: `is_tenancy_ended = false` for imported leases with `renewal_status='active'` despite past `lease_end_date` (DB default on import). EC-02 asserts the correct target (`true`) and **FAILS** until E-172-FIX ships. Do not change to `toBe(false)` — the failure is the signal. Suite exits non-zero; report cites 54/55 + 1 documented expected-failure.
- **BLOCKED RPCs**: `record_finance_transaction` and `get_finance_portfolio_summary` do not exist; portfolio-summary tests are omitted.
