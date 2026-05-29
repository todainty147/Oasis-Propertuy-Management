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

Suggested evidence is shown for review. Tenaqo does not auto-include everything without landlord confirmation.

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

## Future Enhancements

- ZIP bundle export
- Tenant-shared pack review
- Scheme-specific export templates
- Communication ingestion
- Invoice matching
- AI evidence summarisation after a separate approval/security review
