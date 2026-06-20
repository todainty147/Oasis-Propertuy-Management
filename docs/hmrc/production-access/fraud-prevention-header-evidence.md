# Fraud Prevention Header evidence

All Business Details, obligations, Property Business, UK Property submission, read-back, and Phase 5D pilot requests use the shared `hmrcFraudPreventionHeaders` builder.

Headers currently built where context is available:

- `Gov-Client-Connection-Method`: server integration mode (`OTHER_DIRECT`).
- `Gov-Client-Device-ID`: account/request device context.
- `Gov-Client-Timezone`: server/request timezone.
- `Gov-Client-User-IDs`: authenticated Tenaqo user identifier.
- `Gov-Client-Public-IP`, timestamp and port: trusted server deployment configuration.
- `Gov-Vendor-License-IDs`: deployment license/account context.
- `Gov-Vendor-Product-Name` and `Gov-Vendor-Version`: deployment configuration.

Missing browser/IP context is reported and must be completed in production deployment configuration. The one documented exception is the deterministic account-scoped device-ID fallback below. Evidence records header names, connection method, and missing-context names only; it never records header values, tokens, client secrets, NINOs, business IDs, or raw payloads.

Capture method: run focused unit/contract tests and retain the safe `fraud_prevention_headers` audit summary. Latest test timestamp: `[rerun within 30 days of production access request]`.

Unsupported/future APIs, including year-end, final declaration, foreign property and self-employment, are not called in E1.

## Known limitation: Gov-Client-Device-ID fallback

When a per-device identifier is available, Tenaqo uses it. When it is unavailable, the current server-side implementation deterministically falls back to the account ID so the header is not omitted.

The account ID is account-scoped and is not a true per-device identifier. Multiple users or browser profiles in one account can therefore share the fallback value.

Mitigations:

- Safe evidence records header names only, never the device/account value.
- Audit evidence does not include raw device, IP, user, token, secret, NINO, business ID, or payload values.
- The production access checklist identifies this fallback as an implementation detail that must be validated with HMRC.

Planned improvement:

- Generate a privacy-conscious random identifier once per browser profile without invasive fingerprinting.
- Bind it to the user/session/account context and pass it to the server for HMRC requests.
- Rotate or reset it on logout or an explicit device reset where appropriate.
- Collect no device attributes beyond what HMRC Fraud Prevention Header requirements need.
