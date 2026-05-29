# Compliance Safe Rollout

## Feature Flags

- Enable `compliance_safe`.
- Enable `compliance_safe_uk` for UK/England template validation.
- Enable `compliance_safe_pl` for Poland template validation.
- Enable `compliance_safe_tenant_acknowledgement` for tenant portal acknowledgement testing.
- `compliance_safe_expiry_reminders` can remain disabled until reminder dispatch is wired.

## Staging Checklist

- Create a UK/England checklist.
- Create a Poland/Najem Okazjonalny checklist.
- Confirm rerunning the same template does not duplicate items.
- Open an item detail drawer.
- Attach an existing document.
- Upload a new document.
- Link an Evidence Vault inspection report for an inventory/check-in item.
- Set an expiry date and confirm `expiring_soon` / `expired` display correctly.
- Mark an item as logged.
- Mark an item as not applicable and confirm it is excluded from the rating.
- Mark an item as needs review.
- Request tenant acknowledgement.
- Confirm the tenant sees the item in Tenant Portal -> Compliance Documents.
- Confirm the tenant can acknowledge.
- Confirm the tenant can submit a question/dispute.
- Confirm the landlord sees acknowledgement or needs review state.
- Confirm tenant cannot access unshared compliance items.
- Confirm tenant cannot edit landlord evidence, notes, expiry dates or statuses.
- Confirm contractor cannot access Compliance Safe.
- Confirm rating cards update.
- Confirm existing Documents, Evidence Vault, HMRC and tenant portal routes still work.

## Rollback

- Disable `compliance_safe_tenant_acknowledgement`.
- Disable `compliance_safe_expiry_reminders`.
- Disable `compliance_safe` if the whole surface must be hidden.
- Existing rows can remain in place; feature flags hide the new surfaces.

