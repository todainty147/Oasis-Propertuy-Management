# OASIS Engineering Roadmap

This roadmap evaluates the external engineering review against the current OASIS codebase and schema. It focuses on feasibility, effort, and recommended timing rather than generic SaaS advice.

## Summary

OASIS already has a stronger database-backed architecture than the review assumes:

- authoritative read surfaces are mostly RPC-backed
- major access rules are enforced in SQL/RLS, not only in UI
- structured denied-event and observability pipelines already exist
- the schema is account-scoped enough to support most next-step maturity work

The biggest gap is not schema capability. It is operational maturity:

- stronger typed contracts
- clearer observability and SLOs
- selective caching
- resilience testing

The only recommendation that looks genuinely heavy on the current schema is large-scale partitioning by account.

## Roadmap Table

| Idea | Current Schema Support | Effort | Recommended Timing | Why Now / Why Later |
| --- | --- | --- | --- | --- |
| Typed API/RPC contracts | Strong | Medium | Next | The app already has a stable RPC surface for finance, dashboard, portfolio, command center, attention center, documents, and security observability. Adding Zod or typed contract wrappers would improve drift resistance without changing schema semantics. |
| Clear BFF / edge orchestration for critical writes | Strong | Medium | Next | OASIS already keeps a lot of auth in SQL/RPC. The next step is to move remaining orchestration-heavy client flows into edge functions or stricter RPC wrappers where it meaningfully reduces trust in client logic. |
| Frontend SWR / cache-on-read for high-traffic pages | Strong | Small to Medium | Next | Snapshot-style RPCs are already good cache inputs. This can improve perceived performance with limited risk and no schema redesign. |
| Operator-friendly security observability dashboard | Strong | Small to Medium | Next | The schema already includes `security_denied_events`, `security_observability_events`, and a manager-safe feed RPC. This is mainly a UX and workflow improvement, not a data-model problem. |
| Golden signals / SLIs / SLOs | Strong | Small to Medium | Next | OASIS already captures useful security and workflow events. The missing layer is metrics and alert thresholds for latency, errors, traffic, and saturation across critical workflows. |
| Fault injection / degraded-path testing | Not schema-dependent | Medium | Soon after | The current integration and staging discipline is strong enough to support targeted failure-mode tests. This is mostly test-harness work, not schema work. |
| Accessibility automation | Not schema-dependent | Small to Medium | Soon after | A11y testing fits cleanly into the existing test culture and does not require backend changes. |
| Tenant/account rate limiting | Partial | Medium | Later, after traffic evidence | `account_id` scoping exists everywhere, so the identity model supports quotas and limits. Enforcement likely belongs at edge/API infrastructure rather than deep in relational schema. |
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

- Zod schemas for RPC inputs and outputs
- typed service adapters around the existing RPCs
- light contract tests for signature and shape stability

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

**Effort**

Small to Medium.

### 5. Fault Injection and Reliability Testing

**Assessment**

Good “Day 2” improvement.

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

**Effort**

Medium.

### 6. Accessibility Automation

**Assessment**

Good recommendation and easy to justify.

**Current fit**

No schema dependency. This is a test and UI quality problem.

**Best next step**

Add Playwright + Axe for:

- auth
- dashboard
- finance
- tenant portal
- contractor portal

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

**Effort**

Small to Medium.

### 8. Tenant-Level Rate Limiting

**Assessment**

Feasible, but this is more infra than schema.

**Current fit**

The schema is account-scoped enough to support quota identity. That said, the best enforcement point is likely edge/API infrastructure rather than database tables alone.

**Best next step**

Start with:

- account-level request limiting
- high-cost RPC guardrails
- per-surface throttles for abuse-prone flows

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

- fault injection on critical workflows
- accessibility automation
- limited edge/API rate limiting

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
