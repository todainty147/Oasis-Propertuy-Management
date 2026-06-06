# Full Suite Failure Triage Before Phase 5D

Date: 2026-06-04

Command:

```bash
npm run test -- --reporter=json --outputFile=tmp\hmrc-phase5d-full-suite-results.json
```

Result:

- Total tests: 2934
- Passed: 2908
- Failed: 26
- HMRC Phase 5C focused tests: passing
- Related to HMRC Phase 5C implementation: no

These failures are treated as pre-existing broad-suite failures because the focused HMRC Phase 5B/5C and readiness-gate suites pass after the Phase 5C changes. They still matter before Phase 5D because Phase 5D would introduce a real live-network pilot path.

## Failure Triage

| Test file | Test name | Module area | Current failure message | Pre-existing | HMRC 5C related | Blocks Phase 5D | Recommended action | Owner / next step |
|---|---|---|---|---|---|---|---|---|
| `tests/staging/securitySmoke.test.js` | `allows in-account staff to read only their own account command center items` | staging | `expected { code: 'P0001' ... } to be null` | Yes | No | Yes | fix before Phase 5D | Platform/security: inspect staging RPC error, confirm staff command-center read path and account scoping. |
| `tests/security/advancedRentContracts.test.js` | `owner B cannot read account A rent splits` | rent | `Cannot read properties of null (reading 'id')` | Yes | No | Yes | fix before Phase 5D | Rent/RLS: repair fixture setup or RLS contract for rent splits; rent data can affect MTD income context. |
| `tests/security/advancedRentContracts.test.js` | `tenant cannot read rent_splits` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `owner B cannot read account A rooms` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `owner B cannot read account A utility charges` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `tenant cannot insert utility charges for account A` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `owner B cannot read account A adjustments` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `owner B cannot read account A STR bookings` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/advancedRentContracts.test.js` | `two active assignments for same room+tenant are rejected` | rent | `Cannot read properties of null (reading 'id')` | Yes | No | Yes | fix before Phase 5D | Rent/RLS: repair room assignment fixtures and unique-index contract. |
| `tests/security/customRolesSqlContracts.test.js` | `routes billing read policies through user_can_manage_account` | custom roles | missing `CREATE POLICY billing_customers_select_account_managers` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile baseline schema or contract for billing policy routing. |
| `tests/security/customRolesSqlContracts.test.js` | `routes account report settings manager writes through user_can_manage_account` | custom roles | missing `CREATE POLICY account_report_settings...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile account report settings policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes compliance document link policies through user_can_manage_account` | custom roles | missing `CREATE POLICY compliance_document_links...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile compliance document link policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes contractor rating manager writes through user_can_manage_account` | custom roles | missing `CREATE POLICY contractor_ratings_upsert...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile contractor rating manager policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes security anomaly actor role lookup through account_member_effective_role` | custom roles | missing `v_actor_member_role := public.account_member_effective_role...` | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: update security anomaly actor role helper or contract. |
| `tests/security/customRolesSqlContracts.test.js` | `routes security anomaly alert actor role classification through account_member_effective_role` | custom roles | missing `v_actor_member_role := public.account_member_effective_role...` | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: update security anomaly alert actor classification helper or contract. |
| `tests/security/customRolesSqlContracts.test.js` | `routes security anomaly alert assignee validation through account_member_effective_role` | custom roles | missing `v_assignee_role := public.account_member_effective_role...` | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: update assignee validation helper or contract. |
| `tests/security/customRolesSqlContracts.test.js` | `routes lease manager policies through user_can_manage_account while preserving tenant read scope` | custom roles | missing `CREATE POLICY leases_delete_account_managers...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile lease manager policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes preventive maintenance manager write policies through user_can_manage_account` | custom roles | missing `CREATE POLICY preventive_maintenance...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile preventive maintenance manager policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes maintenance expense and budget manager policies through user_can_manage_account` | custom roles | missing `CREATE POLICY maintenance_expenses...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile maintenance expense and budget policies. |
| `tests/security/customRolesSqlContracts.test.js` | `routes operations foundations manager policies through user_can_manage_account` | custom roles | missing `CREATE POLICY property_financial_profiles...` in baseline SQL | Yes | No | Yes | fix before Phase 5D | Permissions/RLS: reconcile operations foundation policies. |
| `tests/security/rentEngineContracts.test.js` | `owner B cannot read account A rent plans` | rent | `expected undefined to be truthy` | Yes | No | Yes | fix before Phase 5D | Rent/RLS: inspect rent plan fixture creation and account isolation policy. |
| `tests/security/rentEngineContracts.test.js` | `owner B cannot insert expected charges into account A` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/rentEngineContracts.test.js` | `post_expected_charge does not write directly to ledger_entries` | rent | `Cannot read properties of null (reading 'id')` | Yes | No | Yes | fix before Phase 5D | Rent/ledger: repair fixture setup and confirm append-only ledger behavior. |
| `tests/security/rentEngineContracts.test.js` | `tenant A1 cannot read rent plans` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/rentEngineContracts.test.js` | `contractor A1 cannot read rent plans` | rent | `signInAsUser is not a function` | Yes | No | Yes | fix before Phase 5D | Test infrastructure/RLS: restore auth helper import or update contract harness. |
| `tests/security/rpcPerformanceContracts.test.js` | `retains the current supporting index definitions for the hottest account-scoped feed domains` | RPC performance | missing `CREATE INDEX payments_account_tenant_...` in baseline SQL | Yes | No | Yes | fix before Phase 5D or formally waive | Platform/DB: confirm whether index contract is stale or baseline schema export is missing required indexes. |

## Blocking Groups Before Phase 5D

All current broad-suite failure groups are blocking before Phase 5D unless fixed or formally waived:

- Staging smoke: blocks because staging deploy safety must be trustworthy before any live-network pilot.
- Advanced rent and rent engine: block because rent records can feed property income, MTD records, and landlord-facing financial totals.
- Custom roles: block because permission and RLS boundary regressions are not acceptable before live HMRC pilot work.
- RPC performance: blocks until reviewed because account-scoped feed reliability and DB safety matter for release confidence.

## Before Phase 5D Checklist

- [x] Focused HMRC Phase 5B/5C/readiness tests pass.
- [ ] Full suite passes, or every remaining failure is formally documented as non-blocking.
- [ ] No unresolved permission or RLS failures.
- [ ] No unresolved rent or income failures affecting MTD records.
- [ ] No unresolved export/accountant pack failures.
- [ ] No unresolved staging deploy smoke failures.
- [ ] No unresolved RPC performance failures that could affect HMRC flows.
- [x] Build passes.
- [x] Lint has no new errors.
- [x] Phase 5C checkpoint docs created.

## Codex Follow-up Prompt

Use this before Phase 5D:

```text
Implement the pre-Phase-5D broad-suite fix pass. Start with the blocking groups in docs/release/full-suite-failure-triage-before-phase5d.md. Fix, do not skip, the staging security smoke failure, rent/advanced rent RLS and fixture failures, custom role SQL contract failures, and RPC performance index contract failure. Preserve HMRC Phase 5A/5B/5C guards, keep READY_FOR_LIVE_SUBMISSION=false, and do not implement Phase 5D or enable live HMRC network submission. Run focused HMRC tests, npm run build, npm run lint, and npm run test. Report any remaining failures with blocking/non-blocking classification.
```

## After Fix Pass

Date: 2026-06-05

Full-suite reproduction artifact:

```bash
npm run test -- --reporter=json --outputFile=tmp/hmrc-phase5d-full-suite-results-after-start.json
```

Initial reproduced result: failed. The same four broad-suite blocker groups remained present before this pass: staging security smoke, advanced rent/rent engine fixture and RLS contracts, custom role SQL contracts, and RPC performance index contracts.

Final full-suite command:

```bash
npm run test
```

Final result:

- Test files: 164 passed
- Tests: 2952 passed
- Remaining failures: 0
- HMRC Phase 5D implementation: not started
- Live HMRC network submission: not enabled
- `READY_FOR_LIVE_SUBMISSION=true` source check: no matches

### Fixed Blocking Groups

| Test file | Test name/group | Module area | Failure message before fix | Root cause | Fix applied or waiver reason | Phase 5D blocking status after fix | Verification command |
|---|---|---|---|---|---|---|---|
| `tests/staging/securitySmoke.test.js` | `allows in-account staff to read only their own account command center items` | staging/security smoke | `Feature command_center requires growth plan or higher` / `expected ... to be null` | The staging fixture accounts were seeded without active paid-plan fields, so command-center access was correctly denied as starter-level access. | Updated `scripts/seedStagingFixtures.js` to seed smoke accounts with `subscription_status: "active"` and `subscription_plan: "pro"`, then reseeded the local staging fixture. | Resolved. Not blocking. | `npm run test:unit:run -- tests/staging/securitySmoke.test.js tests/security/advancedRentContracts.test.js tests/security/rentEngineContracts.test.js tests/security/customRolesSqlContracts.test.js tests/security/rpcPerformanceContracts.test.js` |
| `tests/security/advancedRentContracts.test.js` | advanced rent RLS contracts | rent/RLS | `signInAsUser is not a function`; `Cannot read properties of null (reading 'id')` | Older rent contracts still used an email-based auth helper name that had drifted from the current local Supabase harness API, preventing fixture users from signing in and causing downstream null fixture reads. | Added a compatibility `signInAsUser(email)` helper in `tests/integration/helpers/localSupabaseHarness.js` that maps fixture emails to the existing fixture sign-in path while preserving direct email fallback behavior. | Resolved. Not blocking. | `npm run test:unit:run -- tests/security/advancedRentContracts.test.js tests/security/rentEngineContracts.test.js` |
| `tests/security/rentEngineContracts.test.js` | rent engine RLS and ledger contracts | rent/RLS/ledger | `signInAsUser is not a function`; `expected undefined to be truthy`; `Cannot read properties of null (reading 'id')` | Same harness API drift prevented fixture sign-in, which made account-isolation and ledger contract setup fail before the policy behavior could be evaluated. | Reused the `signInAsUser(email)` compatibility helper. The focused rent contracts now exercise the intended RLS and ledger behavior successfully. | Resolved. Not blocking. | `npm run test:unit:run -- tests/security/advancedRentContracts.test.js tests/security/rentEngineContracts.test.js` |
| `tests/security/customRolesSqlContracts.test.js` | custom role SQL policy and helper contracts | custom roles/RLS | Missing policy/helper substrings in `baseline_schema.sql` | The baseline schema is pg_dump-style SQL with quoted identifiers and `select ... into` function calls, while the contract expected unquoted identifier text and assignment-style helper calls. The schema behavior was present, but the text matcher was brittle. | Normalized quoted identifiers in the contract reads and adjusted the security-anomaly helper assertions to match the actual safe `select public.account_member_effective_role(...) into ...` SQL shape. No RLS policy was weakened. | Resolved. Not blocking. | `npm run test:unit:run -- tests/security/customRolesSqlContracts.test.js tests/security/rpcPerformanceContracts.test.js` |
| `tests/security/rpcPerformanceContracts.test.js` | supporting index definitions for hot account-scoped feed domains | RPC performance/database contracts | Missing index substrings in `baseline_schema.sql` | Same pg_dump quoted-identifier mismatch made existing index definitions invisible to the contract matcher. | Normalized quoted identifiers before index assertions so the contract validates the existing index semantics. | Resolved. Not blocking. | `npm run test:unit:run -- tests/security/customRolesSqlContracts.test.js tests/security/rpcPerformanceContracts.test.js` |

### Verification

```bash
npm run test:unit:run -- tests/staging/securitySmoke.test.js tests/security/advancedRentContracts.test.js tests/security/rentEngineContracts.test.js tests/security/customRolesSqlContracts.test.js tests/security/rpcPerformanceContracts.test.js
npm run test:unit:run -- tests/security/hmrcMtdPhase5BContracts.test.js tests/security/hmrcMtdPhase5CContracts.test.js tests/unit/hmrcPhase5ReadinessGate.test.js
npm run build
npm run lint
npm run test
rg -n "READY_FOR_LIVE_SUBMISSION\\s*[:=]\\s*true|READY_FOR_LIVE_SUBMISSION.*true" src tests supabase docs
```

Results:

- Broad blocking groups: passed, 5 files / 57 tests.
- HMRC focused guard suites: passed, 3 files / 33 tests.
- Build: passed. Existing Vite warning remains for a chunk larger than 800 kB.
- Lint: passed with existing warnings and no errors.
- Full suite: passed, 164 files / 2952 tests.
- `READY_FOR_LIVE_SUBMISSION=true` search: no matches.

## Before Phase 5D Checklist After Fix Pass

- [x] Focused HMRC Phase 5B/5C/readiness tests pass.
- [x] Full suite passes, or every remaining failure is formally documented as non-blocking.
- [x] No unresolved permission or RLS failures.
- [x] No unresolved rent or income failures affecting MTD records.
- [x] No unresolved export/accountant pack failures.
- [x] No unresolved staging deploy smoke failures.
- [x] No unresolved RPC performance failures that could affect HMRC flows.
- [x] Build passes.
- [x] Lint has no new errors.
- [x] Phase 5C checkpoint docs created.
- [x] READY_FOR_LIVE_SUBMISSION remains false.
