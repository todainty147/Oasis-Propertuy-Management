# HMRC MTD Security

HMRC credentials and OAuth tokens are server-side secrets. The browser must never receive client secrets, access tokens, refresh tokens, or raw OAuth callback codes.

## Token Storage

- Access and refresh tokens are encrypted by Supabase Edge Functions before storage.
- Encryption uses `HMRC_TOKEN_ENCRYPTION_KEY`, stored only as an Edge Function secret.
- New ciphertext uses AES-GCM with an HKDF-derived key and a purpose label of `hmrc-token-enc`.
- Legacy `v1` sandbox ciphertext remains readable so existing sandbox connections are not stranded after key-derivation upgrades.
- Token ciphertext is stored in `hmrc_connections`.
- `hmrc_connections` and `hmrc_oauth_states` are not granted direct authenticated browser access.
- The browser receives only safe metadata: status, environment, scopes, dates, and display label.

## Audit Logging

HMRC actions write safe events to `hmrc_api_audit_log`.

Allowed summaries:

- action name
- endpoint path
- method
- status
- HTTP status
- safe error message
- correlation ID

Never log:

- client secret
- OAuth authorisation code
- access token
- refresh token
- token ciphertext
- full request or response bodies

## Access Control

- Owners, admins, and staff can use the HMRC connection UI only when the account-level feature flags are enabled.
- Tenants cannot access HMRC connection data.
- Contractors cannot access HMRC connection data.
- Edge Functions verify the authenticated user and account membership before each action.
- Live submission is blocked by code and must remain disabled by environment.
- `ensureSandboxOnly()` is the authoritative runtime guard: `HMRC_ENVIRONMENT` must be `sandbox` and `HMRC_LIVE_SUBMISSION_ENABLED` must not be `true`.
- OAuth uses PKCE. The verifier is encrypted in the short-lived `hmrc_oauth_states` row and validated against `code_verifier_hash` before token exchange.

## Safe Logging Policy

Use `safeErrorResponse` for Edge Function errors. It strips sensitive keys and returns only stable client-safe messages with a correlation ID.

## Incident Response

If an HMRC secret is exposed:

1. Revoke or rotate the HMRC app secret in HMRC Developer Hub.
2. Rotate `HMRC_CLIENT_SECRET` in Supabase Edge Function secrets.
3. Rotate `HMRC_TOKEN_ENCRYPTION_KEY`.
4. Disconnect affected HMRC connections.
5. Review `hmrc_api_audit_log` and hosted security logs.
6. Redeploy Edge Functions.
7. Record the incident and remediation steps in the security log.
