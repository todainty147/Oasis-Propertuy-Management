# HMRC MTD Read-Only Verification

This phase verifies sandbox connectivity against subscribed MTD read-only APIs. It does not submit quarterly updates, annual updates, final declarations or live production calls.

## Endpoint Order

1. Business Details (MTD) 2.0
2. Obligations (MTD) 3.0
3. Property Business (MTD) 6.0, only after an income source ID is available

Business Details runs first because it can confirm the sandbox test NINO and may discover income source IDs used by later checks.

Business Details and Property Business probes send `Gov-Test-Scenario: STATEFUL` so they can see vendor state created through HMRC sandbox support APIs. Obligations currently omits that header because HMRC rejects the scenario for the income-and-expenditure obligations endpoint.

## Sandbox Test Data Setup

When a valid sandbox NINO still returns `no_data`, create HMRC sandbox state through the internal test-data setup controls. These controls call the Self Assessment Test Support (MTD) API from Edge Functions only.

Recommended order:

1. Reconnect HMRC with the test-data scope so the token includes `write:self-assessment`.
2. Create ITSA status for the target tax year.
3. Create a `uk-property` test business.
4. Run Business Details.
5. Run Obligations.
6. Run Property Business after an income source ID is stored.

The test business and ITSA status are HMRC sandbox state. HMRC currently purges test businesses after 7 days.

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
- Property Business `404 MATCHING_RESOURCE_NOT_FOUND`: the property business exists, but HMRC has no retrievable read-only property summary for that tax year. This is expected if only ITSA status and the business source have been created and no property update/summary exists in sandbox state.
- `400`: missing or invalid sandbox identifier. Check the sandbox NINO.
- Missing `write:self-assessment`: reconnect through `Reconnect with test-data scope` before using sandbox test-data setup.

## Rollback

1. Disable `hmrc_mtd_read_only`.
2. Disable `hmrc_mtd_sandbox_test_data`.
3. Disable `hmrc_mtd_connection` if needed.
4. Clear sandbox identifiers from `hmrc_connections.metadata.sandbox_profile` if needed.
5. Keep audit rows unless legal/security review approves deletion.
