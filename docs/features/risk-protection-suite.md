# Risk Protection Suite

Risk Protection Suite connects Compliance Safe, Photo Evidence Vault and Deposit Dispute Packs into one launch-ready workflow for organised evidence and compliance records.

## Feature Flags

- `risk_protection_suite`
- `compliance_safe`
- `compliance_safe_tenant_acknowledgement`
- `compliance_safe_expiry_reminders`
- `evidence_vault`
- `evidence_vault_tenant_sharing`
- `evidence_vault_dispute_pack`

## Module Relationship

- Compliance Safe tracks checklist requirements, documents, expiry dates and tenant acknowledgements.
- Evidence Vault stores room-by-room inspection records, notes, photos, signatures and tenant responses.
- Deposit Dispute Packs compile selected supporting evidence for deposit dispute preparation.
- Deposit Vault prepares itemised Deposit Settlement Statements and deduction evidence for landlord review.
- Eco-Upgrade Planner prepares indicative EPC upgrade paths for landlord review and maintenance handoff.

Compliance Safe can link an Evidence Vault report as evidence without duplicating report data. Evidence Vault check-in reports can also be linked back to matching Compliance Safe inventory or onboarding items.

## Tenant Portal Pending Actions

Tenant Portal -> Pending Actions aggregates:

- Evidence reports awaiting review/signature
- Compliance documents awaiting acknowledgement
- Completed signed reports and acknowledged documents

Tenants can only access records explicitly shared with their tenant profile. Linked evidence ids do not grant access to unrelated reports or documents.

## RLS Model

- Owners/admins/staff manage suite records for their account according to the existing role model.
- Tenants read only active report shares and acknowledgement requests assigned to their tenant record.
- Tenants cannot edit landlord evidence, checklist content, expiry dates, condition ratings, landlord notes, landlord photos or landlord signatures.
- Contractors cannot access Evidence Vault, Compliance Safe or Deposit Dispute Packs in the MVP.
- Contractors cannot access Deposit Vault or Eco-Upgrade Planner records; they may only see linked work-order context intentionally shared with them.
- Deposit Dispute Packs remain landlord-side only.
- Cross-links are checked at the service boundary for same account and compatible property/tenant context.

## PDF And Export Model

Evidence report PDFs and deposit dispute pack PDFs use readable light/print styling, Tenaqo branding and safe disclaimers. Linked Compliance Safe evidence appears as human-readable evidence references in dispute pack exports.

Disclaimer:

> This report/pack is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice.

## Safe Wording

Use:

- organised evidence
- evidence record
- acknowledgement
- tenant response
- compliance checklist
- deposit dispute preparation
- does not replace legal advice

Avoid overclaiming phrases about court certainty, guaranteed outcomes, binding legal effect, automatic recovery or eviction certainty.

## Known Limitations

- Automated compliance reminder dispatch is prepared but not enabled.
- Tenant-shared dispute packs are future work.
- Browser print is the MVP export path.
- Communication ingestion and scheme-specific exports are future enhancements.
- Deposit Vault and Eco-Upgrade Planner remain account-flagged rollout features.
