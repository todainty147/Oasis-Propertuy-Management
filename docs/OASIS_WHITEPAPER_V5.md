# OASIS Whitepaper V5

## Executive Summary

OASIS is a multi-tenant rental management application for landlords, property managers, tenants, contractors, and root support operators. The current architecture is intentionally database-authoritative: the browser renders workflows, but account isolation and role authorization are enforced server-side through Supabase Auth, PostgreSQL Row Level Security (RLS), and security-definer RPCs.

Version 5 reframes OASIS as an operationally ready SaaS platform for early commercial use at approximately 50-100 landlord accounts, assuming normal small-portfolio usage patterns and continued operational monitoring. It does not claim formal SOC 2, ISO 27001, or regulated-industry certification. Those controls remain roadmap items that would require policy, evidence, third-party audit, incident management, vendor management, and formal control ownership beyond the application codebase.

OASIS currently provides:

- account-scoped landlord, staff, tenant, contractor, and root-support access models
- custom staff roles and dynamic role permissions
- account-scoped properties, tenants, payments, leases, maintenance workflows, documents, custom fields, and operational dashboards
- private document storage with account-scoped paths and storage policies
- outbound email/SMS infrastructure with event logging for selected workflows
- structured security observability, denied-event logging, rate-limit events, and manager/root-facing audit surfaces
- local integration, security, and Playwright test coverage for high-risk access paths

The platform is best described as **operationally ready for controlled production use and monitored expansion**, not compliance-certified or enterprise-governed in the formal audit sense.

## Product Scope

OASIS supports the core operating workflows for small-to-mid-sized property portfolios:

- landlord account setup and invite-based access
- staff roles and permissions per account
- property and tenant management
- rent/payment visibility and payment mutation RPCs
- maintenance intake, contractor assignment, work-order status, contractor updates, quote/invoice flows, and ratings
- document upload, metadata finalization, signed access, audit logging, and scoped download behavior
- dashboard, finance, portfolio health, command center, attention center, maintenance KPI, and security audit views
- outbound invitation, reminder email, and SMS notification paths where configured
- account sandbox metadata for future demo/reset flows

OASIS is not currently claiming:

- SOC 2 certification
- ISO 27001 certification
- account-level point-in-time recovery
- guaranteed SLA/SLO commitments
- regulated financial, medical, or government compliance posture
- fully automated incident response

## Architecture Overview

The current architecture follows a simple browser-to-Supabase model with a thin frontend service layer.

```text
React UI
  |
  v
Frontend Service Layer
  |
  |-- Supabase Auth
  |-- Supabase Edge Functions
  |-- PostgreSQL RPCs
  |-- Supabase Storage
  v
Supabase Platform
  |
  |-- Auth: users, sessions, invite/recovery flows
  |-- Database: PostgreSQL tables, RLS policies, security-definer RPCs
  |-- Storage: private buckets, account-scoped object paths, storage policies
  |-- Edge Functions: outbound email/SMS, billing/webhooks, observability ingestion, cleanup jobs
```

The service layer exists to normalize API calls, parse RPC results, classify failures, and keep UI code from directly encoding backend response details. It is not the security boundary. The security boundary is server-side.

## Service Layer and Security Boundary

The OASIS frontend service layer is a client-side orchestration and normalization layer. It:

- calls Supabase RPCs, tables, storage, and Edge Functions
- normalizes returned row shapes through shared runtime contracts
- centralizes selected failure classification and security observability calls
- keeps UI components simpler and less coupled to Supabase response details

The service layer does **not** authorize users by itself. UI checks and service checks can improve usability, hide unavailable actions, and reduce accidental bad requests, but they are not trusted for isolation.

All authoritative authorization is enforced server-side through:

- Supabase Auth session identity
- PostgreSQL RLS policies
- security-definer RPC guards such as `assert_manage_account_access(...)`, `assert_tenant_scope_access(...)`, role/permission helpers, contractor assignment checks, and root-operator checks
- Storage policies for private object access
- Edge Function secret checks for scheduled/provider-led workflows

This means bypassing the React UI should not be enough to gain cross-account access when the database and functions are configured with the checked-in policies and RPC overlays.

## Identity, Roles, and Permissions

OASIS uses account-scoped membership records as the primary role anchor. The current role model includes:

- owner
- admin
- staff
- tenant
- contractor
- root support/operator paths
- custom account-scoped staff roles through `roles`, `role_permissions`, and `account_members.role_id`

The application preserves backward compatibility with legacy role values while resolving permissions dynamically through role metadata where available.

Root access is treated as a distinct operational support model. Root operators can inspect or administer selected account-level surfaces through root-specific RPCs and UI gates, but ordinary invited staff should not inherit root visibility or see unrelated accounts.

## Data Isolation Model

Most business data is account-scoped with `account_id`. Tenant and contractor access is further narrowed by tenant/property or assigned-work-order relationships.

The principal isolation rules are:

- owners/admins/staff operate within their account scope
- tenants see only tenant-scoped payments, documents, requests, and related account/property information
- contractors see only assigned work orders and permitted attachment/workflow surfaces
- root support surfaces are explicit and separated from normal account membership behavior

High-value reads and writes increasingly use RPCs rather than direct client table access. This creates stable authorization choke points for snapshots, operational feeds, payments, documents, work orders, invites, custom roles, security audit workflows, and observability.

## Storage Isolation

OASIS uses Supabase Storage for document and attachment objects. The primary document bucket is private, and access is controlled through storage policies rather than public object URLs.

Document storage paths are account-scoped. The expected document object path format is:

```text
<account_id>/<document_id>/<file>
```

Storage policies validate path structure and call database helpers such as `can_access_document_storage(...)` to ensure object access aligns with the authoritative `documents` row, account scope, document visibility, and tenant membership where applicable.

The current storage model includes:

- private bucket usage for documents
- account-scoped object paths
- policy-protected select/insert/delete operations
- manager/tenant/contractor access rules depending on bucket and workflow
- signed URL generation only after application/service access checks
- document audit logging for selected metadata, download, delete, and tag workflows

Object paths, signed URLs, document filenames, and raw storage metadata are intentionally excluded from shared security logs to reduce data exposure risk.

## Observability and Auditability

OASIS includes structured security and operational observability for high-risk workflows. Current surfaces include:

- `security_denied_events`
- `security_observability_events`
- `security_audit_ledger`
- `api_rate_limit_events`
- outbound email/SMS event logs
- manager/root-facing security audit and telemetry views
- cleanup functions for observability/export retention

Redaction happens before logging or egress to hosted observability sinks. The application and Edge Function helpers intentionally remove or avoid obvious sensitive fields such as:

- invite tokens
- authorization headers
- secrets and API keys
- passwords
- raw request bodies and HTML
- email/phone recipient values in shared logger metadata
- document filenames, storage paths, signed URLs, and raw storage metadata

Security logs are designed to preserve operational correlation fields such as account id, actor id where safe, entity type, entity id, reason code, provider status, and request/correlation ids when exposed by providers.

Important limitation: durable denied events are only written when application or function code performs the follow-up logging request after catching the original denial. PostgreSQL exceptions roll back the original transaction, so pure SQL-only callers that do not perform a follow-up logging call may not create durable denied-event rows.

## Encryption

OASIS relies on Supabase-managed infrastructure for platform-level encryption:

- data at rest is encrypted using AES-256 at the Supabase/Postgres/storage layer
- client and API traffic uses TLS in transit

The application code does not currently implement a separate customer-managed encryption key model, per-account envelope encryption, or application-layer field encryption for individual business records.

## Backup and Recovery

The current recovery model is platform-level backup and recovery through Supabase/Postgres capabilities, including point-in-time recovery (PITR) where enabled for the production project/plan.

Current characteristics:

- PITR is database-wide, not account-specific
- recovery can restore database state to a previous point in time, but this is an environment/database operation rather than a tenant self-service feature
- object storage recovery depends on Supabase storage backup/retention capabilities and operational process
- account-level recovery and selective tenant/account rollback are not currently implemented

Future direction:

- account-level export and recovery workflows
- clearer recovery runbooks
- sandbox/demo reset tooling limited to accounts marked `mode = 'demo'`
- stronger restore drills and documented recovery time objectives once commercial traffic justifies formal commitments

## Threat Model

OASIS should be evaluated against OWASP Top 10 risks with emphasis on RPC-driven SaaS architecture.

### Broken Access Control

Primary risk: cross-account data access, tenant seeing landlord data, contractor seeing unassigned work, or staff gaining root-level visibility.

Current mitigations:

- account-scoped tables and RLS policies
- RPC authorization guards
- tenant and contractor scope checks
- root-only RPCs and navigation gates
- integration tests for cross-account, tenant, contractor, invite, document, storage, payment, work-order, and root-support paths

### Cryptographic Failures and Sensitive Data Exposure

Primary risk: leaking invite tokens, document paths, signed URLs, recipient data, or security log payloads.

Current mitigations:

- TLS in transit and AES-256 at rest via Supabase-managed infrastructure
- private storage buckets and signed access flows
- scrubbed observability metadata
- no invite token, signed URL, or storage path logging in shared security logs

### Injection

Primary risk: unsafe SQL composition or RPC inputs.

Current mitigations:

- Supabase client parameterization
- PostgreSQL RPC arguments rather than string-built SQL in app code
- role and scope checks inside SQL functions

### Identification and Authentication Failures

Primary risk: accepting invites for the wrong user, replaying invites, or bypassing password recovery/invite flows.

Current mitigations:

- Supabase Auth for identity/session handling
- invite token, email, expiry, revoked, and accepted-state checks
- branded invite and password reset Edge Function flows
- rate limiting for invite and password reset surfaces

### Security Misconfiguration

Primary risk: missing SQL overlays, open storage policies, missing Edge Function secrets, or stale production functions.

Current mitigations:

- `db:apply:repo` overlay process
- `db:verify` checks for launch-relevant objects
- docs/runbooks for security observability and provider correlation
- tests covering SQL/RLS/RPC/storage policy surfaces locally

### Vulnerable and Outdated Components

Primary risk: dependency or provider vulnerability.

Current mitigations:

- standard package-lock dependency management
- build/test workflows
- no claim of mature SBOM or formal vulnerability management program yet

### Logging and Monitoring Failures

Primary risk: denied paths, provider failures, or abuse patterns going unnoticed.

Current mitigations:

- denied-event stream
- hosted observability sink
- security audit page
- root telemetry
- API rate-limit events
- outbound provider event logs

Remaining maturity work:

- formal SLOs/SLIs
- alert thresholds
- incident process
- long-term evidence retention policy

## Operational Readiness

OASIS is positioned for controlled launch readiness rather than unrestricted enterprise scale.

Current readiness framing:

- suitable for monitored operation at approximately 50-100 landlord accounts
- strongest in account isolation, role-based access, invite security, document/storage control, and operational visibility
- requires active operator monitoring of hosted observability, provider logs, rate limits, and Supabase health
- requires production SQL overlays and Edge Function deployments to remain synchronized with repository changes

This is not the same as formal enterprise compliance readiness. SOC 2 and ISO 27001 remain roadmap-level goals that require organizational controls as well as technical controls.

## Architecture Diagram

```text
                           ┌─────────────────────┐
                           │      React UI       │
                           │ pages/components    │
                           └──────────┬──────────┘
                                      │
                                      v
                           ┌─────────────────────┐
                           │ Frontend Services   │
                           │ contracts/logging   │
                           └─────┬───────┬───────┘
                                 │       │
                    ┌────────────┘       └─────────────┐
                    v                                  v
          ┌──────────────────┐              ┌──────────────────┐
          │ Supabase Auth    │              │ Edge Functions   │
          │ users/sessions   │              │ email/SMS/cron   │
          └────────┬─────────┘              └────────┬─────────┘
                   │                                 │
                   v                                 v
          ┌────────────────────────────────────────────────────┐
          │              Supabase PostgreSQL                   │
          │ tables + RLS + security-definer RPCs               │
          │ account/tenant/contractor/root authorization       │
          └──────────────────────┬─────────────────────────────┘
                                 │
                                 v
          ┌────────────────────────────────────────────────────┐
          │              Supabase Storage                      │
          │ private buckets + account-scoped paths + policies  │
          └────────────────────────────────────────────────────┘
```

## Roadmap and Maturity Direction

Near-term maturity work should remain practical and evidence-driven:

- demo fixture seeding and sandbox reset semantics for accounts marked `mode = 'demo'`
- deeper cache layers only after production traffic shows need
- fault-injection and degraded-path testing
- accessibility expansion
- golden signals, SLOs, and alert thresholds
- formal backup/restore drills and recovery documentation

Longer-term compliance direction:

- SOC 2 readiness program
- ISO 27001 readiness program
- formal incident response
- vendor risk management
- access reviews and evidence collection
- customer-facing security documentation

## Version 5 Change Summary

This Version 5 whitepaper adds or rewrites:

- Executive Summary
- Service Layer and Security Boundary
- Storage Isolation
- Observability and Auditability
- Encryption
- Backup and Recovery
- Threat Model
- Operational Readiness
- Architecture Diagram
- Roadmap and Maturity Direction

It intentionally replaces readiness slogans with operational readiness for a controlled 50-100 landlord scale and explicitly reserves SOC 2/ISO language for roadmap maturity.

## Claim Integrity Confirmation

No architectural claims in this document are intended to exceed the current repository state. The document does not claim formal compliance certification, account-level recovery, fully automated incident response, or a separate enterprise BFF where none exists. It describes the current OASIS model as a React/Supabase application whose security boundary is enforced server-side through Auth, RLS, RPC guards, storage policies, and selected Edge Function checks.
