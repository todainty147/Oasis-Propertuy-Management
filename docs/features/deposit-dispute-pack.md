# Deposit Dispute Pack

Deposit Dispute Pack helps landlords and property managers compile an organised evidence bundle for deposit dispute preparation. It does not guarantee the outcome of any deposit dispute and does not replace legal advice.

## Feature Flag

- `evidence_vault_dispute_pack`

## Tables

- `deposit_dispute_packs`
- `deposit_dispute_pack_items`
- `deposit_dispute_pack_exports`
- `deposit_dispute_pack_audit_events`

## Evidence Sources

The MVP can reference:

- Check-in and check-out inspection reports
- Evidence Vault photos
- Tenant comments and disputes
- Landlord and tenant signature timestamps
- Manual invoice, quote, receipt and note entries
- Existing documents by reference where selected by the landlord
- Deposit Settlement Statements and Deposit Deductions Log items where selected by the landlord

Suggested evidence is shown for review. Tenaqo does not auto-include everything without landlord confirmation.

## Compliance Safe Suggestions

When a pack is opened for a property/tenant, Tenaqo suggests relevant Compliance Safe evidence for landlord review:

- Deposit protection certificate
- Deposit prescribed information
- Tenancy agreement
- Inventory/check-in report
- Tenant onboarding acknowledgement

The landlord must explicitly add a suggestion to the pack. Suggested Compliance Safe items are referenced as `compliance_safe_item` evidence references and displayed with human-readable labels in the evidence index.

## Deposit Vault Suggestions

Deposit Settlement Statements can be imported into a dispute pack as landlord-selected evidence. Individual Deposit Deductions Log items can also be referenced so the pack shows the deduction title, amount, category, notes and linked supporting evidence.

The pack keeps the same disclaimer: Tenaqo organises evidence for dispute preparation, does not replace legal advice and does not guarantee the outcome of any deposit dispute.

## Pack Statuses

- `draft`
- `ready`
- `exported`
- `locked`
- `archived`

Draft, ready and exported packs remain editable. Locked and archived packs are viewable/exportable, but item edits are blocked in the service layer.

## Deduction And Evidence Items

Pack items can be added, edited and removed while the pack is editable. Amounts must be zero or positive, and item types are validated against the supported pack item list before the app writes to Supabase.

Child rows are protected by both service-level ownership checks and database triggers so a pack item/export/audit row cannot reference a pack from another account.

## PDF Structure

The browser-printable PDF includes:

- Cover page
- Summary
- Timeline
- Deduction schedule
- Evidence index
- Check-in / check-out comparison where report references are available
- Signatures and tenant response
- Photo groups from referenced inspection reports
- Supporting documents and inspection report references
- Safe disclaimer

## RLS Model

Packs are account-scoped. Owners, admins and staff who can manage the account can manage packs. Tenants and contractors cannot access landlord dispute packs in the MVP.

## Limitations

- Browser print is the MVP export path.
- ZIP bundles are not implemented yet.
- Tenant-shared dispute packs are not implemented yet.
- The pack is organisational evidence, not legal advice.
- Deposit Vault settlement import is landlord-controlled and does not move or hold money.

## Future Enhancements

- ZIP bundle export
- Tenant-shared pack review
- Scheme-specific export templates
- Communication ingestion
- Invoice matching
- AI evidence summarisation after a separate approval/security review
