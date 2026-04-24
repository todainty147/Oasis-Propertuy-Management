# Email Delivery Architecture

## Purpose

Use this runbook to debug OASIS email delivery without conflating:

- Supabase Auth mail
- OASIS Edge Function mail
- Resend API delivery
- Resend SMTP delivery

The main operational rule is simple:

- **Landlord signup confirmation** goes through **Supabase Auth SMTP**
- **Invites, password resets, and reminders** go through **OASIS Edge Functions using the Resend API**

These are separate paths. One can fail while the other continues working.

## Current Email Paths

| Flow | Triggered by | Sending path | Provider auth source | Repo proof |
| --- | --- | --- | --- | --- |
| Landlord signup confirmation | `POST /auth/v1/signup` | Supabase Auth | Supabase Auth SMTP settings | Not handled by app Edge Functions |
| Invite email | `/functions/v1/invite-user` | OASIS Edge Function -> Resend API | `RESEND_API_KEY` | [invite-user/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/invite-user/index.ts) |
| Password reset email | `/functions/v1/send-password-reset-email` | OASIS Edge Function -> Resend API | `RESEND_API_KEY` | [send-password-reset-email/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-password-reset-email/index.ts) |
| Reminder emails | scheduled Edge Function | OASIS Edge Function -> Resend API | `RESEND_API_KEY` | [send-reminder-emails/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-reminder-emails/index.ts) |

## Secret And Config Map

### 1. Supabase Auth SMTP

Used for:

- landlord signup confirmation
- any other built-in Supabase Auth emails still routed through `/auth/v1/*`

Configured in:

- Supabase Dashboard -> Authentication -> SMTP settings

Required values:

- SMTP host
- SMTP port
- SMTP username
- SMTP password
- sender email
- sender name

For Resend SMTP, expected values are typically:

- host: `smtp.resend.com`
- port: `465` or `587`
- username: `resend`
- password: your active Resend SMTP/API credential

This configuration is **not** read from the OASIS repo or Edge Function env.

### 2. OASIS Edge Function Email Secrets

Used for:

- invite emails
- password reset emails
- reminder emails

Secret names used in code:

- `RESEND_API_KEY`
- `OASIS_INVITES_FROM`
- `OASIS_PASSWORD_RESETS_FROM`
- `APP_URL`
- `ALLOWED_APP_ORIGINS`

Repo proof:

- [invite-user/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/invite-user/index.ts)
- [send-password-reset-email/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-password-reset-email/index.ts)
- [send-reminder-emails/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-reminder-emails/index.ts)

## Sender Addresses In Code

### Invite emails

Primary sender env:

- `OASIS_INVITES_FROM`

Fallback in code:

- `invites@auth.oasisrental.app`

### Password reset emails

Primary sender env:

- `OASIS_PASSWORD_RESETS_FROM`

Fallback order:

1. `OASIS_PASSWORD_RESETS_FROM`
2. `OASIS_INVITES_FROM`
3. `no-reply@auth.oasisrental.app`

## Operational Interpretation

If invites and password resets are working, but landlord signup confirmation fails, the most likely cause is:

- **Supabase Auth SMTP misconfiguration**

Not:

- `RESEND_API_KEY` missing for Edge Functions
- invite function regression
- password reset function regression

This is because invites and resets do not use Supabase Auth SMTP in OASIS.

## Common Failure Patterns

### Case 1: Signup confirmation fails, invites still work

Likely cause:

- Supabase Auth SMTP credentials are wrong, stale, or rejected

Typical log signal:

- `POST /auth/v1/signup`
- `500: Error sending confirmation email`
- `535 Authentication credentials invalid`

Meaning:

- Supabase Auth could not authenticate to the SMTP provider

### Case 2: Invites fail, signup confirmation still works

Likely cause:

- `RESEND_API_KEY` missing/invalid in Edge Function secrets
- Edge Function deployment drift
- trusted origin / function config issue

### Case 3: Both signup confirmation and invites fail

Possible causes:

- sender domain issue
- Resend account issue
- broad provider outage
- multiple independent config issues

## Fast Triage Checklist

### When `POST /auth/v1/signup` returns 500

1. Check Supabase Auth logs.
2. If you see `Error sending confirmation email`, treat it as mail-provider/config first.
3. If the error includes `535 Authentication credentials invalid`, verify:
   - host
   - port
   - username
   - password
4. If using Resend SMTP, verify username is `resend`.
5. Retry signup after saving SMTP settings.

### When invite email fails

1. Check Edge Function logs for `invite-user`.
2. Check `outbound_email_events`.
3. Verify `RESEND_API_KEY` secret.
4. Verify `OASIS_INVITES_FROM`.
5. Redeploy `invite-user` only if the function code or secrets changed.

## Current Repo-Backed Answer To "What Can Be Rotated?"

### Affects landlord signup confirmation

- the SMTP password stored in Supabase Auth settings

### Affects invites/password resets/reminders

- `RESEND_API_KEY`

These may or may not be the same underlying Resend credential value in your environment. Operationally, they are configured in different places and can drift independently.

## Related Files

- [invite-user/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/invite-user/index.ts)
- [send-password-reset-email/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-password-reset-email/index.ts)
- [send-reminder-emails/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/send-reminder-emails/index.ts)
- [API_RATE_LIMITING.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/API_RATE_LIMITING.md)
- [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
