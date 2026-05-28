# HMRC MTD Sandbox Setup

This integration is sandbox-only. Tenaqo does not submit MTD updates, final declarations, or live tax filings in this phase.

## Required Secrets

Store these only as Supabase Edge Function secrets or equivalent server-side environment variables:

- `HMRC_ENVIRONMENT=sandbox`
- `HMRC_CLIENT_ID`
- `HMRC_CLIENT_SECRET`
- `HMRC_REDIRECT_URI`
- `HMRC_BASE_URL=https://test-api.service.hmrc.gov.uk`
- `HMRC_AUTH_BASE_URL=https://test-www.tax.service.gov.uk`
- `HMRC_TOKEN_ENCRYPTION_KEY`
- `HMRC_LIVE_SUBMISSION_ENABLED=false`

Do not put HMRC credentials in Vite environment variables, frontend code, GitHub, screenshots, logs, database migrations, seed data, or plain database rows.

## HMRC Sandbox URLs

These are real HMRC sandbox hosts, not placeholders:

- API host: `https://test-api.service.hmrc.gov.uk`
- OAuth browser authorisation host: `https://test-www.tax.service.gov.uk`

Opening `https://test-api.service.hmrc.gov.uk` directly in a browser can return `MATCHING_RESOURCE_NOT_FOUND`. That is expected because it is only the API base host; HMRC expects a specific endpoint path, such as `/hello/world` or `/oauth/token`.

The OAuth authorisation URL is built from the auth host plus `/oauth/authorize`, for example:

```text
https://test-www.tax.service.gov.uk/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&scope=...&state=...
```

Token exchange uses the API host plus `/oauth/token`:

```text
https://test-api.service.hmrc.gov.uk/oauth/token
```

## Redirect URI

Configure the HMRC sandbox application redirect URI to the deployed Supabase Edge Function callback URL:

`https://<project-ref>.functions.supabase.co/hmrc-oauth-callback`

Set the same value in `HMRC_REDIRECT_URI`.

## Feature Flags

The frontend and Edge Functions require account-level flags:

- `hmrc_mtd_connection`
- `hmrc_mtd_sandbox`
- `hmrc_mtd_read_only`

`hmrc_mtd_live_submission` must remain disabled. It is not used by the UI or Edge Functions.

Enable flags for a staging/internal account only:

```sql
insert into public.account_feature_flags (account_id, feature_key, enabled)
values
  ('<account-id>', 'hmrc_mtd_connection', true),
  ('<account-id>', 'hmrc_mtd_sandbox', true),
  ('<account-id>', 'hmrc_mtd_read_only', true)
on conflict (account_id, feature_key)
do update set enabled = excluded.enabled;
```

## How To Test In Staging

1. Apply `supabase/hmrc_mtd_phase1.sql`.
2. Deploy the HMRC Edge Functions.
3. Set the Edge Function secrets.
4. Enable the account-level feature flags for the staging account.
5. Open `Compliance -> Making Tax Digital -> HMRC Connection`.
6. Click `Connect HMRC sandbox`.
7. Authorise with an HMRC sandbox user.
8. Confirm the status card shows `connected`.
9. Run `Test sandbox connection`.

## Disable The Feature

Turn off the account flags:

```sql
update public.account_feature_flags
set enabled = false
where account_id = '<account-id>'
  and feature_key in ('hmrc_mtd_connection', 'hmrc_mtd_sandbox', 'hmrc_mtd_read_only');
```

To disconnect a specific account, use the UI `Disconnect HMRC` action. This clears encrypted token fields and marks the connection disconnected.

## Rollback

1. Disable the feature flags.
2. Remove or rotate Edge Function secrets.
3. Undeploy the HMRC Edge Functions if needed.
4. Keep audit rows unless legal/security review approves deletion.

## Not Implemented Yet

- No live submission
- No final declaration
- No quarterly update submission
- No production HMRC credentials
- No HMRC revoke endpoint call
- No background refresh schedule
