# Property Risk And Deposit Controls Rollout

Use this checklist before enabling Deposit Vault or Eco-Upgrade Planner beyond staging/internal accounts.

## Feature Flags

- Confirm `deposit_deductions_log` is disabled for general accounts.
- Confirm `deposit_settlement_statement` is disabled for general accounts.
- Confirm `eco_upgrade_planner` is disabled for general accounts.
- Confirm `portfolio_health_eco_compliance` is disabled for general accounts.
- Enable only selected staging/internal accounts through the existing account feature flag path.

## Deposit Vault Smoke Test

- Open `/finance/deposit-vault`.
- Create a draft settlement for a property/tenant.
- Add deduction items with zero or positive amounts.
- Link at least one inspection or document evidence reference.
- Generate a Deposit Settlement Statement.
- Confirm the statement shows proposed deductions, amount to return, evidence references and the safe disclaimer.
- Lock the settlement and confirm further edits are blocked by the service layer.

## Eco-Upgrade Planner Smoke Test

- Open `/portfolio-health/eco-upgrade-planner`.
- Select a property and save an EPC profile.
- Select upgrade options and confirm indicative totals update.
- Save the plan and reload the page.
- Prepare a maintenance work-order handoff note.
- Confirm copy says estimates are indicative and should be reviewed with an EPC assessor.

## Access Checks

- Confirm owners/admins/staff can manage enabled records.
- Confirm tenants only see explicitly shared deposit settlement records.
- Confirm contractors cannot access Deposit Vault or Eco-Upgrade Planner records.
- Confirm contractors only see linked work-order context after landlord-controlled handoff.

## Regression Checks

- Evidence Vault reports still open and export.
- Deposit Dispute Packs still compile and export.
- Compliance Safe still links Evidence Vault reports.
- Finance and Portfolio Health dashboards still load for accounts without the new flags.

## Copy Guardrails

- Do not describe Tenaqo as collecting rent, holding deposits, moving money or operating as a payment rail.
- Do not describe EPC estimates or deposit statements as guaranteed outcomes.
- Keep legal, tax, EPC and deposit dispute disclaimers visible in export-facing copy.
