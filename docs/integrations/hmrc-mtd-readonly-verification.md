# HMRC MTD Read-Only Verification

This phase verifies sandbox connectivity against subscribed MTD read-only APIs. It does not submit quarterly updates, annual updates, final declarations or live production calls.

## Endpoint Order

1. Business Details (MTD) 2.0
2. Obligations (MTD) 3.0
3. Property Business (MTD) 6.0, only after an income source ID is available

Business Details runs first because it can confirm the sandbox test NINO and may discover income source IDs used by later checks.

## Safe Storage

- Tokens remain encrypted in `hmrc_connections`.
- Sandbox identifiers are stored server-side in `hmrc_connections.metadata.sandbox_profile`.
- Readiness results are stored in `hmrc_readiness_checks`.
- Store safe summaries only, such as counts and boolean flags.
- Do not store full HMRC responses or personal data payloads.

## Audit Logging

Every probe writes `hmrc_api_audit_log` with:

- action
- endpoint
- method
- status
- HTTP status
- safe HMRC code
- safe error message where needed

Never log access tokens, refresh tokens, client secrets or full HMRC responses.

## Troubleshooting

- `401`: token is invalid or expired. Refresh or reconnect HMRC sandbox.
- `403`: insufficient scope or API authorisation. Check the sandbox app API subscriptions and reconnect.
- `404`: no data/no obligations for the sandbox test profile. Treat as non-fatal where appropriate.
- `400`: missing or invalid sandbox identifier. Check the sandbox NINO.

## Rollback

1. Disable `hmrc_mtd_read_only`.
2. Disable `hmrc_mtd_connection` if needed.
3. Clear sandbox identifiers from `hmrc_connections.metadata.sandbox_profile` if needed.
4. Keep audit rows unless legal/security review approves deletion.
