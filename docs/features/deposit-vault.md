# Deposit Vault

Deposit Vault adds landlord-controlled deposit deduction records and settlement statement preparation to the existing finance and evidence workflows.

## Feature Flags

- `deposit_deductions_log`
- `deposit_settlement_statement`

Both flags are account-level controls and are disabled by default. Staging/internal accounts should be enabled first through the existing account feature flag pattern.

## Routes

- `/finance/deposit-vault`

## Tables

- `deposit_settlements`
- `deposit_deductions`
- `deposit_deduction_evidence_links`
- `deposit_settlement_exports`
- `deposit_settlement_audit_events`

## What It Does

- Creates a Deposit Deductions Log for itemised landlord review.
- Builds a Deposit Settlement Statement with proposed deductions, evidence references and amount to return.
- Links deductions to existing inspection, document, maintenance and dispute-pack evidence.
- Preserves audit events for create, update, evidence link, statement generation, lock and archive actions.

## Settlement Statement Disclaimer

Deposit Settlement Statements are organisational records for landlord review. They do not replace legal advice, do not guarantee the outcome of any deposit dispute, and do not mean Tenaqo holds funds, moves money or operates as a payment rail.

## Access Model

Owners/admins/staff who can manage the account can manage settlement records. Tenants can read only records explicitly shared for their tenant profile. Contractors do not receive access to the settlement or deduction log.

## Limitations

- Browser print/export remains the current PDF pattern.
- Tenaqo does not collect rent, hold deposits, move money or operate as a payment rail.
- The workflow supports dispute preparation and landlord review only.
