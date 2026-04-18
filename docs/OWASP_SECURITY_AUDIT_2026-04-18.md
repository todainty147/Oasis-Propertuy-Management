# OASIS OWASP Security Audit

Assessment date: 2026-04-18  
Assessment type: repository-based application security audit  
Perspective: CISA/CISSP-style technical risk assessment  
Primary benchmark: OWASP Top 10, OWASP ASVS principles, secure SDLC, least privilege, defense in depth

## Executive Summary

OASIS has a stronger-than-typical security foundation for an early SaaS product. The most important positive control is that authorization is not merely a React/UI concern: account isolation, role separation, contractor/tenant scoping, document access, billing access, security audit access, and rate-limit logging are largely enforced in Supabase PostgreSQL RLS, security-definer RPCs, storage policies, and Edge Functions.

The audit did not identify an obvious client-side direct object reference that bypasses database authorization. Existing controls show mature thinking around OWASP A01 Broken Access Control, including RLS, account-scoped queries, private buckets, guard RPCs, and integration/security test coverage.

The highest-priority remediation work is at the application perimeter and supply-chain layer:

- Sensitive Edge Functions allow wildcard CORS and several flows fall back to the caller-controlled `Origin` header when `APP_URL` is not configured.
- Dependency audit found high-severity advisories for root Vite and marketing-site Next.js versions.
- Security headers and CSP are not configured in the Vercel/Next configuration evidenced in the repo.
- Some service-role Edge Functions return raw provider/database error messages to clients.

Overall technical posture: **moderate to strong**, with **high-priority hardening required before broad production exposure**.

## Scope And Limitations

Reviewed evidence included:

- React/Vite application under `src/`
- Supabase SQL overlays under `supabase/`
- Supabase Edge Functions under `supabase/functions/`
- Next.js marketing site under `marketing-site/`
- security/integration/e2e tests under `tests/`
- existing security documentation under `docs/`
- dependency audit results from `npm audit --omit=dev --audit-level=low --json` in both the root app and marketing site

Not reviewed:

- live Supabase dashboard settings
- Vercel production settings
- deployed headers from production
- Supabase Auth password/MFA configuration
- production secrets and rotation history
- cloud provider access logs
- penetration testing against a live deployed instance
- supplier contracts, HR controls, incident tickets, access review evidence, or ISO/ISMS artifacts

## OWASP Top 10 Mapping

| OWASP area | Current posture | Audit view |
| --- | --- | --- |
| A01 Broken Access Control | Strong technical foundation | RLS, guarded RPCs, account membership helpers, private storage, and security tests are present. Continue reducing raw token exposure and service-role blast radius. |
| A02 Cryptographic Failures | Partial to adequate | TLS/storage encryption are largely inherited from Supabase/Vercel. Token handling, invite token storage, and secret rotation evidence should mature. |
| A03 Injection | Moderate | Supabase query builder and parameterized RPCs reduce classic SQL injection risk. Continue constraining string-built filters and validate RPC inputs. |
| A04 Insecure Design | Moderate | Architecture is intentionally account-scoped and audit-aware. Origin fallback in sensitive link/session creation is an insecure design pattern to remove. |
| A05 Security Misconfiguration | Needs hardening | Missing security headers/CSP and wildcard Edge Function CORS are the largest visible misconfigurations. |
| A06 Vulnerable And Outdated Components | Needs immediate action | Root Vite and marketing-site Next.js audits found high-severity advisories with fixes available. |
| A07 Identification And Authentication Failures | Moderate | Supabase Auth is used and user identity is verified in sensitive Edge Functions. Password reset has rate limiting, but should fail closed on trusted app origin and consider bot controls. |
| A08 Software And Data Integrity Failures | Moderate | Strong SQL/RPC integrity controls exist. Formal dependency scanning, release gates, and migration verification should be enforced in CI. |
| A09 Security Logging And Monitoring Failures | Strong technical foundation | Security observability, audit ledger, denied-event streams, and rate-limit events are mature for this stage. Alerting/retention/runbook evidence should be operationalized. |
| A10 Server-Side Request Forgery | Low evidence of exposure | No obvious SSRF sink was identified. Keep provider fetches fixed to known APIs and validate any future user-supplied URLs. |

## Positive Security Findings

### Database-first authorization

OASIS relies heavily on server-side controls:

- RLS is enabled across sensitive operational tables.
- Account access is centralized through helper functions such as effective-role and permission checks.
- Sensitive actions such as invites, billing, work-order workflow, document actions, custom roles, security audit export, root telemetry, and contractor workflows are mediated by RPCs or Edge Functions.
- Legacy `supabase/rls.sql` is intentionally disabled with a fail-loud exception so old owner-based policies are not accidentally applied.

### Tenant, contractor, and manager separation

The SQL and tests show deliberate separation of:

- owner/admin/staff roles
- tenants scoped to their account/property/tenant records
- contractors scoped to assigned work orders
- root/support telemetry paths
- account-level feature entitlements and billing plans

### Private storage model

Storage buckets for documents, maintenance request attachments, and work-order attachments are private. Policies validate object path structure and re-check account/document/work-order access before object selection, insert, or delete.

### Security observability

The application has notable security telemetry maturity:

- security audit ledger
- denied-event stream
- hosted observability sink
- rate-limit attempt records
- outbound email/SMS event records
- cleanup functions for retention
- runbooks and coverage matrices

### Rate limiting on high-risk flows

SQL-backed rate limiting is implemented for invites, password reset, observability ingestion, reminder emails, SMS notifications, and recipient-specific throttling.

## Priority Findings

### Finding 1: Sensitive Edge Functions trust caller-controlled `Origin` when `APP_URL` is missing

Severity: High  
OWASP: A04 Insecure Design, A05 Security Misconfiguration, A07 Identification and Authentication Failures  
Affected evidence:

- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-customer-portal-session/index.ts`
- `supabase/functions/invite-user/index.ts`
- `supabase/functions/send-password-reset-email/index.ts`

The billing, invite, and password reset flows build redirect URLs from `APP_URL`, but fall back to `req.headers.get("origin")` when `APP_URL` is absent. This means a misconfigured deployment can mint Stripe checkout return URLs, customer portal return URLs, invite links, or password reset links pointing to an attacker-controlled origin.

This is not an authentication bypass by itself. However, it is high risk because these functions are security-sensitive and some generate account lifecycle or recovery links using service-role authority.

Remediation strategy:

- Fail closed when `APP_URL` is missing in production.
- Remove `Origin` fallback for password reset, invite, checkout, and portal links.
- Introduce an explicit `ALLOWED_APP_ORIGINS` allowlist for CORS and redirect generation.
- Validate URL hostnames against that allowlist before using them.
- Add integration tests proving hostile `Origin` values are ignored or rejected.
- Log configuration failures as security/operational events with a correlation ID.

Target state:

- Production link/session creation only uses trusted configured application origins.
- Preview or staging deployments use explicitly configured preview origins, not arbitrary request headers.

### Finding 2: Wildcard CORS is used on authenticated service-role Edge Functions

Severity: Medium to High  
OWASP: A05 Security Misconfiguration  
Affected evidence:

- `Access-Control-Allow-Origin: "*"` in multiple Edge Functions, including billing, invite, password reset, and observability ingestion.

Wildcard CORS does not remove the requirement for a valid Supabase bearer token, and no cookie credential sharing was observed. Still, allowing any web origin to call sensitive Edge Functions increases exposure if a token is obtained by browser compromise, malicious extensions, XSS elsewhere, or accidental token leakage.

Remediation strategy:

- Replace static wildcard CORS with a shared CORS helper.
- Reflect only approved origins from `ALLOWED_APP_ORIGINS`.
- Return no CORS headers for disallowed origins.
- Keep `OPTIONS` responses consistent with the allowlist.
- Include staging and preview origins explicitly.
- Add tests for allowed and denied origins.

Target state:

- Only trusted OASIS app origins can call browser-facing Edge Functions from the browser.

### Finding 3: Dependency audit found high-severity advisories

Severity: High  
OWASP: A06 Vulnerable and Outdated Components  
Evidence:

- Root app `npm audit --omit=dev --audit-level=low --json` reported one high-severity vulnerable package: `vite`, installed in the vulnerable `7.0.0 - 7.3.1` range.
- Marketing site `npm audit --omit=dev --audit-level=low --json` reported one high-severity vulnerable package: `next`, installed in the vulnerable `9.5.0 - 15.5.14` range.

Root Vite advisories included:

- path traversal in optimized dependency source map handling
- `server.fs.deny` bypass
- arbitrary file read via Vite dev server WebSocket

Marketing Next.js advisories included:

- HTTP request smuggling in rewrites
- unbounded image disk cache growth
- denial of service with Server Components

Remediation strategy:

- Upgrade root `vite` to a non-vulnerable version above the advisory range.
- Upgrade marketing-site `next` to at least `15.5.15` or the latest stable version compatible with the app.
- Re-run `npm audit --omit=dev --audit-level=low` in both package roots.
- Add CI dependency audit or Dependabot alerts.
- Define vulnerability SLAs:
  - critical: 24-72 hours
  - high: 7 days
  - moderate: 30 days
  - low: normal maintenance cycle

Target state:

- No known high/critical advisories in production or development packages.
- Dependency scanning is continuous rather than ad hoc.

### Finding 4: Security headers and CSP are not configured in repo evidence

Severity: Medium to High  
OWASP: A05 Security Misconfiguration, A03 Injection defense-in-depth  
Affected evidence:

- `vercel.json` only defines SPA fallback routing.
- `marketing-site/next.config.mjs` does not define headers.

The app does not evidence centrally configured browser security headers such as CSP, HSTS, frame protections, MIME sniffing protection, referrer policy, or permissions policy.

Remediation strategy:

- Add production security headers for both app and marketing site:
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `X-Frame-Options` or CSP `frame-ancestors`
  - `Cross-Origin-Opener-Policy` where compatible
- Start CSP in `Content-Security-Policy-Report-Only` if there is uncertainty.
- Restrict `connect-src` to Supabase, Stripe, Resend/Twilio endpoints actually needed by the browser, and the app origin.
- Avoid `unsafe-inline` long term by moving toward hashes/nonces where feasible.
- Add a deployment check that verifies headers on the built app.

Target state:

- Browser exploitability is reduced even if a rendering bug, dependency bug, or accidental HTML injection appears later.

### Finding 5: Service-role Edge Functions expose raw operational error messages

Severity: Medium  
OWASP: A05 Security Misconfiguration, A09 Logging and Monitoring  
Affected evidence:

- Several Edge Functions return raw `error.message` from Supabase, Stripe, or caught exceptions.

Returning raw provider/database messages can reveal implementation details, table names, policy names, or provider states. The repository already has good observability patterns, so the better pattern is to log full details server-side and return stable client-safe messages.

Remediation strategy:

- Introduce a shared Edge Function error helper.
- Return generic errors such as `Forbidden`, `Invalid request`, or `Operation failed`.
- Include a `correlationId` in responses.
- Log full internal details to security/operational logs, scrubbed of secrets.
- Preserve specific HTTP status codes but reduce message detail.

Target state:

- Clients receive only the minimum information needed.
- Operators can still diagnose issues through logs using correlation IDs.

### Finding 6: Invitation tokens are stored and returned as bearer secrets

Severity: Medium  
OWASP: A02 Cryptographic Failures, A07 Identification and Authentication Failures  
Affected evidence:

- `account_invitations.token` is stored as a raw unique token.
- manager-scoped select policy permits authorized account managers to read invitation rows.
- `invite-user` returns `token` and `inviteUrl` in its JSON response.

The accept flow appears to include email/user checks, which reduces impact. However, invitation tokens are bearer-style lifecycle secrets and should be minimized. Raw storage and broad application visibility increase exposure if account manager sessions, logs, browser state, or database read paths are compromised.

Remediation strategy:

- Store only a hash of invitation tokens.
- Return raw tokens only at creation time and never from list/read endpoints.
- Use a view or RPC for invitation listing that excludes token material.
- Restrict resend behavior to server-side email generation without exposing the token to the browser when possible.
- Add tests proving account invitation list APIs do not reveal raw tokens.

Target state:

- Invitation tokens are treated like password reset tokens: short-lived, minimally exposed, and hashed at rest.

### Finding 7: Password reset flow is rate-limited but lacks stronger bot and origin controls

Severity: Medium  
OWASP: A07 Identification and Authentication Failures  
Affected evidence:

- `send-password-reset-email` is unauthenticated by design and rate-limited by target email hash.
- It uses `Origin` fallback for recovery redirect generation.
- No CAPTCHA/Turnstile/device reputation control is evidenced.

The function intentionally returns `ok` for unknown users in common not-found cases, which is good for enumeration resistance. However, password reset endpoints are common abuse targets for inbox flooding, social engineering, and recovery-link phishing.

Remediation strategy:

- Fix trusted-origin handling as described in Finding 1.
- Consider Cloudflare Turnstile or equivalent bot friction on unauthenticated reset requests.
- Add per-IP or provider edge rate limiting in front of the SQL email-hash limiter.
- Monitor reset request spikes in security observability.
- Keep uniform responses for unknown and known users.

Target state:

- Reset abuse is controlled without disclosing account existence.

### Finding 8: Security audit and observability are strong, but alert thresholds and response ownership need formalization

Severity: Medium  
OWASP: A09 Security Logging and Monitoring Failures  
Affected evidence:

- `docs/SECURITY_OBSERVABILITY.md`
- `docs/API_RATE_LIMITING.md`
- security runbooks and denied-event coverage matrix

OASIS has strong telemetry structures, but production audit readiness requires operational commitments: who reviews alerts, what thresholds page someone, what retention applies, and how incidents are classified.

Remediation strategy:

- Define alert thresholds for:
  - rate-limit spikes
  - repeated authorization denials
  - invite abuse
  - password reset abuse
  - cron unauthorized invocation
  - provider send failures
  - security export failures
- Define severity levels and response SLAs.
- Assign owners for daily/weekly security review.
- Document retention periods for audit ledger, denied events, hosted observability, outbound email/SMS events, and provider logs.
- Run a tabletop exercise for account takeover and cross-tenant access attempt scenarios.

Target state:

- Security events are not just collected; they drive timely response.

### Finding 9: Local/dev server exposure needs guardrails

Severity: Medium  
OWASP: A05 Security Misconfiguration, A06 Vulnerable Components  
Affected evidence:

- Vite advisories affect dev server file access classes.
- No Vite `server.host` or dev-server exposure policy is evidenced.

Even though Vite is not production runtime for the built app, developer machines can contain `.env` files, local tokens, database URLs, and private code. Dev servers should bind only to localhost unless intentionally exposed.

Remediation strategy:

- Upgrade Vite.
- Explicitly bind dev server to localhost.
- Document that dev servers must not be exposed through tunnels unless required and protected.
- Keep `.env` files out of commits and ensure secret scanning is enabled.

Target state:

- Development tooling cannot accidentally become a file disclosure surface.

### Finding 10: `.env.example` contains a real-looking hosted Supabase URL and anon JWT

Severity: Low to Medium  
OWASP: A02 Cryptographic Failures, A05 Security Misconfiguration  
Affected evidence:

- `.env.example`

Supabase anon keys are designed to be public when RLS is correct, so this is not automatically a secret leak. The risk is operational: examples with live project identifiers can train developers to use production/staging resources locally, widen abuse surface, and complicate rotation and environment separation.

Remediation strategy:

- Replace with placeholder values or clearly label the project as non-production demo/staging.
- Confirm the referenced project has RLS enabled on all exposed tables and storage buckets.
- Rotate anon key if project boundaries changed or the key was not intended for public distribution.
- Maintain separate local, staging, and production environment examples.

Target state:

- Example configuration teaches safe environment separation.

## Remediation Roadmap

### Immediate: 0-7 days

1. Remove `Origin` fallback from sensitive link/session generation.
2. Add allowed-origin handling for Edge Function CORS.
3. Upgrade vulnerable Vite and Next.js packages.
4. Add security headers to Vercel and marketing-site deployment config.
5. Re-run root and marketing `npm audit`.

### Short term: 2-4 weeks

1. Add shared Edge Function error and CORS helpers.
2. Add tests for hostile origins and CORS denial.
3. Move invitation token listing to a tokenless RPC/view.
4. Add bot protection or provider-level throttling for password reset.
5. Add dependency scanning to CI.
6. Create an operational security alert matrix.

### Medium term: 1-3 months

1. Hash invitation tokens at rest.
2. Add CSP reporting and tune CSP toward enforcement.
3. Formalize access reviews for Supabase, Vercel, GitHub, provider accounts, and root app roles.
4. Perform a live staging penetration test focused on account isolation, invite abuse, document access, and billing flows.
5. Conduct incident tabletop exercises and restore drills.

## Suggested Acceptance Criteria

- Hostile `Origin: https://evil.example` cannot influence invite, reset, checkout, or portal URLs.
- Browser CORS responses are returned only for configured OASIS origins.
- `npm audit --omit=dev --audit-level=low` reports no high or critical vulnerabilities in root or marketing packages.
- Production responses include HSTS, CSP, content type, referrer, frame, and permissions headers.
- Edge Function client errors include correlation IDs and do not expose raw database/provider internals.
- Invitation list/read surfaces do not expose raw invite tokens.
- Password reset remains enumeration-resistant and abuse-limited.

## Final Assessment

OASIS shows strong application-security instincts where they matter most: server-side authorization, RLS, private storage, auditability, and regression testing. The current risk is less about missing core access control and more about hardening the perimeter, supply chain, browser defense-in-depth, and operational security processes.

The recommended next move is to address the high-priority configuration and dependency findings first, then tighten token handling and operational monitoring. Once those are remediated, a live staging penetration test would be the right validation step.
