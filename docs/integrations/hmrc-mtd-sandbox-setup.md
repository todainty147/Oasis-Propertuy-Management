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
- `APP_URL=https://your-app-preview-or-production-origin`
- `ALLOWED_APP_ORIGINS=https://your-app-preview-or-production-origin`

Do not put HMRC credentials in Vite environment variables, frontend code, GitHub, screenshots, logs, database migrations, seed data, or plain database rows.

`APP_URL` is used for safe redirects back into Tenaqo and must be one origin only, with no comma and no path. For the live app, use:

```text
APP_URL=https://app.tenaqo.com
```

`ALLOWED_APP_ORIGINS` is used for browser CORS preflight responses from Supabase Edge Functions. Multiple origins can be comma-separated. For example:

```text
ALLOWED_APP_ORIGINS=https://app.tenaqo.com,https://oasis-property-management-...vercel.app
```

Do not set `APP_URL` to the old `https://www.oasisrentalmgt.app` domain, and do not put multiple origins in `APP_URL`.

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

## Subscribed Sandbox APIs

The Tenaqo sandbox application is expected to be subscribed to:

- Property Business (MTD) 6.0
- Self Assessment Individual Details (MTD) 2.0
- Self Assessment Accounts (MTD) 4.0
- Obligations (MTD) 3.0
- Business Details (MTD) 2.0

## Redirect URI

Configure the HMRC sandbox application redirect URI to the deployed Supabase Edge Function callback URL:

`https://<project-ref>.functions.supabase.co/hmrc-oauth-callback`

Set the same value in `HMRC_REDIRECT_URI`.

The callback function must allow unauthenticated browser redirects from HMRC. Keep this in `supabase/config.toml`:

```toml
[functions.hmrc-oauth-callback]
verify_jwt = false
```

This does not expose HMRC tokens to the browser. The callback is protected by the short-lived OAuth `state` value created by `hmrc-start-oauth`, and token exchange still happens server-side.

## Feature Flags

The frontend and Edge Functions require account-level flags:

- `hmrc_mtd_connection`
- `hmrc_mtd_sandbox`
- `hmrc_mtd_read_only`
- `hmrc_mtd_sandbox_test_data` for internal sandbox test-data setup only

`hmrc_mtd_live_submission` must remain disabled. It is not used by the UI or Edge Functions.

The sandbox OAuth flow currently requests:

- `hello` for the harmless HMRC Hello API read-only connection probe
- `read:self-assessment` for the MTD read-only foundation
- `write:self-assessment` only when using the internal sandbox test-data setup panel

If an older sandbox connection only shows `read:self-assessment`, disconnect and reconnect HMRC before using `Test sandbox connection`.

The test call first tries HMRC's user-restricted Hello endpoint with the OAuth token. If HMRC returns `403`, Tenaqo also checks the open Hello World endpoint and shows `sandbox_reachable` when the sandbox itself is reachable but the user-restricted probe is not authorised. In that case, check that the sandbox app is subscribed to the Hello World API and that the test user granted the `hello` scope.

Hello World is no longer the main verification signal. The main MTD read-only verification checks subscribed MTD sandbox APIs in this order:

1. Business Details (MTD) 2.0
2. Obligations (MTD) 3.0
3. Property Business (MTD) 6.0, only when an income source ID is available

## Sandbox Test Identifiers

On `Compliance -> Making Tax Digital -> HMRC Connection`, add the sandbox test user NINO supplied by HMRC. Tenaqo stores it server-side in `hmrc_connections.metadata.sandbox_profile` and only shows a masked value in the UI.

Business Details is the first real probe. If it returns an income source ID, Tenaqo stores that ID server-side for later Property Business read-only checks.

## Sandbox Test Data Setup

If Business Details and Obligations return `no_data`, use the internal `Sandbox test-data setup` panel on the HMRC Connection page.

This panel calls HMRC's **Self Assessment Test Support (MTD) 1.0** sandbox endpoints server-side:

- `POST /individuals/self-assessment-test-support/itsa-status/{nino}/{taxYear}`
- `POST /individuals/self-assessment-test-support/business/{nino}`
- `DELETE /individuals/self-assessment-test-support/business/{nino}/{businessId}`

These endpoints mutate HMRC sandbox vendor state only. They are not live submissions and they must remain behind `hmrc_mtd_sandbox_test_data`.

To use them:

1. Enable `hmrc_mtd_sandbox_test_data` for the internal/staging account.
2. Reconnect HMRC using `Reconnect with test-data scope` so the OAuth token includes `write:self-assessment`.
3. Save the sandbox NINO.
4. Create ITSA status for the tax year.
5. Create a UK property test business.
6. Run Business Details again, then Obligations.

## Read-Only Verification Results

- `success`: HMRC returned usable read-only sandbox data.
- `no_data`: HMRC responded, but there were no records or obligations for the sandbox test profile.
- `blocked`: the check needs a missing sandbox identifier or connected HMRC account.
- `failed`: HMRC returned an error such as insufficient scope, invalid token, or unavailable sandbox.

Live submission remains disabled. No quarterly updates, annual updates or final declarations are submitted by these checks.

Enable flags for a staging/internal account only:

```sql
insert into public.account_feature_flags (account_id, feature_key, enabled)
values
  ('<account-id>', 'hmrc_mtd_connection', true),
  ('<account-id>', 'hmrc_mtd_sandbox', true),
  ('<account-id>', 'hmrc_mtd_read_only', true),
  ('<account-id>', 'hmrc_mtd_sandbox_test_data', true)
on conflict (account_id, feature_key)
do update set enabled = excluded.enabled;
```

## How To Test In Staging

1. Apply `supabase/hmrc_mtd_phase1.sql`.
2. Deploy the HMRC Edge Functions. Deploy `hmrc-oauth-callback` with JWT verification disabled, either through `supabase/config.toml` or:

   ```bash
   supabase functions deploy hmrc-oauth-callback --no-verify-jwt
   ```

3. Set the Edge Function secrets.
4. Enable the account-level feature flags for the staging account.
5. Open `Compliance -> Making Tax Digital -> HMRC Connection`.
6. Click `Connect HMRC sandbox`.
7. Authorise with an HMRC sandbox user.
8. Confirm the status card shows `connected`.
9. Run `Test sandbox connection`.
10. If you need seeded sandbox MTD data, use the sandbox test-data setup panel, then run `Check Business Details`.

## CORS Troubleshooting

If the browser console shows:

```text
No 'Access-Control-Allow-Origin' header is present on the requested resource
```

then the deployed Edge Function is running but the app origin is not trusted by the function. Set `ALLOWED_APP_ORIGINS` to the exact browser origin that is calling the function, redeploy or restart the Edge Function runtime if needed, then refresh the app.

If the OAuth callback redirects to a malformed URL such as `https://old-domain,https/compliance/hmrc-connection`, then `APP_URL` is misconfigured. Set `APP_URL` to a single valid origin, for example `https://app.tenaqo.com`, and redeploy `hmrc-oauth-callback`.

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
