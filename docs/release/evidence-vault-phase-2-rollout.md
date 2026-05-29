# Evidence Vault Phase 2 Rollout

## Tenant Sharing Checklist

- Enable `evidence_vault_tenant_sharing` for the staging account.
- Create or open an Evidence Vault inspection report with a linked tenant.
- Share the report with the tenant.
- Confirm the tenant sees the report in Tenant Portal → Evidence Reports.
- Confirm the tenant can add a comment.
- Confirm the tenant can mark an item as disputed.
- Confirm the tenant can sign from the tenant portal.
- Confirm the landlord sees tenant response status, comments and signature status.
- Confirm the tenant cannot edit landlord notes, condition ratings, photos, lock/archive state or landlord acknowledgements.
- Revoke the share and confirm tenant access is blocked.
- Generate the inspection report PDF and confirm signatures/comments are shown.

## Deposit Dispute Pack Checklist

- Enable `evidence_vault_dispute_pack` for the staging account.
- Open Evidence Vault → Deposit Dispute Packs.
- Create a pack for a property and optional tenant.
- Add deduction items.
- Edit and remove a deduction item.
- Add inspection report evidence references.
- Mark a pack ready, then export it and confirm status changes to `exported`.
- Lock a pack and confirm item edits are blocked.
- Archive a pack and confirm item edits are blocked.
- Generate the dispute pack PDF with browser print.
- Confirm the disclaimer is present.
- Confirm tenant and contractor accounts cannot access landlord packs.

## Regression Checklist

- Existing Evidence Vault builder still works.
- Existing landlord acknowledgement still works.
- Existing report PDF still works.
- Existing Documents page still works.
- Existing tenant/property pages still work.
- Existing HMRC integration still works.

## Rollback

- Disable `evidence_vault_tenant_sharing`.
- Disable `evidence_vault_dispute_pack`.
- Existing rows can remain in place; feature flags hide the new surfaces.
