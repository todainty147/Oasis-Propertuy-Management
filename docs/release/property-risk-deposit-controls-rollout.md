# Property Risk And Deposit Controls Rollout

Use this checklist before enabling Deposit Vault or Eco-Upgrade Planner for broad Growth+ account use.

## Plan Availability

- Confirm Starter accounts do not see Deposit Vault or Eco-Upgrade Planner.
- Confirm Growth accounts can access Deposit Vault and Eco-Upgrade Planner.
- Confirm Pro and Operator/Agency accounts inherit access.
- Treat account-level feature flags as explicit support overrides only; plan entitlements are now the normal access path.

## Deposit Vault Smoke Test

- Open `/finance/deposit-vault`.
- Create a draft settlement for a property/tenant.
- Add deduction items with zero or positive amounts.
- Link at least one inspection or document evidence reference.
- Generate a Deposit Settlement Statement.
- Confirm the statement shows proposed deductions, amount to return, public-safe evidence references and the safe disclaimer.
- Lock the settlement and confirm further edits are blocked by the service layer.

## Eco-Upgrade Planner Smoke Test

- Open `/portfolio-health/eco-upgrade-planner`.
- Select a property and save an EPC profile.
- Select upgrade options and confirm indicative totals update.
- Save the plan and reload the page.
- Prepare a maintenance work-order handoff note.
- Confirm copy says estimates are indicative and should be reviewed with an EPC assessor.

## Access Checks

- Confirm owners/admins/staff can manage Growth+ records.
- Confirm tenants only see explicitly shared deposit settlement records.
- Confirm contractors cannot access Deposit Vault or Eco-Upgrade Planner records.
- Confirm contractors only see linked work-order context after landlord-controlled handoff.
- Confirm cross-account structured evidence references are rejected for Deposit Vault links.

## Regression Checks

- Evidence Vault reports still open and export.
- Deposit Dispute Packs still compile and export.
- Compliance Safe still links Evidence Vault reports.
- Finance and Portfolio Health dashboards still load for accounts without the new flags.

## Copy Guardrails

- Do not describe Tenaqo as collecting rent, holding deposits, moving money or operating as a payment rail.
- Do not describe EPC estimates or deposit statements as guaranteed outcomes.
- Keep legal, tax, EPC and deposit dispute disclaimers visible in export-facing copy.
