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

Since the last roadmap pass, the product surface has also become more coherent:

- the marketing-site positioning wave has shipped around operations, coordination, health, and trust
- the app now uses an `Operations Hub` mental model to tie command, maintenance, and health surfaces together
- maintenance/work-order handoffs are clearer across tenant, manager, and contractor views
- portfolio health is more prominent in dashboard and property flows
- finance labels and mobile-first action surfaces are clearer across core routes
- the tenant portal now includes a richer dashboard overview, maintenance summary, timeline, and document prioritization cues

The roadmap should now move away from "basic UX polish" and toward two sharper tracks:

- hardening live behavior, routing, and browser-level confidence around the existing surfaces
- adding richer product depth where the current repo already shows a strong foundation

## Current Product State (2026-04-22)

This section reflects checked-in code, SQL, and tests rather than planned intent.

### Strong and already differentiated

- **Operations Hub / Command Center**: real account-scoped queueing and prioritization
- **Maintenance and work-order coordination**: tenant intake, manager triage, contractor updates, quote/approval, and audit trail
- **Portfolio Health**: score-backed risk visibility, not decorative analytics
- **Tenant portal foundation**: tenant dashboard overview, maintenance status, tenant payments, documents, and timeline
- **Security / auditability**: append-only audit, observability feeds, denied-event logging, and manager/root surfaces
- **Contractor workflow depth**: assigned-job portal and workflow follow-through

### Harden now

- **Browser click-through and live-session behavior**
  - ensure role-correct routing under real session state
  - verify query-param-driven filters and dashboard shortcut behavior
  - catch stale-nav and direct-URL edge cases before users do
- **Responsive verification on real screens**
  - confirm tenant, contractor, finance, command, and document flows on mobile/tablet widths
  - prefer screenshot-backed checks where layouts have recently changed
- **Tenant-safe empty states and route guards**
  - recent fixes closed `/tenants` and improved `/properties`, but this should stay a standing discipline across role-shared routes
- **Surface naming and CTA semantics**
  - keep labels truthful to the actual filtered data, especially on dashboard summary cards and operational shortcuts

### Richer breadth next

- **Tenant portal depth**
  - richer activity history
  - more advanced maintenance progress history
  - stronger document priority semantics
  - eventual payment execution/autopay
  - a more premium, distinct tenant experience layer
- **Document operations and agreement workflows**
  - country-specific landlord template repository for UK and Poland first
  - tenant and contractor document intake requests
  - agreement packet workflow for template-based tenant/contractor review tasks
  - open-source e-signature integration after the native request/review model is stable
- **Operational browser confidence**
  - broader click-through coverage across dashboard, command, attention, finance, maintenance, and documents
- **Productized support and launch operations**
  - better release/runbook discipline and support workflows around an increasingly capable product

## Product And Project Maturity Review

This section captures the senior product-management / project-management review of the current repository. It is based only on checked-in evidence from app routes, services, SQL, tests, runbooks, CI workflows, marketing-site content, and readiness documents. It does not assume production traffic, customer traction, live cloud settings, team process, or customer feedback that is not present in the repo.

### Overall Product Maturity Read

OASIS is technically deeper than its operational and product wrapper. The repository shows broad product surface area and unusually strong security architecture for an early SaaS: landlord, tenant, contractor, maintenance, documents, billing, custom roles, custom fields, security audit, root telemetry, Edge Functions, RLS/RPC authorization, and broad integration/security tests are all materially represented.

The next maturity gap is not "more features everywhere." It is making launch, onboarding, support, recovery, and measurement as deliberate as the security architecture already is.

The product gap is also more specific now than this document previously captured:

- the app already has a credible operations narrative
- the next UX risk is inconsistency at runtime rather than missing feature categories
- the next product opportunity is depth in the tenant experience rather than breadth across entirely new modules

### Now

| Area | Why it needs maturity now | Repo evidence | Recommended outcome |
| --- | --- | --- | --- |
| Backup / DR / RTO / RPO | Availability is the least mature control area. The repo says PITR is database-wide, account-level recovery is not implemented, and restore drills/RTO/RPO are not evidenced. | [OASIS_WHITEPAPER_V5.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_WHITEPAPER_V5.md), [OASIS_ISO27001_CIA_AUDIT.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_ISO27001_CIA_AUDIT.md) | Define RTO/RPO, backup ownership, restore drill cadence, production restore runbook, and an account-level export/recovery decision. |
| Deployment / release operations | CI is strong, but production promotion remains operator-driven. Staging smoke is manual and docs repeatedly warn that SQL overlays and Edge Function deploys must stay synchronized. | [.github/workflows/tests.yml](/mnt/c/Users/Home/oasisrentalmanagementapp/.github/workflows/tests.yml), [.github/workflows/staging-security-smoke.yml](/mnt/c/Users/Home/oasisrentalmanagementapp/.github/workflows/staging-security-smoke.yml), [SCHEMA_WORKFLOW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SCHEMA_WORKFLOW.md) | Create a release checklist with migration/apply verification, Edge Function redeploy list, rollback steps, staging smoke evidence, and production signoff. |
| Sandbox / demo onboarding | The sandbox identity layer exists, but fixture seeding and reset semantics are explicitly deferred. This is high-leverage for sales demos, onboarding, QA, and support. | [ACCOUNT_SANDBOX_PROFILES.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/ACCOUNT_SANDBOX_PROFILES.md), [LandlordSignup.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/LandlordSignup.jsx), [LandlordOnboardingPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/LandlordOnboardingPage.jsx) | Add deterministic demo data seeding, reset-demo-account semantics, demo lifecycle rules, and E2E coverage for signup-to-demo. |
| Support operations | Support runbooks and root telemetry exist, but the repo does not evidence a ticket workflow, support escalation model, or recurring access-review evidence beyond security alert response ownership. | [docs/runbooks](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks), [RootTelemetryPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/RootTelemetryPage.jsx), [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md) | Define support triage workflow, ticket fields, escalation owner, customer communication templates, and quarterly privileged access review. |
| Production monitoring execution | Golden signals and alert thresholds are documented, but repo evidence frames them as launch guidance, not proven production alerting or operated review routines. | [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md), [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md) | Turn documented thresholds into daily checks, weekly trend review, incident ticket linkage, and named alert ownership. |

### Next

| Area | Why it belongs next | Repo evidence | Recommended outcome |
| --- | --- | --- | --- |
| Product analytics / funnel measurement | The repo has security and operational telemetry, but no product analytics, activation funnel metrics, retention cohorts, or user feedback instrumentation were evidenced. | Signup, onboarding, billing, invite, and core app routes are visible in [App.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/App.jsx); product analytics artifacts are not evidenced. | Define activation metrics: signup started, account created, first property, first tenant, first invite, first maintenance request, first payment, and billing conversion. |
| Marketing / growth content | The marketing site exists, but the blog is explicitly placeholder content and the first version is local-content driven. | [marketing-site/README.md](/mnt/c/Users/Home/oasisrentalmanagementapp/marketing-site/README.md), [blog/page.tsx](/mnt/c/Users/Home/oasisrentalmanagementapp/marketing-site/app/blog/page.tsx) | Build a content calendar, claim-reviewed comparison pages, proof points, case-study structure, and conversion tracking. |
| Performance / capacity baselines | Query-shape review exists, but staging EXPLAIN capture was deferred because staging DB access was unavailable. Further optimization should follow real data. | [PERFORMANCE_REVIEW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/PERFORMANCE_REVIEW.md), [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md) | Capture staging/production p95s, EXPLAIN plans for known hot RPCs, and account-size thresholds for index/caching decisions. |
| Accessibility expansion | Accessibility testing exists, but docs list dashboard, finance, contractor portal, and security/root telemetry as next coverage. | [tests/e2e/README.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/README.md) | Expand Axe/Playwright coverage to the main commercial workflows and document exceptions only when justified. |
| Customer-facing documentation | Quick starts exist for landlord, tenant, and contractor roles, but the product surface is broader than those first guides. | [landlord-quick-start.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/landlord-quick-start.md), [tenant-quick-start.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/tenant-quick-start.md), [contractor-quick-start.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/contractor-quick-start.md) | Add role-based help material for billing, maintenance, documents, invites, contractor flows, security/audit features, and common support scenarios. |
| Roadmap governance | The roadmap is strong technically, but it is more engineering-sequenced than product-outcome-sequenced. | This document and related technical readiness docs. | Add product roadmap fields: target segment, user problem, success metric, release owner, launch criteria, customer impact, and de-scope criteria. |

### Later

| Area | Why later | Repo evidence | Recommended outcome |
| --- | --- | --- | --- |
| SOC 2 / ISO 27001 program | The repo says technical controls are strong but ISMS evidence is not present. This is organizational work, not code alone. | [OASIS_ISO27001_CIA_AUDIT.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_ISO27001_CIA_AUDIT.md), [OASIS_WHITEPAPER_V5.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_WHITEPAPER_V5.md) | Start formal ISMS/SOC readiness when commercial pull justifies it: policies, control owners, risk register, vendor review, access reviews, internal audit. |
| Advanced SIEM / automated paging | Alert thresholds and observability exist, but docs explicitly avoid a full SIEM or automated paging in the current phase. | [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md), [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md) | Add external SIEM/paging only after volume makes manual review insufficient. |
| Distributed caching / Redis / KV | Snapshot cache exists and docs defer heavier cache layers until traffic evidence exists. | [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md), this roadmap's caching sections. | Add Redis/KV/materialized caches only when production latency or account size proves need. |
| Account-based DB partitioning | Current docs call this expensive and evidence-driven. The schema supports account scoping, but partitioning would be operationally risky. | [PERFORMANCE_REVIEW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/PERFORMANCE_REVIEW.md), this roadmap's partitioning section. | Revisit only after measured index bloat, vacuum pain, or query plan instability. |
| CMS / content operations platform | Marketing site is intentionally local-content driven and says no CMS is required for the first version. | [marketing-site/README.md](/mnt/c/Users/Home/oasisrentalmanagementapp/marketing-site/README.md) | Add a CMS only when content cadence and non-engineer publishing become bottlenecks. |

### PM Priority Call

From a product and delivery perspective, sequence the next maturity work as:

1. Launch operations readiness: release checklist, restore drill, support process, staging smoke discipline.
2. Demo/onboarding maturity: seeded sandbox, reset demo, first-value journey, onboarding success metric.
3. Measurement layer: activation funnel, product usage events, conversion, support tags.
4. Performance baseline: real staging/production plans and p95 latency before more caching.
5. Customer-facing enablement: help docs, release notes, support scripts, marketing content cadence.
6. Compliance readiness: only after customer demand justifies formal SOC/ISO work.

## Current Milestone

### Current Focus: Runtime Hardening And Depth Expansion

Current objective:

- keep the recently improved operator, tenant, contractor, and marketing surfaces honest under live browser behavior
- expand depth where OASIS is already strongest: tenant experience, maintenance coordination, portfolio health, and audit-ready workflows
- keep role isolation and SQL/RLS-first trust boundaries intact while broadening route-level and browser-level confidence

Scope for this milestone:

- browser click-through coverage for high-value routes
- responsive checks on real screens
- route/navigation behavior under live session state
- tenant portal next-phase planning and incremental depth work
- documentation refresh so roadmap, quick starts, and positioning match the current app

Strategic themes:

- Product: deeper tenant experience without breaking landlord/manager workflows
- Trust: route guards, truthful empty states, live-session correctness, and audit-ready behavior
- Quality: browser-level verification, responsive confidence, and documentation grounded in repo truth

Execution guardrails:

- keep existing auth, routing, account scoping, RLS, and role isolation intact
- prefer extensions of current services/hooks/RPCs over parallel systems
- treat browser coverage as product hardening, not optional polish
- add depth where there is already repo-backed capability before inventing new categories

Success criteria:

- shared-role routes behave correctly under direct URL entry and stale navigation state
- key CTA and dashboard shortcuts land on truthful filtered views
- tenant portal surfaces feel cohesive, not landlord leftovers with restricted data
- responsive layouts hold up across tenant, contractor, finance, command, and documents flows
- roadmap and quick-start documentation reflect the product as it exists today

## Tenant Portal Roadmap

### Current state

The tenant experience is no longer a thin afterthought. The repo now shows:

- a tenant dashboard overview in [Dashboard.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- action, payment, maintenance, notification, and document summaries in [TenantPortalOverview.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/TenantPortalOverview.jsx)
- maintenance status visibility in [TenantMaintenanceDashboard.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/TenantMaintenanceDashboard.jsx)
- a tenant timeline backed by [tenant_activity_feed.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/tenant_activity_feed.sql) and [TenantTimelineCard.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/TenantTimelineCard.jsx)
- tenant document prioritization cues backed by `set_document_tenant_highlight` in [documentService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentService.js)
- tenant payment visibility in [TenantPayments.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/TenantPayments.jsx)

### Harden next

- **True browser click-through**
  - dashboard to properties, tenant payments, documents, maintenance, and work-order-adjacent surfaces
  - direct URL access to shared-role routes under live session state
- **Responsive checks on real screens**
  - tenant dashboard
  - tenant payments
  - tenant documents
  - tenant property view
- **Route/navigation behavior under live session state**
  - role-aware redirects
  - stale sidebar/session combinations
  - query-string driven dashboard entry paths

### Richer breadth next

- **A rich tenant activity timeline**
  - current timeline exists, but should become more narrative, filterable, and easier to scan
- **Advanced maintenance progress history**
  - current statuses and feed events are useful, but still stop short of a first-class milestone history
- **True document prioritization metadata**
  - current `standard/current/action_required` highlighting is a solid start
  - the next step is first-class metadata for required/current/review-by/acknowledgement semantics
- **Payment collection / autopay**
  - not currently present as a tenant payment rail
  - should stay on the roadmap but not be marketed as shipped
- **A fully separate premium tenant portal product layer**
  - later-stage opportunity once the current tenant foundation, payment execution, and richer workflow history are in place

### Recommended timing

- now: hardening and browser confidence
- next: richer tenant timeline, maintenance history, document semantics, and e-signature provider integration
- later: payment execution/autopay and a premium standalone tenant portal layer

## Document Operations And Agreement Workflow Roadmap

### Product intent

OASIS should treat documents as operational workflow objects, not only stored files. The current document foundation now lets landlords keep reusable country-specific templates, request documents from tenants and contractors, review uploaded evidence, and send pre-signature agreement packets for tenant or contractor completion.

This should extend the current document spine rather than create a parallel document product. The current repo already has:

- DB-first uploads and document storage orchestration in [documentService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentService.js)
- document request intake orchestration in [documentRequestService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentRequestService.js)
- agreement packet orchestration in [documentPacketService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentPacketService.js)
- landlord/admin document workspace in [Documents.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- tenant-linked document surfaces in [TenantDocumentsSection.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/TenantDocumentsSection.jsx)
- Supabase storage policies aligned to document table access in [storage_documents_policies.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/storage_documents_policies.sql)
- role capability helpers for document read/upload/tag/delete in [permissions.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/utils/permissions.js)

### Phase 1: Country-specific template repository

Status: implemented foundation.

Current implementation:

- schema, RLS, storage policies, and RPCs live in [document_templates.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_templates.sql)
- landlord-facing library UI lives in [DocumentTemplateLibrary.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/DocumentTemplateLibrary.jsx)
- browser and integration coverage exists for the repository permissions and upload path

Goal:

- give landlords a reusable library for tenancy and contractor document templates
- support UK and Poland first while keeping the model ready for more countries
- keep templates landlord/staff-side only unless they are turned into a request or packet

Recommended schema:

- `document_templates`
  - `account_id`, `country_code`, `language`, `template_type`, `name`, `description`
  - `storage_path`, `mime_type`, `version`, `status`
  - `created_by`, `created_at`, `updated_at`, `archived_at`
- `document_template_versions`
  - optional but recommended once templates can be used to create signable packets
  - preserves which exact version produced a signed/generated document
- `document_template_country_rules`
  - lightweight metadata for country defaults and future country expansion
  - examples: default tags, default signer roles, review notes, required disclaimers

Initial template types:

- tenancy agreement
- contractor assignment terms
- maintenance access consent
- deposit checklist
- rent or bank-payment receipt
- guarantor or identity evidence form
- compliance notice or acknowledgement

UI:

- add a `Templates` view under Documents
- filters by country, language, type, and status
- actions: upload template, preview, archive, create request, create agreement packet

Permission boundary:

- owner/admin can create, update, archive, and use templates
- staff can read/use templates only through explicit document permissions
- tenant and contractor roles cannot browse the template repository directly

### Phase 2: Tenant and contractor document intake

Status: implemented foundation.

Current implementation:

- schema, RLS, request/upload RPCs, and request-aware storage insert policy live in [document_requests.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_requests.sql)
- canonical document storage read access includes request-target access in [storage_documents_policies.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/storage_documents_policies.sql)
- shared manager/participant UI lives in [DocumentRequestsPanel.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/DocumentRequestsPanel.jsx)
- manager review queue is mounted in [Documents.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- tenant upload tasks are mounted in the tenant documents route through [Documents.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- contractor upload tasks are mounted in [ContractorPortal.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- regression coverage exists in [documentRequests.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/documentRequests.test.js)
- browser click-through coverage exists in [document-requests-flow.spec.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/document-requests-flow.spec.js)

Goal:

- let landlords request files from tenants and contractors
- let tenants upload ID documents, bank payment receipts, or requested evidence
- let contractors upload insurance certificates, terms acknowledgements, invoices, or assignment-related files
- keep uploads scoped, reviewable, and auditable

Recommended schema:

- `document_requests`
  - `account_id`, `target_role`, `tenant_id`, `contractor_id`, `property_id`
  - `requested_by`, `request_type`, `title`, `instructions`, `due_at`
  - `status`: `requested`, `uploaded`, `accepted`, `rejected`, `cancelled`
- `document_request_uploads`
  - links request rows to uploaded `documents`
- document metadata additions:
  - `uploaded_by_role`
  - `uploaded_by_user_id`
  - `source`: `landlord_upload`, `tenant_upload`, `contractor_upload`, `template_generated`, `signature_completed`
  - `review_status`: `pending_review`, `accepted`, `rejected`
  - `review_note`, `reviewed_by`, `reviewed_at`

Security boundary:

- tenant uploads must only attach to their own tenant-scoped request
- contractor uploads must only attach to their own contractor/work-order/account-scoped request
- tenant/contractor uploads should not automatically become broadly visible account documents
- landlord/staff review should be required before uploads are treated as accepted evidence

UI:

- tenant portal: `Requested from you`, `Uploaded by you`, `Available to you`
- contractor portal: `Required documents` and `Submitted documents`
- landlord Documents: review queue for tenant/contractor uploads

Next hardening:

- split the request list into clearer `Requested from you`, `Uploaded by you`, and `Review queue` tabs once volume grows
- add due-date reminders and rejected-upload resubmission notes
- connect accepted uploads into document prioritization/current-state metadata

### Phase 3: Agreement packet workflow

Status: implemented pre-signature foundation.

Current implementation:

- schema, RLS, lifecycle RPCs, and packet events live in [document_packets.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_packets.sql)
- shared landlord/participant UI lives in [DocumentPacketsPanel.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/DocumentPacketsPanel.jsx)
- landlord packet creation and review are mounted in [Documents.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- tenant packet review/completion is mounted in the tenant documents route through [Documents.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- contractor packet review/completion is mounted in [ContractorPortal.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- integration coverage exists in [documentPackets.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/documentPackets.test.js)
- browser click-through coverage exists in [document-packets-flow.spec.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/document-packets-flow.spec.js)

Goal:

- let a landlord turn a template into a packet for a tenant or contractor
- support review/send/complete lifecycle before adding external signing dependency
- keep packet state account-scoped and auditable

Recommended schema:

- `document_packets`
  - `account_id`, `template_id`, `template_version_id`
  - `property_id`, `tenant_id`, `contractor_id`
  - `packet_type`, `status`, `created_by`
- `document_packet_recipients`
  - `packet_id`, `role`, `user_id`, `email`, `signing_order`, `status`
- `document_packet_events`
  - durable packet lifecycle audit for created, sent, viewed, completed, voided, failed

Initial workflow:

- choose template
- choose recipient and property/tenancy/work-order context
- send packet as a tenant/contractor task
- track viewed/completed state
- preserve packet events before external signature integration

Known boundary:

- this is a pre-signature workflow, not a DocuSign replacement yet
- no legal templates are seeded by default; landlords upload their own UK/Poland templates
- signed/generated PDF output is deferred to the provider integration phase

### Phase 4: Open-source e-signature provider integration

Status: readiness foundation implemented; provider API/webhook adapter still pending.

Current implementation:

- provider-neutral packet signature fields and lifecycle events live in [document_signature_readiness.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_signature_readiness.sql)
- account-scoped provider readiness metadata lives in `document_signature_provider_settings`
- manager-facing setup UI lives in [DocumentSignatureReadinessPanel.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/DocumentSignatureReadinessPanel.jsx)
- frontend service helpers live in [documentSignatureService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentSignatureService.js)
- integration coverage now verifies manager-scoped settings, tenant denial, packet preparation, and service-role-only signature status sync in [documentPackets.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/documentPackets.test.js)

Goal:

- add free/open-source e-signature capability without making signing the first blocking dependency
- keep provider-specific behavior behind an adapter

Recommended first provider:

- DocuSeal as a separately hosted signing service integrated through API/webhooks
- keep the provider separate from the main app codebase first, because licensing, deployment, and upgrades are cleaner that way

Alternative providers to evaluate:

- OpenSign
- LibreSign

Recommended schema additions:

- `signature_provider`
- `signature_template_id`
- `signature_submission_id`
- `signature_status`
- `signature_completed_document_id`

These readiness fields now exist on `document_packets`; the remaining work is provider orchestration, not packet-state storage.

Recommended Edge Functions:

- `create-signature-packet`
- `handle-signature-webhook`
- `sync-signature-status`

Security and audit requirements:

- verify webhook signatures before mutating packet state
- never expose service-role provider operations to the frontend
- import signed PDFs server-side into OASIS documents
- record every provider state transition in packet events and security/audit logs
- rate-limit packet creation and webhook handling

Next recommended slice:

- choose the first provider adapter, likely self-hosted DocuSeal unless deployment constraints push toward another OSS provider
- create Edge Functions for packet creation and webhook sync behind service-role-only boundaries
- import completed PDFs into OASIS documents after webhook verification

### Phase 5: Country and legal guardrails

Goal:

- make the UK/Poland template experience useful without overstating legal guarantees

Product copy guardrails:

- use "template", "starting point", "review before sending", and "country-specific library"
- avoid claiming legal advice or legally guaranteed agreements unless reviewed by qualified counsel
- show `last_reviewed_at`, country, language, and owner note on each template

### Required regression coverage

Add tests for:

- owner/admin can create and archive templates
- staff can read/use templates only when their permissions allow it
- tenant and contractor cannot browse template repository rows
- tenant can upload only to their own document request
- contractor can upload only to their own document request
- uploads do not leak across tenants, contractors, properties, or accounts
- landlord review can accept/reject uploaded evidence
- manager can create/send/void agreement packets only inside their account
- tenant can view/complete only their own tenant packet
- contractor can view/complete only their own contractor packet
- signature webhooks cannot update packets across account boundaries once provider integration lands
- signed documents land in the correct account/property/tenant/contractor scope once provider integration lands

Add browser E2E for:

- landlord creates a tenant document request
- tenant uploads ID or payment receipt
- landlord reviews the upload
- landlord creates an agreement packet from a template
- tenant or contractor sees the signing/request task in their portal
- tenant completes a pre-signature packet and manager sees completed status

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
| Browser click-through coverage on live session state | Not schema-dependent | Small to Medium | Now | The product now has richer role-specific flows; the highest remaining risk is browser/runtime mismatch rather than raw backend capability. |
| Responsive checks on real screens | Not schema-dependent | Small to Medium | Now | Tenant, contractor, command, and finance surfaces have all been improved recently and now need screenshot-backed confidence on real breakpoints. |
| Tenant portal runtime hardening | Strong | Small to Medium | Now | The tenant portal is now materially richer, so route guards, truthful empty states, and session-aware navigation deserve first-class hardening. |
| Rich tenant activity timeline | Strong | Medium | Next | `tenant_activity_feed` and `TenantTimelineCard` already exist; the product opportunity is better narrative depth and scanability rather than net-new foundations. |
| Advanced maintenance progress history | Partial | Medium | Next | Current statuses and timeline events exist, but a richer tenant-safe milestone history still needs a more explicit presentation model. |
| True document prioritization metadata | Partial | Medium | Next | Current tenant document highlighting exists, but the model stops short of durable acknowledgement/review/current-state semantics. |
| Document operations and agreement workflows | Strong foundation | High | In progress, phased | The current document spine now supports account-scoped uploads, tenant visibility, storage policies, template repository, tenant/contractor intake requests, and pre-signature agreement packets. Next value is open-source e-signature integration and richer document semantics. |
| Payment collection / autopay | Weak | High | Later, capability-driven | Tenant payment visibility is real, but payment execution is not repo-backed today and should remain a deliberate future expansion. |
| Premium standalone tenant portal layer | Partial foundation | High | Later, product-driven | The current tenant surfaces are credible, but a distinct premium product layer should follow richer workflow depth and payment execution. |
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

OASIS already has deterministic fixture patterns locally and in staging. The schema supports this well. Phase 3 now has the first production-safe sandbox identity layer: `account_sandbox_profiles`, `get_account_sandbox_status(...)`, and an optional self-serve signup flag that can mark new landlord accounts as demo/sandbox without changing existing production account behavior.

**What is missing**

- demo fixture seeding behind the sandbox flag
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
