# Risk Protection Suite Rollout

## Flags

Enable in staging/account as needed:

- `risk_protection_suite`
- `compliance_safe`
- `compliance_safe_tenant_acknowledgement`
- `evidence_vault`
- `evidence_vault_tenant_sharing`
- `evidence_vault_dispute_pack`

Keep `compliance_safe_expiry_reminders` disabled until reminder dispatch is enabled.

## Staging Checklist

- Create a Compliance Safe checklist.
- Create an Evidence Vault check-in report.
- Link the report to the Compliance Safe inventory item.
- Confirm the Compliance drawer shows report title, status, date and Open report action.
- Share the evidence report with a test tenant.
- Request Compliance Safe acknowledgement from the same tenant.
- Confirm Tenant Portal -> Pending Actions shows both tasks.
- Tenant signs the evidence report.
- Tenant acknowledges or disputes the compliance item.
- Confirm the landlord sees updated tenant response status.
- Create a deposit dispute pack.
- Add suggested Compliance Safe evidence to the pack.
- Add Evidence Vault report evidence.
- Export Evidence Vault and dispute pack PDFs.
- Confirm tenant cannot access the dispute pack.
- Confirm contractor cannot access suite records.
- Confirm cross-account linked evidence is blocked by service/RLS checks.

## Rollback

- Disable `risk_protection_suite`.
- Disable `evidence_vault_tenant_sharing` if tenant report review must pause.
- Disable `evidence_vault_dispute_pack` if dispute packs must pause.
- Disable `compliance_safe_tenant_acknowledgement` if compliance acknowledgement must pause.
- Keep existing records intact; do not delete evidence or audit tables during rollback.

