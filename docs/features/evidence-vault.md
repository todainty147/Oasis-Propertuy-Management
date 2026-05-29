# Evidence Vault

Evidence Vault lets landlords and property managers create room-by-room inspection records for check-in, check-out, mid-tenancy and maintenance evidence workflows.

## Feature Flag

- `evidence_vault`

## Routes

- `/documents/evidence-vault`
- `/documents/evidence-vault/:reportId`
- `/documents/evidence-vault/:reportId/print`

## Tables

- `inspection_reports`
- `inspection_rooms`
- `inspection_evidence_items`
- `inspection_photos`
- `inspection_signatures`
- `inspection_audit_events`

## Access Model

Evidence Vault records are account-scoped. Owners, admins and staff who can manage the account can manage inspection records. Tenants and contractors do not get landlord Evidence Vault access in the MVP unless a separate sharing flow is added later.

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

The print route renders a browser-printable report with property, tenant, room, checklist, notes, condition ratings and photo thumbnails. Browser print can be used to save a PDF for the MVP.

## MVP Limitations

- No dedicated generated PDF service yet.
- No tenant portal sharing flow yet.
- Signature acknowledgements record a manual acknowledgement only; Tenaqo does not capture digital signatures.

## Future Enhancements

- Tenant signature flow
- Landlord signature flow
- Tenant portal sharing
- Dedicated PDF generation
- Deposit dispute pack export
