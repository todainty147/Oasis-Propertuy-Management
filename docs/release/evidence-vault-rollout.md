# Evidence Vault Rollout

Use this checklist in staging before enabling Evidence Vault for more accounts.

## Staging Checklist

- Enable the `evidence_vault` feature flag for the test account.
- Create a draft check-in report.
- Confirm rooms and checklist items are generated.
- Add condition ratings.
- Add notes and save them.
- Upload photos from desktop and mobile.
- Attach an existing document.
- Lock the report.
- Confirm locked reports cannot be edited.
- Open the print route and use browser print/save PDF.
- Archive the report.
- Verify tenant and contractor sessions cannot access landlord Evidence Vault.
- Verify the existing Documents page still loads and uploads documents.

## Rollback

- Disable the `evidence_vault` feature flag for affected accounts.
- Keep existing inspection tables intact for audit continuity.
- Re-enable only after the affected migration or frontend release has been corrected.
