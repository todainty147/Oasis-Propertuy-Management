# Evidence Vault

Evidence Vault lets landlords and property managers create room-by-room inspection records for check-in, check-out, mid-tenancy and maintenance evidence workflows.

## Feature Flag

- `evidence_vault`
- `evidence_vault_tenant_sharing`
- `evidence_vault_dispute_pack`

## Routes

- `/documents/evidence-vault`
- `/documents/evidence-vault/:reportId`
- `/documents/evidence-vault/:reportId/print`
- `/tenant/evidence-reports`
- `/tenant/evidence-reports/:shareId`
- `/documents/evidence-vault/dispute-packs`
- `/documents/evidence-vault/dispute-packs/:packId`
- `/documents/evidence-vault/dispute-packs/:packId/print`

## Tables

- `inspection_reports`
- `inspection_rooms`
- `inspection_evidence_items`
- `inspection_photos`
- `inspection_signatures`
- `inspection_audit_events`
- `inspection_report_shares`
- `inspection_report_tenant_comments`
- `deposit_dispute_packs`
- `deposit_dispute_pack_items`
- `deposit_dispute_pack_exports`
- `deposit_dispute_pack_audit_events`

## Access Model

Evidence Vault records are account-scoped. Owners, admins and staff who can manage the account can manage inspection records. Contractors cannot access Evidence Vault records.

Tenant access is only through `inspection_report_shares`. A tenant can read a shared inspection report, linked rooms, evidence items and photo metadata, add tenant comments, and sign from the tenant portal. Tenants cannot edit landlord notes, condition ratings, photos, report status or landlord signatures.

## Room Templates

New reports are pre-filled with common inspection sections:

- Entrance / hallway
- Kitchen
- Living room
- Bedroom
- Bathroom
- Garden / exterior
- Meters
- Keys
- Appliances

Each section is created with default checklist items so a walkthrough starts with a usable structure.

## Report Statuses

- `draft`
- `ready_for_signature`
- `signed`
- `locked`
- `archived`

Locked and archived reports are viewable but not editable. This preserves the organisational evidence record.

## Photos

Photos are uploaded through the existing secure document upload flow and linked to `inspection_photos`. Thumbnails use signed document URLs where available. Evidence photos are not placed in a public bucket.

## Print Export

The print route renders a browser-printable report with property, tenant, room, checklist, notes, condition ratings, photo thumbnails, landlord acknowledgements, tenant signature status, tenant comments and tenant response timestamps. Browser print can be used to save a PDF for the MVP.

## Tenant Sharing

Landlords can share a report with the linked tenant from the builder. Share statuses are:

- `shared`
- `viewed`
- `tenant_signed`
- `tenant_disputed`
- `revoked`
- `expired`

The tenant portal review page lets tenants view the shared report, add general or item-level comments, mark disputes, and sign the report. Tenant copy states that signature confirms receipt/review, not necessarily agreement with every item unless stated.

## Deposit Dispute Pack

Deposit dispute packs help landlords compile a supporting evidence bundle from existing Tenaqo records. Packs include a summary, deduction schedule, evidence index and browser-printable PDF export.

Pack statuses are:

- `draft`
- `ready`
- `exported`
- `locked`
- `archived`

Pack PDFs use the disclaimer: “This pack is an organisational evidence bundle prepared in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice.”

## MVP Limitations

- No dedicated generated PDF service yet; browser print is the MVP export path.
- Tenant sharing is report-level only; full tenant-shared dispute packs are future work.
- Signature acknowledgements record review/receipt only; Tenaqo does not capture biometric signatures.

## Future Enhancements

- Dedicated PDF generation
- ZIP bundle export
- Tenant-shared dispute pack review
- Scheme-specific deposit dispute templates
- Communication ingestion
- Invoice matching
- AI evidence summarisation after a separate approval/security review
