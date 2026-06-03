# Maintenance Smart Diagnostics Rollout

## Enablement

Enable only for staging/internal accounts first:

- `maintenance_smart_diagnostics`
- `tenant_maintenance_diagnostics`
- `maintenance_deposit_evidence_linking`
- `maintenance_eco_upgrade_linking`

Starter accounts should not receive these flags.

## Checks

- Confirm tenant request submission still works when flags are disabled.
- Confirm diagnostic sessions attach to maintenance requests when enabled.
- Confirm emergency answers show the emergency warning and mark the request urgent.
- Confirm landlords see diagnostic summary only as a review aid.
- Confirm no deposit deduction, eco-upgrade item, compliance item, or work order is created automatically.

Diagnostics are basic information gathering only and are not a substitute for professional advice.
