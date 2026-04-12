# OASIS Engineering Roadmap

This roadmap evaluates the external engineering review against the current OASIS codebase and schema, while also tracking the actively selected product execution plan. It focuses on feasibility, effort, and recommended timing rather than generic SaaS advice.

## Summary

OASIS already has a stronger database-backed architecture than the review assumes:

- authoritative read surfaces are mostly RPC-backed
- major access rules are enforced in SQL/RLS, not only in UI
- structured denied-event and observability pipelines already exist
- the schema is account-scoped enough to support most next-step maturity work

The biggest gap is not schema capability. It is product-operational maturity:

- stronger role and permission flexibility
- stronger typed contracts
- clearer observability and SLOs
- selective caching
- resilience testing

The only recommendation that looks genuinely heavy on the current schema is large-scale partitioning by account.

## Current Milestone

### Iteration 2A Close-Out / Phase 1 Maturity Hardening

Current objective:

- strengthen account-level flexibility without undoing the existing SQL/RLS-first architecture
- tighten trust boundaries across UI, RPCs, and RLS while expanding admin configurability
- add lightweight communication and extensibility primitives that support future commercialization
- start the next maturity layer: typed service contracts, operator observability, golden signals, and selective caching

Scope for this milestone:

- permission hardening across UI, RPCs, and RLS
- custom staff roles and assignment flows
- custom fields for properties and tenants
- outbound email/SMS triggers with communication logging
- Phase 1 hardening over high-value service/RPC boundaries

Strategic themes:

- Platform: permissions, custom roles, custom fields
- Commercial: email/SMS, reports, insights
- Operations: typed contracts, observability, SLOs, reliability

Execution guardrails:

- do not expand scope beyond the defined iteration features
- keep implementations minimal and focused
- avoid introducing new heavy frameworks

Success criteria:

- landlord-only surfaces are no longer reachable by tenant paths
- staff permissions resolve consistently in UI, RPC, and RLS layers
- account owners can create and assign custom roles without schema bypasses
- properties and tenants support account-defined custom fields with stored per-entity values
- OASIS can trigger and log basic outbound email/SMS events for selected workflows
- high-value service/RPC responses are normalized through shared runtime contracts before reaching UI state

## Iteration 2A Epics

### Epic 1: Permission Hardening

Goal:

- align UI, RPC, and RLS permissions
- remove tenant access to landlord-only surfaces
- add permission tests for key flows

Recommended implementation notes:

- treat SQL/RLS as the final authority and make UI/service checks mirror, not replace, backend rules
- prioritize the highest-risk surfaces first: dashboard, finance, reporting, audit, documents, and management settings
- add regression coverage for tenant, manager, and owner roles on the main gated workflows

### Epic 2: Custom Staff Roles

Goal:

- create `roles` and `role_permissions` support
- assign roles per account member
- add UI for role creation and assignment

Recommended implementation notes:

- keep the default seeded roles working while layering custom roles on top
- model permissions as explicit capabilities so they can be enforced both in app logic and SQL helpers
- keep role editing account-scoped and auditable

### Epic 3: Custom Fields

Goal:

- support custom fields for properties and tenants
- store values per entity
- render dynamic forms

Recommended implementation notes:

- start with a small supported field set such as text, number, date, boolean, and select
- make definitions account-scoped and entity-type-specific
- preserve a stable read/write contract so dynamic fields can later feed reports and insights

### Epic 4: Email and SMS Integration

Goal:

- add trigger-based outbound communication
- integrate an email provider and SMS provider
- log communication events

Recommended implementation notes:

- begin with narrow workflow triggers rather than a general automation builder
- keep provider choice behind a thin service boundary so it can change later
- write durable communication logs that can support future delivery status, audit, and reporting views

## Roadmap Table

| Idea | Current Schema Support | Effort | Recommended Timing | Why Now / Why Later |
| --- | --- | --- | --- | --- |
| Iteration 2A: Permission hardening | Strong | Small to Medium | Now | The current stack already uses SQL/RLS and RPC boundaries, so tightening role checks and removing tenant overreach is a high-confidence, high-trust improvement. |
| Iteration 2A: Custom staff roles | Partial | Medium | Now | `account_members` and account scoping already exist, but custom role definitions and capability mapping still need to be added in schema, services, and UI. |
| Iteration 2A: Custom fields | Partial | Medium | Now | OASIS already has account-scoped entities for properties and tenants; the missing layer is configurable field definitions, per-entity values, and dynamic form rendering. |
| Iteration 2A: Email/SMS integration | Partial | Medium | Now | Notification and workflow patterns already exist, so the next practical step is narrow provider-backed outbound communication with durable logs. |
| Typed API/RPC contracts | Strong | Medium | Next | The app already has a stable RPC surface for finance, dashboard, portfolio, command center, attention center, documents, and security observability. Adding Zod or typed contract wrappers would improve drift resistance without changing schema semantics. |
| Clear BFF / edge orchestration for critical writes | Strong | Medium | Next | OASIS already keeps a lot of auth in SQL/RPC. The next step is to move remaining orchestration-heavy client flows into edge functions or stricter RPC wrappers where it meaningfully reduces trust in client logic. |
| Frontend SWR / cache-on-read for high-traffic pages | Strong | Small to Medium | Next | Snapshot-style RPCs are already good cache inputs. This can improve perceived performance with limited risk and no schema redesign. |
| Operator-friendly security observability dashboard | Strong | Small to Medium | Next | The schema already includes `security_denied_events`, `security_observability_events`, and a manager-safe feed RPC. This remains valuable, but now follows the flexibility and permissions work in Iteration 2A. |
| Golden signals / SLIs / SLOs | Strong | Small to Medium | Next | OASIS already captures useful security and workflow events. The missing layer is metrics and alert thresholds for latency, errors, traffic, and saturation across critical workflows. |
| Fault injection / degraded-path testing | Not schema-dependent | Medium | Soon after | The current integration and staging discipline is strong enough to support targeted failure-mode tests. This is mostly test-harness work, not schema work. |
| Accessibility automation | Not schema-dependent | Small to Medium | Soon after | A11y testing fits cleanly into the existing test culture and does not require backend changes. |
| Tenant/account rate limiting | Partial | Medium | Now, limited Edge/API scope | `account_id` scoping exists everywhere, so the identity model supports quotas and limits. Start with narrow provider/API abuse protection before considering infrastructure-level quotas. |
| Demo data / self-service sandbox | Strong | Medium | Later, product-driven | The current schema already supports seeded accounts, properties, tenants, payments, work orders, and documents. What is missing is a productized onboarding experience around those fixtures. |
| Materialized feed caching / Redis/KV caching | Strong | Medium | Later, after measurement | Technically feasible now, but should be driven by real latency/traffic evidence. Snapshot RPCs and account scoping make this viable when needed. |
| Declarative partitioning by account | Partial but expensive | High | Much later, only with proven scale pain | Most core tables carry `account_id`, so partitioning is possible in principle. In practice, retrofitting partitioning into an existing RLS-heavy Supabase/Postgres app would be expensive and operationally risky unless production scale clearly demands it. |

## Recommendation Detail

### 1. Typed API / RPC Contracts

**Assessment**

Good recommendation. This is one of the highest-value next steps.

**Current fit**

OASIS already relies on stable RPC surfaces such as:

- `dashboard_snapshot`
- `finance_snapshot`
- `portfolio_health_snapshot`
- `command_center_items`
- `attention_center_items`
- `maintenance_kpi_snapshot`
- `security_observability_event_feed`
- `record_security_denied_event`

Those are good contract boundaries already.

**What to build**

- lightweight runtime contracts for RPC inputs and outputs
- typed service adapters around the existing RPCs and table-backed service boundaries
- light contract tests for signature and shape stability

**Current progress**

- `src/services/rpcContracts.js` now covers the core snapshot, command/attention, maintenance, document, security audit, hosted observability, billing, invite, custom role, and account owner contact response shapes.
- Custom staff role management RPCs now normalize through the shared contract layer instead of local inline row mappers.
- Account owner contact lookup now uses the same contract boundary as the other RPC-backed service adapters.

**Effort**

Medium.

### 2. Service Layer / BFF Hardening

**Assessment**

Directionally good, but the current app is already more DB-authoritative than the critique suggests.

**Current fit**

- document upload is DB-first
- many scoped reads are RPC-backed
- account and tenant guards already exist in SQL
- security denied-event capture already has DB support

**What remains**

- some workflow orchestration still lives in frontend services
- some notification/workflow composition is still client-side

**Best next step**

Move only the highest-value orchestration paths into edge functions or stricter RPCs. Do not force everything into a BFF indiscriminately.

**Current progress**

- Scheduled/provider-led Edge Functions now use a shared hosted-observability helper for cron-secret auth checks, platform config failures, per-account processing failures, provider-not-configured states, provider-send failures, cleanup workflow signals, and unexpected runtime failures.
- The hardened scheduled surfaces are:
  - `sync-operational-automation`
  - `send-reminder-emails`
  - `send-sms-notifications`
  - `cleanup-security-audit-exports`
  - `cleanup-security-observability-events`
- This closes the main non-UI consistency gap without converting operational cron/provider failures into account-user denied events.

**Effort**

Medium.

### 3. Performance Caching

**Assessment**

Worth doing, but selectively.

**Current fit**

OASIS already uses snapshot-oriented RPCs, which are much easier to cache safely than arbitrary table reads.

**Best next step**

- frontend stale-while-revalidate for read-heavy surfaces
- account-scoped cache keys
- no distributed cache until actual load justifies it

**Current progress**

- A small in-memory read-through snapshot cache now covers the highest-value read-heavy surfaces:
  - `dashboard_snapshot`
  - `finance_snapshot`
  - `portfolio_health_snapshot`
- Cache keys include account and tenant scope, plus dashboard horizon where relevant.
- Realtime refresh paths explicitly bypass the cache so payment/property/tenant/workflow changes do not keep stale dashboard, finance, or portfolio totals on screen.
- This remains intentionally local and short-lived; Redis/KV or materialized cache layers should still wait for production traffic evidence.

**Effort**

Small to Medium.

### 4. Golden Signals and Alerting

**Assessment**

Strong recommendation and low schema risk.

**Current fit**

Observability already exists in the schema for security-sensitive events. This gives OASIS a solid base for adding operator metrics and alerts.

**Best next step**

Define signals for:

- dashboard/finance snapshot latency
- feed RPC latency
- auth failures
- storage failures
- error rate on critical workflows

**Current progress**

- Phase 1 golden signals are now defined in [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md).
- Existing hosted telemetry already supports latency samples, slow-threshold events, burst-pressure rollups, and trend series for root/support telemetry views.
- Alerting should start with lightweight thresholds over critical read latency, unexpected failure bursts, provider delivery failures, document storage failures, and consecutive scheduled-job failures.

**Effort**

Small to Medium.

### 5. Fault Injection and Reliability Testing

**Assessment**

In progress.

**Current fit**

OASIS already has:

- integration isolation tests
- staging smoke
- explicit bootstrap/verify workflow

That makes targeted fault injection realistic.

**Best next step**

Test degraded behavior for:

- RPC timeout
- missing backend object
- storage failure
- notification write failure

**Current progress**

- Added focused fault-injection contracts in `tests/security/faultInjectionContracts.test.js`.
- Covered zeroed snapshot fallbacks for missing dashboard, finance, and portfolio RPCs.
- Covered timeout/non-missing RPC failures staying loud through `logSecurityRelevantFailure(...)` instead of silently falling back.
- Covered notification write failure logging with account, entity, and recipient-count scope.
- Covered document storage upload and signed-URL failures with safe document/storage context.
- Covered Edge Function failure normalization so hosted/scheduled failures retain surface, reason, account/entity, and correlation context.

**Remaining follow-up**

- Add browser-level degraded UX checks once we intentionally expose visible fallback states for critical cards/pages.
- Add provider-level chaos tests only after production telemetry shows repeated Resend, Twilio, Stripe, or Supabase Storage incidents.

**Effort**

Medium.

### 6. Accessibility Automation

**Assessment**

In progress.

**Current fit**

No schema dependency. This is a test and UI quality problem.

**Best next step**

Add Playwright + Axe for:

- auth
- dashboard
- finance
- tenant portal
- contractor portal

**Current progress**

- Added `@axe-core/playwright` and shared E2E helper coverage in `tests/e2e/helpers/accessibility.js`.
- The first blocking-violation checks now run on sign-in, owner property details, tenant-scoped property details, and root invitations admin.
- Fixed critical missing accessible names on account/tenant switchers and property-detail workflow selects surfaced by Axe.
- The first pass intentionally blocks `critical` and `serious` WCAG 2.0/2.1 A/AA violations while avoiding broad selector exclusions.

**Remaining follow-up**

- Extend Axe coverage to dashboard, finance, contractor portal, and security/root telemetry once each flow has stable Playwright navigation.
- Add a documented exception list only for confirmed false positives or unavoidable third-party widgets.

**Effort**

Small to Medium.

### 7. Human-Centric Security Dashboard

**Assessment**

Very feasible on the current schema.

**Current fit**

OASIS already has:

- durable denied-event rows
- hosted observability rows
- manager-safe feed RPC
- security audit surfaces

**Best next step**

Improve operator UX:

- better explanations
- one-click investigation paths
- grouped correlations by account, entity, and reason

**Current progress**

- The Security Audit page now includes an operator-facing hosted observability section with summary cards, filters, repeated-pattern grouping, recommended next actions, CSV export, SQL copy, and shareable investigation links.
- Hosted events can be correlated with anomaly alerts and ledger rows so a support/operator user can move from signal to investigation context without manually reconstructing the account/entity scope.
- Remaining dashboard work should focus on trend views, alert thresholds, and longer-term archive reporting rather than basic event visibility.

**Effort**

Small to Medium.

### 8. Tenant-Level Rate Limiting

**Assessment**

In progress with a deliberately limited Edge/API scope.

**Current fit**

The schema is account-scoped enough to support quota identity. That said, the best enforcement point is likely edge/API infrastructure rather than database tables alone.

**Best next step**

Start with:

- account-level request limiting
- high-cost RPC guardrails
- per-surface throttles for abuse-prone flows

**Current progress**

- Added a SQL-backed limiter in [API_RATE_LIMITING.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/API_RATE_LIMITING.md).
- `public.api_rate_limit_events` records append-only attempts without storing raw emails or phone numbers.
- `public.record_api_rate_limit_attempt(...)` returns allow/block decisions and emits hosted observability rows for `rate_limit_exceeded` blocks.
- Protected first-pass Edge/API surfaces:
  - `invite-user`
  - `send-password-reset-email`
  - `send-reminder-emails`
  - `send-sms-notifications`
  - `ingest-security-observability`
- This is intentionally not distributed rate limiting yet; Redis/KV or gateway-level quotas should wait for real traffic evidence.

**Effort**

Medium.

### 9. Demo Data / Self-Service Sandbox

**Assessment**

Feasible and product-useful.

**Current fit**

OASIS already has deterministic fixture patterns locally and in staging. The schema supports this well.

**What is missing**

- onboarding product flow
- sandbox lifecycle UX
- demo reset semantics

**Effort**

Medium.

### 10. Declarative Partitioning by Account

**Assessment**

Possible, but the least attractive near-term item.

**Current fit**

Most hot entities already include `account_id`, which means partitioning is conceptually possible.

**Why this is expensive**

OASIS is already built around:

- RLS
- account-scoped indexes
- shared snapshot RPCs
- multi-table joins across account-scoped entities

Retrofitting partitioning would require deep review of:

- indexes
- foreign keys
- query plans
- maintenance operations
- Supabase operational constraints

**Effort**

High.

**Recommendation**

Do not prioritize this unless production evidence clearly shows index bloat, vacuum pain, or plan instability at scale.

## Current Schema Support Matrix

### Strong Support

- typed contracts over RPCs
- BFF/edge hardening of remaining sensitive flows
- operator-facing observability improvements
- frontend caching on snapshot surfaces
- demo/sandbox seeded environments
- SLO and telemetry enrichment

### Partial Support

- rate limiting
- distributed caching
- larger reliability automation frameworks

These are feasible but rely more on infrastructure and application architecture than relational schema.

### Expensive Support

- account-based declarative partitioning

Possible, but costly enough that it should be evidence-driven.

## Recommended Sequence

### Phase 1

- typed RPC/service contracts
- observability UX improvements
- frontend SWR/caching on read-heavy pages
- golden-signal definitions and alerting

### Phase 2

- fault injection on critical workflows, with first service-level coverage now in place
- accessibility automation
- limited edge/API rate limiting, with first provider/API abuse guardrails now in place

### Phase 3

- demo/sandbox experience
- deeper cache layers if real traffic requires them

### Phase 4

- partitioning only if production evidence proves it is needed

## Final Recommendation

The current OASIS schema is good enough to support most of the review’s ideas without redesign.

The best near-term investments are:

1. typed contracts over the existing RPC surface
2. better operator-facing observability UX
3. selective caching on snapshot/read-heavy pages
4. SLOs and alerting
5. reliability testing for degraded paths

The main item to defer is partitioning. It is the one recommendation that would likely require material architectural and operational effort relative to the value it would deliver today.
