# Product Analytics Event Review Template

Use this before adding or changing product analytics events.

## Event Metadata

- Event name:
- Product area:
- Event owner:
- Trigger:
- Frontend event or server-confirmed event:
- First release target:

## Business Question

- What decision will this event help us make?
- Which metric does it support?
- What action would we take if the metric is poor?

## Payload

Allowed properties:

- 

Rejected/redacted properties:

- 

Does the payload include any of the following?

- Email: yes / no
- Phone: yes / no
- Name: yes / no
- Full address: yes / no
- Document filename/path: yes / no
- Invite/reset token: yes / no
- Payment/card/bank detail: yes / no
- Free-text user content: yes / no

If any answer is yes, redesign the payload or get explicit privacy/security review before implementation.

## Segmentation

- Role:
- Account/demo status:
- Subscription plan/status:
- Locale:
- Source:

## Implementation Notes

- Analytics sink:
- Wrapper/service used:
- Failure behavior:
- Tests required:
- Retention:
- Consent/privacy dependency:

## Approval

- Product approval:
- Engineering approval:
- Security/privacy approval, if needed:

