# Mobile Privacy Readiness

OASIS is prepared for future PWA/Capacitor iOS and Android submission by providing both an in-app deletion path and a public web deletion request path.

## App Store Requirements

Mobile apps that allow account creation must provide:

- An in-app account deletion path.
- A public web URL where users can request account or data deletion.
- Clear explanation of what is deleted, anonymised, restricted, or retained.
- A privacy policy link and data retention policy link.
- A way to revoke push tokens and unsubscribe from push notifications.

## OASIS Implementation

- In-app route: `Settings -> Data & Privacy` at `/settings/data-privacy`.
- Public route: `/privacy/delete-account` and `/data-deletion`.
- Deep-link-ready route: `/settings/data-privacy?request=user_account_deletion`.
- Device-token table: `user_devices`, with `revoke_user_devices(user_id)` for privacy processing.
- Existing push-token table compatibility: `device_push_tokens` is also revoked where present.

## In-App Copy

OASIS stores rental operation records such as tenants, documents, finance records, maintenance history, and audit events. Some records may need to be retained for legal, tax, security, fraud prevention, accounting, dispute resolution, or audit reasons. We delete or anonymise personal data where appropriate and explain anything retained.

## Public Web Deletion Page

The public page must be accessible without login and must not promise immediate deletion of all records. It explains:

- How to request account deletion.
- What may be deleted.
- What may be anonymised.
- What may be retained and why.
- How OASIS responds.
- How to contact privacy support.

## Mobile Metadata Checklist

- Account deletion URL: `/privacy/delete-account`
- Privacy policy URL: `/privacy`
- Data retention policy URL: `/settings/data-privacy` for signed-in users, `docs/DATA_RETENTION_POLICY.md` for operator documentation.
- Push token unsubscribe: revoke token on sign-out and through deletion processor.
- Device revocation: `revoke_user_devices(user_id)`.
- Account deletion deep link: `/settings/data-privacy?request=user_account_deletion`.

## Compliance Risks

- Do not state that all finance, tax, audit, security, compliance, or legal records are immediately deleted.
- Do not expose operational delete buttons to mobile clients.
- Do not leave push tokens active after deletion approval.
- Do not let tenants or contractors request deletion of another tenant/contractor profile.
- Do not allow staff to close workspaces unless explicit owner/admin/root permission exists.
