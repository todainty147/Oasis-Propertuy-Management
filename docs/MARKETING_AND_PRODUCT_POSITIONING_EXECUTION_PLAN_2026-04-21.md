# OASIS Marketing And Product Positioning Execution Plan

Date: 2026-04-21

Status update: refreshed on 2026-04-22 after the website positioning wave and the first app-side UX/hardening wave shipped.

This document captures the current repo-grounded positioning review, implementation backlog, and PR-by-PR execution plan for improving both:

- the OASIS marketing site
- the in-product UX/messaging around operations, health, and coordination

It is intentionally grounded in the current codebase and checked-in marketing site. It does not assume capabilities that are not present in the repo.

## Summary

OASIS is already stronger than the marketing story suggests.

The repo shows a product with real depth in:

- command and attention surfaces
- maintenance and work-order coordination
- contractor workflow handling
- portfolio health / risk signals
- tenant self-service slices
- security audit / observability

The main gap is not feature absence. It is how clearly the product expresses its value.

The current opportunity is to move OASIS away from generic "property management" framing and toward a sharper, more defensible positioning:

- property operations
- coordination
- action prioritization
- risk visibility
- audit-ready control

That positioning wave has now largely shipped across both the marketing site and the app’s top-level UX language. The next gap is less about category language and more about runtime confidence and richer product depth, especially in the tenant experience.

## Current Status

### Completed in the recent wave

- homepage repositioning around operations and coordination
- property health elevated as a headline story
- maintenance marketing rewritten around the coordination loop
- security trust layer added to marketing pages
- finance/operator tone cleanup on marketing pages
- app-side `Operations Hub` mental-model pass
- maintenance/work-order handoff clarity improvements
- portfolio health prominence in app flows
- finance clarity pass across app surfaces
- mobile-first operational polish
- tenant portal improvements including overview, timeline, document prioritization cues, and tenant-safe route/empty-state hardening

### What comes next

- browser-level click-through confidence across the richer app surfaces
- responsive verification on real screens
- deeper tenant portal breadth rather than broad new module expansion
- stronger documentation that matches the current product truth

## Repo-Grounded Positioning Review

### What is real and should be emphasized

#### 1. Command / Attention surfaces

OASIS already has real prioritized work surfaces:

- [src/pages/CommandCenterPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/CommandCenterPage.jsx)
- [src/services/commandCenterService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/commandCenterService.js)
- [src/services/attentionCenterService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/attentionCenterService.js)
- [supabase/command_center_items.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/command_center_items.sql)
- [supabase/attention_center_items.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/attention_center_items.sql)

This is one of the clearest commercial differentiators already in the product.

#### 2. Property Health

Property / portfolio health is not a decorative dashboard. It is backed by real RPCs and UI:

- [src/pages/PortfolioHealthDashboardPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/PortfolioHealthDashboardPage.jsx)
- [src/services/portfolioHealthService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/portfolioHealthService.js)
- [supabase/portfolio_health_snapshot.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/portfolio_health_snapshot.sql)
- [supabase/dashboard_snapshot.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/dashboard_snapshot.sql)

This should be marketed as a headline product capability, not a buried analytics feature.

#### 3. Coordination loop

The strongest "magic" in OASIS is not storage. It is the handoff between:

- tenant
- landlord / manager
- contractor
- completion / audit

Repo proof:

- [src/components/TenantMaintenanceDashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantMaintenanceDashboard.jsx)
- [src/pages/MaintenanceInboxPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/MaintenanceInboxPage.jsx)
- [src/pages/WorkOrderDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/WorkOrderDetails.jsx)
- [src/pages/ContractorPortal.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [src/services/workOrderFinancialsService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/workOrderFinancialsService.js)
- [supabase/contractor_work_order_cards.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/contractor_work_order_cards.sql)

#### 4. Security and auditability

Security is not just implementation detail. It is already a visible product surface:

- [src/pages/SecurityAuditPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/SecurityAuditPage.jsx)
- [src/services/securityAuditService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/securityAuditService.js)
- [supabase/security_audit_ledger.sql](/mnt/c/users/home/oasisrentalmanagementapp/supabase/security_audit_ledger.sql)
- [docs/SECURITY_OBSERVABILITY.md](/mnt/c/users/home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
- [tests/integration/SECURITY_COVERAGE_MATRIX.md](/mnt/c/users/home/oasisrentalmanagementapp/tests/integration/SECURITY_COVERAGE_MATRIX.md)

This is commercially useful trust, especially for more serious operators.

### What should not be overclaimed

#### Stripe rent collection

The repo shows Stripe integration for OASIS subscription billing, not tenant-facing rent collection:

- [src/services/billingService.js](/mnt/c/users/home/oasisrentalmanagementapp/src/services/billingService.js)
- [src/pages/BillingPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/BillingPage.jsx)
- [supabase/functions/create-checkout-session/index.ts](/mnt/c/users/home/oasisrentalmanagementapp/supabase/functions/create-checkout-session/index.ts)
- [supabase/functions/create-customer-portal-session/index.ts](/mnt/c/users/home/oasisrentalmanagementapp/supabase/functions/create-customer-portal-session/index.ts)

Marketing and product messaging should not imply "Stripe-powered tenant rent collection" unless that capability is later added and verified separately.

#### Contractor platform breadth

The contractor portal is real and useful, but it should still be framed as assigned-job workflow depth, not a full procurement/vendor-management suite.

## Strategic Repositioning

### Product category

Recommended commercial framing:

- Property Operations Platform
- Property Operations and Coordination
- Operating system for portfolio control

Avoid drifting back into generic:

- all-in-one landlord software
- simple property management app
- landlord admin tool

### Primary commercial user

Best-fit audience:

- systems-driven landlords / operators
- roughly 10 to 100 units
- currently coordinating work through messages, spreadsheets, and memory

### Core value proposition

Turn property management from a series of disconnected follow-ups into one operating system for:

- action prioritization
- maintenance coordination
- portfolio risk visibility
- audit-ready accountability

## Key Messaging Decisions

### Keep

- operator-first positioning
- command-center style prioritization
- property health as a headline
- coordination loop as a core product story
- security as a trust and accountability layer

### Adjust

- do not pitch Stripe as tenant rent collection
- do not present OASIS as a fully general property-management suite
- do not hard-merge Attention Center and Command Center in code immediately

### Recommended umbrella language

Use "Operations Hub" as the umbrella concept in UX/copy, while keeping the real product surfaces intact:

- Command Center = main portfolio-level prioritization surface
- Attention Center = immediate action queue / supporting operational layer

## Implementation Backlog

## Wave 1 — Website

### 1. Homepage repositioning

Goal: make OASIS read as an operational platform rather than generic landlord software.

Files:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/components/marketing/hero-section.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/hero-section.tsx)
- [marketing-site/components/marketing/workflow-showcase.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/workflow-showcase.tsx)

Tasks:

- reframe the hero around operator control
- introduce Operations Hub umbrella language
- keep Command Center as the named visible product surface
- tighten CTA and trust micro-copy

Acceptance:

- the homepage no longer opens with generic property-management framing
- the first screen clearly says what OASIS is, who it is for, and why it is different

### 2. Property Health headline section

Goal: elevate Health Score into a top-tier differentiator.

Files:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/app/features/page.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/app/features/page.tsx)
- [marketing-site/content/features/rental-accounting.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/rental-accounting.ts)

Tasks:

- add a dedicated homepage section for portfolio pressure / health scoring
- explain repo-backed operational signals in plain language
- shift feature proof from generic analytics to early intervention

Acceptance:

- Property Health is a headline capability on the homepage
- copy centers on risk visibility and earlier action

### 3. Coordination loop rewrite

Goal: sell the workflow handoff, not just the modules.

Files:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/content/features/maintenance-management.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/maintenance-management.ts)
- [marketing-site/components/marketing/product-preview.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/product-preview.tsx)

Tasks:

- rebuild the maintenance story around:
  - tenant reports
  - manager triages
  - contractor acts
  - quote approval
  - completion
- keep screenshots and CTA destinations aligned to each stage

Acceptance:

- the maintenance story is sequential and believable
- quote approval is clearly visible as a differentiator

### 4. Security trust layer

Goal: convert more skeptical professional operators.

Files:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/content/features/tenant-management.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/tenant-management.ts)
- relevant comparison pages if needed

Tasks:

- add a stronger trust block around:
  - role-based access
  - audit trail
  - accountability
  - review surfaces
- keep the copy practical and operator-readable

Acceptance:

- security reads like operational control, not generic enterprise jargon

### 5. Finance wording cleanup

Goal: make finance feel stronger without overclaiming payment rails.

Files:

- [marketing-site/content/pricing.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/pricing.ts)
- [marketing-site/content/features/rental-accounting.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/rental-accounting.ts)
- relevant comparison pages

Tasks:

- emphasize:
  - overdue pressure
  - paid vs due
  - arrears visibility
  - follow-up clarity
- remove any wording that implies tenant Stripe rent collection

Acceptance:

- finance copy is sharper and more credible
- no unsupported Stripe claims appear

### 6. Operator tone pass

Goal: align tone with the maturity of the product.

Files:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/content/pricing.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/pricing.ts)
- [marketing-site/content/comparisons/oasis-vs-buildium.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-buildium.ts)
- [marketing-site/content/comparisons/oasis-vs-landlordstudio.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-landlordstudio.ts)
- [marketing-site/content/comparisons/oasis-vs-tenantcloud.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-tenantcloud.ts)

Tasks:

- reduce soft phrases such as:
  - simple
  - all-in-one
  - streamline
- increase language around:
  - operational control
  - what needs action now
  - audit-ready follow-through
  - risk visibility
  - coordination

Acceptance:

- the site sounds like an operations product for serious landlords

## Wave 2 — App

### 7. Operations Hub mental-model pass

Goal: reduce Attention Center vs Command Center confusion without refactoring routes.

Files:

- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)
- [src/App.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/App.jsx)
- relevant sidebar/navigation files if labels are centralized there

Tasks:

- introduce Operations Hub as umbrella copy
- clarify:
  - Command Center = portfolio overview and prioritization
  - Attention Center = immediate task surface
- keep routes and service names unchanged

Acceptance:

- the distinction is clearer without changing architecture

### 8. Property Health prominence in app

Goal: make health and risk feel central inside the product.

Files:

- [src/pages/Dashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- [src/pages/PortfolioHealthDashboardPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/PortfolioHealthDashboardPage.jsx)
- [src/pages/PropertyDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/PropertyDetails.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Tasks:

- improve health score visibility and cross-links
- reframe copy around deterioration, intervention, and risk
- improve entry points from dashboard and property details

Acceptance:

- operators can reach risk context faster
- health score feels like a decision tool, not a side report

### 9. Coordination flow visibility in app

Goal: make maintenance and work-order handoffs easier to understand.

Files:

- [src/pages/MaintenanceInboxPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/MaintenanceInboxPage.jsx)
- [src/pages/WorkOrderDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/WorkOrderDetails.jsx)
- [src/pages/ContractorPortal.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [src/components/TenantMaintenanceDashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantMaintenanceDashboard.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Tasks:

- add clearer state labels
- surface "who owns this now?" more clearly
- give quote approval/rejection more weight
- improve current-step / next-step readability

Acceptance:

- the coordination loop is easier to follow across roles
- no backend workflow changes are required

### 10. Finance clarity pass in app

Goal: strengthen confidence in finance surfaces.

Files:

- [src/pages/Finance.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Finance.jsx)
- [src/pages/TenantPayments.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/TenantPayments.jsx)
- [src/pages/Dashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Tasks:

- emphasize:
  - due
  - overdue
  - paid
  - outstanding
- reduce ambiguous labels
- make tenant vs account scope clearer

Acceptance:

- users can tell quickly what is due and what needs follow-up

### 11. Mobile-first operational polish

Goal: make the most important workflows feel intentional on phones.

Files:

- [src/pages/ContractorPortal.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [src/pages/ContractorJobDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorJobDetails.jsx)
- [src/components/TenantPortalOverview.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantPortalOverview.jsx)
- [src/components/TenantTimelineCard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantTimelineCard.jsx)
- [src/pages/CommandCenterPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/CommandCenterPage.jsx)

Tasks:

- reorder cards by urgency on smaller screens
- improve spacing and first-action visibility
- shorten copy for small screens

Acceptance:

- tenant, contractor, and operator surfaces feel more deliberate on mobile

## Next-Phase Additions

These items now sit after the completed website positioning and app-clarity wave.

### Tenant portal depth

Goal: build on the now-solid tenant foundation rather than replacing it.

Next candidates:

- rich tenant activity timeline
- advanced maintenance progress history
- true document prioritization metadata
- payment collection / autopay
- a fully separate premium tenant portal product layer

Notes:

- timeline, maintenance history, and document semantics are the most natural next steps because the current repo already has partial foundations
- payment collection/autopay and a premium standalone tenant portal remain later-stage work and should not be marketed as shipped

### Browser/runtime hardening

Goal: verify that the improved product story holds under real navigation and session state.

Next candidates:

- true browser click-through on the main operator, tenant, and contractor paths
- responsive checks on real screens
- route/navigation behavior under live session state

Notes:

- a focused tenant Playwright flow now exists and covers dashboard, `/tenants` redirect behavior, and tenant property access
- the next step is to broaden that model across dashboard shortcuts, maintenance/command flows, finance entry points, and document navigation

## PR-By-PR Execution Plan

### PR 1 — Website: Reposition the homepage

Scope:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/components/marketing/hero-section.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/hero-section.tsx)
- [marketing-site/components/marketing/workflow-showcase.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/workflow-showcase.tsx)

Changes:

- reframe hero around operator control
- introduce Operations Hub umbrella language
- clarify Command Center as the core visible surface
- tighten CTA and trust micro-copy

Why first:

- highest commercial impact
- lowest technical risk

### PR 2 — Website: Rewrite the coordination loop

Scope:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/content/features/maintenance-management.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/maintenance-management.ts)
- [marketing-site/components/marketing/product-preview.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/components/marketing/product-preview.tsx)

Changes:

- rebuild maintenance story around the real handoff flow
- highlight quote approval as a key moment
- align screenshots and CTA destinations to the correct stage

Why second:

- it exposes the core operational difference quickly

### PR 3 — Website: Add the Property Health story

Scope:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/app/features/page.tsx](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/app/features/page.tsx)
- [marketing-site/content/features/rental-accounting.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/rental-accounting.ts)

Changes:

- add / expand the homepage health section
- strengthen feature proof around risk visibility and early action

Why third:

- this is a strong differentiator and easier to sell after the homepage and workflow narrative are sharper

### PR 4 — Website: Security trust layer

Scope:

- [marketing-site/content/homepage.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/homepage.ts)
- [marketing-site/content/features/tenant-management.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/tenant-management.ts)
- relevant comparison pages if needed

Changes:

- add trust copy around audit trail, role-based access, and accountability

Why fourth:

- security is more persuasive once the core operational story is already clear

### PR 5 — Website: Finance truthfulness and operator tone pass

Scope:

- [marketing-site/content/pricing.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/pricing.ts)
- [marketing-site/content/features/rental-accounting.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/features/rental-accounting.ts)
- [marketing-site/content/comparisons/oasis-vs-buildium.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-buildium.ts)
- [marketing-site/content/comparisons/oasis-vs-landlordstudio.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-landlordstudio.ts)
- [marketing-site/content/comparisons/oasis-vs-tenantcloud.ts](/mnt/c/users/home/oasisrentalmanagementapp/marketing-site/content/comparisons/oasis-vs-tenantcloud.ts)

Changes:

- remove unsupported rent-collection implications
- tighten operator tone across pricing and compare pages

Why fifth:

- this is mostly wording calibration and is easier to do after the homepage direction is stable

### PR 6 — App: Operations Hub mental model

Scope:

- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)
- [src/App.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/App.jsx)
- relevant nav files if needed

Changes:

- clarify how Attention Center and Command Center relate

### PR 7 — App: Coordination flow visibility

Scope:

- [src/pages/MaintenanceInboxPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/MaintenanceInboxPage.jsx)
- [src/pages/WorkOrderDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/WorkOrderDetails.jsx)
- [src/pages/ContractorPortal.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [src/components/TenantMaintenanceDashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantMaintenanceDashboard.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Changes:

- improve state readability, ownership cues, and quote approval visibility

### PR 8 — App: Property Health prominence

Scope:

- [src/pages/Dashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- [src/pages/PortfolioHealthDashboardPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/PortfolioHealthDashboardPage.jsx)
- [src/pages/PropertyDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/PropertyDetails.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Changes:

- elevate the visibility and navigation around health/risk

### PR 9 — App: Finance clarity

Scope:

- [src/pages/Finance.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Finance.jsx)
- [src/pages/TenantPayments.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/TenantPayments.jsx)
- [src/pages/Dashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- [src/i18n/messages.js](/mnt/c/users/home/oasisrentalmanagementapp/src/i18n/messages.js)

Changes:

- sharpen due / overdue / paid / outstanding hierarchy

### PR 10 — App: Mobile-first operational polish

Scope:

- [src/pages/ContractorPortal.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorPortal.jsx)
- [src/pages/ContractorJobDetails.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/ContractorJobDetails.jsx)
- [src/components/TenantPortalOverview.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantPortalOverview.jsx)
- [src/components/TenantTimelineCard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantTimelineCard.jsx)
- [src/pages/CommandCenterPage.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/CommandCenterPage.jsx)

Changes:

- reorder mobile cards by urgency
- improve spacing and first-action visibility

## Recommended Execution Order

Recommended order based on product payoff and reviewability:

1. PR 1 — Website: Reposition the homepage
2. PR 2 — Website: Rewrite the coordination loop
3. PR 3 — Website: Add the Property Health story
4. PR 4 — Website: Security trust layer
5. PR 5 — Website: Finance truthfulness and operator tone pass
6. PR 6 — App: Operations Hub mental model
7. PR 7 — App: Coordination flow visibility
8. PR 8 — App: Property Health prominence
9. PR 9 — App: Finance clarity
10. PR 10 — App: Mobile-first operational polish

This order is the recommended default unless commercial or engineering priorities change.

## Guardrails

- Do not market unsupported Stripe tenant rent-collection capability.
- Do not merge Attention Center and Command Center in code until the mental model is validated in copy/UX first.
- Prefer copy, hierarchy, and navigation clarity before structural refactors.
- Keep screenshots aligned to the specific workflow stage or CTA they support.
- Keep claims grounded in repo-backed capabilities, pages, RPCs, services, SQL, and tests.
