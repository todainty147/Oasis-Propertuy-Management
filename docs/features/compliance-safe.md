# Compliance Safe

Compliance Safe helps landlords and property managers keep an organisational compliance record for tenancy documents, safety certificates, deposit evidence, tenant acknowledgements and expiry review. Tenaqo helps organise evidence and does not replace legal advice.

## Feature Flags

- `compliance_safe`
- `compliance_safe_uk`
- `compliance_safe_pl`
- `compliance_safe_tenant_acknowledgement`
- `compliance_safe_expiry_reminders`

Tenant acknowledgement and expiry reminders are account-level feature flags controlled by Tenaqo operator/support workflows during rollout. Owner/admin/staff roles decide what a user can do after the account has the feature; they do not grant the feature by themselves.

## Templates

Templates are stored in `compliance_templates` and `compliance_requirements`.

UK/England checklist:

- Right to rent check
- Gas safety certificate
- EPC
- EICR
- Deposit protection certificate
- Deposit prescribed information
- Tenancy agreement
- Inventory check-in report
- Smoke/CO alarm confirmation
- Tenant onboarding acknowledgement
- Local licence or HMO licence optional

Poland/Najem Okazjonalny checklist:

- Umowa najmu okazjonalnego
- Akt notarialny
- Alternative address declaration
- Owner consent for alternative address
- Tax office notification evidence
- Tenant identity evidence
- Protokol zdawczo-odbiorczy
- Kaucja record

Running the same template again creates only missing items for the same account, property, tenant and requirements.

## Status Model

- `missing`
- `logged`
- `acknowledged`
- `expiring_soon`
- `expired`
- `needs_review`
- `not_applicable`

`not_applicable` items are excluded from rating calculations. `logged`, `acknowledged` and `expiring_soon` count as complete; `expiring_soon` is also a warning. `missing`, `expired` and `needs_review` count as incomplete.

## Evidence Attachment

Checklist items can link to:

- an existing Tenaqo document through `evidence_document_id`
- a newly uploaded document using the existing secure document upload flow
- an Evidence Vault inspection report through `evidence_source_type = 'inspection_report'` and `evidence_source_id`

Documents use the existing private storage and signed URL pattern. Compliance Safe does not create a public bucket.

## Tenant Acknowledgement

Landlords request acknowledgement from the item detail drawer. Tenants respond from Tenant Portal -> Compliance Documents.

Tenant acknowledgement copy:

> I confirm that I have received/reviewed this document or compliance record. This acknowledgement does not replace legal advice.

Tenants can acknowledge or add a question/dispute. Acknowledgement sets the checklist item to `acknowledged`. A dispute sets the item to `needs_review`. Tenants cannot edit landlord notes, evidence, expiry dates, statuses or checklist content.

## Expiry Handling

Items with `expires_at` are derived as:

- `expired` when the expiry date is before today
- `expiring_soon` when the expiry date is within `reminder_days_before`
- otherwise `logged` or `acknowledged` when evidence has been recorded

Reminder sending is prepared through `reminder_days_before` and `last_reminder_sent_at`; automated reminder dispatch remains a future scheduler task.

## RLS Model

- Owners/admins/staff who can manage the account can manage compliance checklist records.
- Tenants can read only acknowledgement records assigned to their tenant profile.
- Tenants can read linked compliance items only through an active acknowledgement request.
- Tenants can update only their acknowledgement response fields.
- Contractors cannot access Compliance Safe records.
- Account isolation is enforced through `account_id` policies and tenant membership checks.

## Audit Events

Compliance events are stored in `compliance_evidence_events`, including:

- `checklist_created`
- `item_logged`
- `document_attached`
- `document_uploaded`
- `expiry_date_set`
- `item_marked_not_applicable`
- `item_marked_needs_review`
- `acknowledgement_requested`
- `tenant_acknowledged`
- `tenant_disputed`
- `reminder_sent`

## Limitations

- Automated expiry reminder delivery is not enabled in this phase.
- Tenant acknowledgement records receipt/review only; it does not guarantee legal validity.
- Tenaqo does not provide legal advice or guarantee compliance outcomes.

