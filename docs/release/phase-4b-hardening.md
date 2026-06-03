# Phase 4B Hardening

This note covers the post-implementation hardening pass for Deposit Vault, Deposit Settlement Statements, Deposit Dispute Pack integration, Eco-Upgrade Planner and Portfolio Health eco compliance.

## Scope

- Keep Phase 4B additive and Growth+ only.
- Preserve landlord-controlled workflows: statements, deductions, EPC plans and work-order handoff remain review tools, not automated decisions.
- Keep Tenaqo copy clear that it does not hold deposits, collect rent, move money, guarantee dispute outcomes or guarantee EPC results.
- Avoid changes to HMRC, Tax Tools, Evidence Vault, Compliance Safe or unrelated routing.

## Feature Flags

- `deposit_deductions_log`
- `deposit_settlement_statement`
- `eco_upgrade_planner`
- `portfolio_health_eco_compliance`

Starter accounts should not receive these features through plan entitlement. Account-level flags remain support overrides for controlled testing.

## Deposit Vault Checks

- Create a draft settlement with property, tenant, deposit amount, jurisdiction and summary.
- Add deductions and confirm totals update without a second settlement fetch after add/update/delete mutations.
- Link evidence and confirm the deduction evidence status changes to `attached`.
- Try linking structured evidence from another account; the trigger should raise `Deposit evidence reference account mismatch`.
- Generate a statement export and confirm metadata contains public-safe evidence entries only: evidence type, label, notes and deduction number.
- Lock a settlement and confirm deduction/evidence forms become read-only and service edits are blocked.
- Archive a settlement and confirm it remains visible but read-only.

## Deposit Dispute Pack Checks

- Import a settlement into a dispute pack.
- Confirm the statement item and individual deduction items are added with stable reference types.
- Confirm no raw internal ids are exposed in public statement metadata beyond required Tenaqo reference records used internally.

## Eco-Upgrade Planner Checks

- Save an EPC profile with current band unknown and confirm user-facing copy explains that EPC data is needed.
- Save a selected plan and confirm selected cost, EPC point gain, target reached and result band recalculate once after the batch.
- Confirm seeded costs are described as static planning estimates, not live quotes or web-searched prices.
- Confirm `Prepare handoff` only appears after the plan item has been saved.
- Confirm Portfolio Health links show Eco-Upgrade Planner under Portfolio Health, not as a separate top-level module.

## Security/RLS Checks

- Managers can manage their own account records only.
- Tenants can read only explicitly shared deposit settlement records, including locked statements that have not moved to a hidden tenant response state.
- Contractors cannot read Deposit Vault or Eco-Upgrade Planner records directly.
- Audit event tables are select/insert only for managers and immutable after insert.
- Eco plan item, eco audit and deposit audit triggers reject cross-account parent references.

## Rollback

- Disable the four Phase 4B account feature flags for affected accounts first.
- If needed, remove Growth+ plan entitlement wiring for the four flags and redeploy.
- Do not drop Phase 4B tables during a hot rollback unless data deletion has been explicitly approved.

## Release Evidence

- Run `npm run test`.
- Run `npm run build`.
- Run `npm run lint` if the script exists.
- Save smoke-test notes against this release file before enabling broad Growth+ access.
