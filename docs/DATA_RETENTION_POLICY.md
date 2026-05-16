# Tenaqo Data Retention Policy

Tenaqo stores operational rental records for property management, tenant support, contractor coordination, finance, compliance, documents, billing, security, and audit. The right to erasure is handled through controlled deletion, minimisation, anonymisation, restriction, and retention with documented reasons. Tenaqo does not hard-delete operational records simply because a user asks for account deletion.

## Core Principles

- Deletion is account-scoped, role-aware, auditable, and server-side only.
- Finance, tax, legal, compliance, dispute, fraud-prevention, and security records may be retained.
- Personal data is deleted or anonymised when it is no longer needed.
- Client apps can request deletion/export, but cannot directly delete operational records.
- Device tokens, notification preferences, and avoidable identifiers are revoked quickly.

## Data Map

| Category | Personal data examples | Default action | Retention reasons | Notes |
| --- | --- | --- | --- | --- |
| User profile | Name, role labels, avatar, phone, email-like metadata | Anonymise or restrict | Account integrity, audit continuity | Auth identity may require privileged deletion after review. |
| Supabase auth user | Email, auth IDs, sessions, MFA factors | Delete or disable after review | Security, abuse investigation, legal hold | Requires service-role/admin auth operation; DB request records remain minimised. |
| Memberships | User ID, account ID, role | Remove membership | Access control, audit trail | Removal is preferred over deleting historical operational records. |
| Tenant profiles | Name, email, phone, user ID, risk notes | Anonymise or restrict | Tenancy law, disputes, finance, safety | Lease, payment, document, and compliance references may remain. |
| Contractor profiles | Name, email, phone, user ID | Anonymise or deactivate | Work order history, invoices, disputes, safety | Assigned work orders retain minimised contractor labels. |
| Property records | Address, owner notes, occupancy data | Retain/restrict | Rental operations, tax, compliance, contracts | Address may be operational/legal data, not deleted during user erasure. |
| Finance ledger | Amounts, dates, payment statuses, tenant references | Retain with minimisation | Accounting, tax, fraud prevention, dispute resolution | Append-only records must not be mutated unsafely. |
| Expected charges | Rent schedules, due dates, amounts | Retain/restrict | Accounting, tenancy obligations, disputes | Personal identifiers should be minimised where possible. |
| Invoices | Supplier/tenant names, invoice refs, amounts | Retain with minimisation | Tax, accounting, contract evidence | Direct contact fields can be minimised when not legally required. |
| Documents | Names, files, storage paths, signatures, evidence | Delete, restrict, or retain | Legal, tenancy, compliance, audit | Eligibility depends on document type, ownership, and legal hold. |
| Maintenance requests | Reporter, descriptions, photos, property context | Anonymise free text where safe, retain core record | Habitability, safety, disputes, contractor coordination | Avoid deleting records needed for property history. |
| Work orders | Contractor identity, notes, photos, invoice fields | Anonymise contractor/user fields where safe, retain core record | Safety, finance, warranty, disputes | Assigned work history remains operational evidence. |
| Compliance records | Evidence, due dates, assessments, audit findings | Retain/restrict | Legal compliance, safety, regulatory evidence | Minimise direct personal fields when possible. |
| Audit/security logs | Actor ID, action, timestamp, metadata | Retain with minimisation | Security integrity, fraud prevention, legal defence | Logs are append-only and not directly editable by clients. |
| AI usage/logs | User/account IDs, prompt metadata, usage counts | Restrict or anonymise metadata | Abuse prevention, cost controls, security, diagnostics | Avoid storing unnecessary raw personal content. |
| Notifications | User ID, message content, links | Delete eligible user notifications | UX, security event history | Operational security events may be retained elsewhere. |
| Device tokens | Push token, platform, app version, device label | Revoke/delete token | Security, app compliance | Tokens are revoked during deletion and sign-out flows. |
| Billing/subscription records | Customer IDs, plan, invoices, payment status | Retain with minimisation | Tax, accounting, contract, fraud prevention | Stripe/vendor data follows vendor retention and legal requirements. |

## Default Retention Approach

- **Delete:** device tokens, transient notification rows, expired exports, unnecessary personal metadata.
- **Anonymise:** user display labels, tenant/contractor names and contact fields, free-text personal notes where safe.
- **Restrict:** documents, compliance evidence, and operational records that are still needed but should no longer be broadly visible.
- **Retain:** finance ledger, audit/security logs, compliance evidence, billing records, and legal/tax records.

## Workspace Statuses

Workspace/account status values are:

- `active`
- `suspended`
- `closure_pending`
- `closed`
- `deletion_scheduled`
- `deleted`

Closure does not mean all records are destroyed. It means access is restricted and processing follows the retention review outcome.

## Implementation Notes

- Use `data_deletion_requests` as the canonical request record.
- Use `data_deletion_processing_log` for every delete, anonymise, restrict, retain, token revocation, membership removal, or auth-user deletion action.
- Use `log_security_event` for user-visible security/audit events.
- Use privileged RPCs for processing; do not expose direct deletes for operational records.
- Store retention summaries as JSON so admin/root reviewers can see what was deleted, anonymised, restricted, and retained.
