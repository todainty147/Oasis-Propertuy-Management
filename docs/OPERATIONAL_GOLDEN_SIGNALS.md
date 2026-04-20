# OASIS Operational Golden Signals

This note defines the Phase 1 operational signals OASIS should use for launch-readiness and support triage. It is intentionally account-scoped and Supabase-native so it fits the current RPC/RLS architecture without adding a separate observability vendor.

## Scope

Golden signals apply first to critical landlord, tenant, contractor, document, invite, billing, and security workflows. The goal is not perfect platform telemetry; the goal is a reliable early-warning layer for the product paths that would most visibly hurt trust.

## Signal Sources

- Hosted app/security telemetry:
  - `public.security_observability_events`
  - `public.security_observability_event_feed(...)`
  - `public.security_observability_latency_rollup(...)`
  - `public.security_observability_burst_rollup(...)`
  - `public.security_observability_trend_series(...)`
- Durable authorization-denial stream:
  - `public.security_denied_events`
  - app follow-up logging through `logSecurityRelevantFailure(...)`
- Provider-backed logs:
  - Supabase Auth, Storage, Edge Function logs
  - Resend delivery logs
  - Stripe webhook/provider logs
  - Twilio logs when SMS is enabled

## Critical Surfaces

| Surface | Why it matters | Primary signal source |
| --- | --- | --- |
| `dashboard_snapshot` | First landlord landing page; broad account health signal | hosted latency + denied-event classification |
| `finance_snapshot` | Rent and arrears visibility; commercially sensitive | hosted latency + denied-event classification |
| `portfolio_health_snapshot` | Portfolio risk overview | hosted latency + denied-event classification |
| `security_observability_event_feed` | Operator/support visibility | hosted latency + root telemetry rollups |
| `documents` / `document_storage_*` | Document trust, download/upload access, provider issues | denied-event stream + provider correlation fields |
| `account_invitation_*` / `invite-user` | Onboarding and account access | invite workflow logs + outbound email events |
| `send-password-reset-email` | Account recovery | outbound email events + Edge Function/provider status |
| `contractor_*` / `wo_fin_*` | Contractor quote/invoice/status workflows | denied-event stream + hosted workflow events |
| `create-checkout-session` / `create-customer-portal-session` | Revenue and subscription self-service | Edge Function failure classification + Stripe logs |

## Launch SLO Targets

These are starting targets, not contractual promises. Tighten them only after production traffic gives us enough baseline data.

| Signal | Initial target | Breach/watch rule |
| --- | --- | --- |
| Availability of critical reads | 99.5% successful responses over 24h | Watch at 1% failures; breach at 2% failures |
| p95 critical read latency | Dashboard/finance/portfolio under 2s p95 | Watch above target; breach above 2x target |
| Auth/invite completion | Invite/reset email function returns successful handoff in 99% of attempts | Watch at 2 failures/hour; breach at 5 failures/hour |
| Document storage operations | Upload/download/sign-url failures below 1% over 24h | Watch at repeated provider failures on same account |
| Authorization-denial pressure | No unexplained spike on one surface/account | Watch when a repeated pattern appears in burst rollup |
| Scheduled outbound jobs | Cron functions complete without auth/provider errors | Breach on two consecutive failed runs |

## Golden Signal Definitions

### Latency

Measure high-value frontend/service workflows with hosted operational telemetry:

- `latency_sample`
- `latency_threshold_exceeded`

Recommended first targets:

- `dashboard_snapshot`: 2000ms
- `finance_snapshot`: 2000ms
- `portfolio_health_snapshot`: 2500ms
- `security_observability_event_feed`: 1500ms
- document preview/download action: 2500ms

### Traffic

Use request/event counts per account and surface:

- hosted event count in `security_observability_events`
- RPC/service call count where app telemetry is enabled
- outbound email/SMS event rows for communication workflows

Traffic is mostly for context: high traffic with low failure rate is healthy; low traffic with repeated failures is usually a configuration or scope issue.

### Errors

Classify errors into:

- `authorization_denied`
- `unexpected_security_failure`
- provider delivery failure
- provider storage failure
- scheduled job failure

Authorization denials are not always incidents. Treat them as incidents only when they are unexpected, repeated, or attached to a support complaint.

### Saturation / Pressure

For OASIS today, saturation is best approximated by repeated pressure rather than infrastructure CPU metrics:

- repeated denial patterns on the same surface/entity/reason
- repeated slow responses on the same surface
- repeated provider delivery/storage failures
- repeated scheduled-job failures

The existing burst rollup is the first-pass pressure detector.

## Operator Workflow

1. Open Root Telemetry for cross-account signal pressure when root/support access is appropriate.
2. Open Security Audit for account-level hosted events, anomaly alerts, and ledger context.
3. Use repeated-pattern grouping to identify the surface/entity/reason cluster.
4. Use the investigation link or `Copy SQL` helper to preserve the current diagnostic scope.
5. Confirm provider-side details only when the app event includes provider correlation fields or the failure is provider-led.
6. Record whether the event is expected denial, configuration issue, product bug, or provider incident.

## Alerting Backlog

Phase 1 alerting can be lightweight:

- dashboard/finance/portfolio p95 above target for two consecutive windows
- more than five unexpected failures on one account/surface in one hour
- more than ten authorization denials on one account/surface/entity/reason in one hour
- invite/reset delivery failures on the same provider sender
- two consecutive scheduled outbound job failures

Do not page on isolated authorization denials. They are often proof that the security boundary is working.

The launch threshold matrix, severity model, owner model, and response SLAs are formalized in [runbooks/security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md). Treat the bullets above as product golden-signal candidates; treat the runbook as the operational source of truth for when to watch, page, assign owners, and retain evidence.

## Cache Boundary

Selective caching is allowed only where the data is account-scoped, read-heavy, and safe to refresh through realtime invalidation/bypass paths.

Current Phase 1 cache targets:

- `dashboard_snapshot`
- `finance_snapshot`
- `portfolio_health_snapshot`

Rules:

- cache keys must include account scope
- tenant-scoped snapshots must include tenant scope
- dashboard snapshots must include horizon scope
- realtime refresh paths must bypass the cache
- distributed cache layers should wait for measured production latency or traffic pressure

## Documentation Links

- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
- [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md)
- [DENIED_EVENT_COVERAGE_MATRIX.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/DENIED_EVENT_COVERAGE_MATRIX.md)
- [runbooks/security-observability-feed.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-observability-feed.md)
- [runbooks/security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
