# OASIS Tenant Portal Runtime Hardening Sprint Brief

Date: 2026-04-22

Owner recommendation: Product / Engineering

Status: proposed next sprint

## Why this sprint now

OASIS has recently made the tenant portal materially stronger:

- tenant dashboard overview
- payment summary
- maintenance tracking
- documents with prioritization cues
- tenant timeline
- improved route guards and tenant-safe empty states

That means the highest remaining risk is no longer "missing tenant features."

It is **runtime coherence**:

- click a dashboard CTA and land on the wrong filtered state
- hit a shared route under a tenant session and see landlord-shaped leftovers
- experience different behavior on mobile than desktop
- carry stale session or query-string state into a route that behaves oddly

This sprint exists to make the current tenant portal feel dependable and premium in real browser use before we add the next layer of tenant depth.

## Sprint objective

Make the current tenant portal feel **unbreakably coherent in the browser** across dashboard entry points, shared routes, documents, payments, maintenance, and responsive layouts.

## Product problem

The tenant portal is now strong enough that user trust depends on the details:

- navigation must behave correctly
- empty states must be tenant-shaped
- links from the dashboard must land on truthful views
- mobile layouts must still communicate the same story

If these runtime details drift, the product feels less premium than the underlying architecture actually is.

## Primary user

Tenant users navigating the self-service portal under a live session, especially on mobile or from dashboard shortcuts.

Secondary users:

- landlords/operators who expect tenant-facing links and shared routes to behave predictably
- support/admin users diagnosing "I clicked this and landed somewhere strange"

## User stories

1. As a tenant, when I click from my dashboard into payments, maintenance, documents, or property information, I land on the right screen and the page still feels like it was built for me.

2. As a tenant, if I enter a shared route directly or through an old link, the app redirects me safely instead of showing landlord-first leftovers.

3. As a tenant on a phone, I can still understand what needs attention and take the next obvious action without layout confusion.

4. As a landlord/operator, I can trust that tenant-facing CTAs and shared routes behave consistently in real browser sessions.

## In scope

### Runtime hardening

- tenant dashboard click-through behavior
- direct URL handling for tenant-shared routes
- route/navigation behavior under live session state
- tenant-safe empty states on shared pages
- truthful filter/CTA landing behavior

### Responsive validation

- tenant dashboard
- tenant payments
- tenant documents
- tenant property view
- tenant maintenance-related entry points

### Focused browser automation

- Playwright coverage for the main tenant self-service path
- route and redirect assertions
- basic mobile/real-screen checks on the key tenant surfaces

## Out of scope

- payment collection or autopay
- major tenant portal redesign
- new backend workflow states
- premium standalone tenant portal
- document acknowledgement product model
- richer tenant timeline/history model

Those are follow-on items after runtime confidence is stronger.

## Success criteria

### Product success

- tenant dashboard CTAs land on the intended surfaces
- tenant users do not see landlord-shaped "create your first..." empty states on shared pages
- direct URL access to restricted/shared routes resolves correctly under tenant sessions
- tenant pages remain clear and usable on mobile widths

### Engineering success

- focused browser coverage exists for the key tenant click-through path
- route guard behavior is explicit rather than accidental
- query-string or filtered-entry behavior is covered where it matters
- no regressions to landlord/manager/contractor flows

## Acceptance criteria

### Dashboard and entry points

- `Dashboard` opens correctly for tenant users and displays the current tenant overview
- dashboard links to:
  - payments
  - property
  - maintenance-related surfaces
  - documents
  behave as expected under a tenant session

### Shared routes

- `/tenants` does not expose tenant-inappropriate content and redirects safely
- `/properties` displays tenant-safe empty states and tenant-appropriate content
- shared routes continue to respect current auth, account scoping, and RLS expectations

### Responsive behavior

- tenant dashboard remains readable and action-oriented on mobile
- tenant payments remain readable on mobile
- tenant documents remain readable on mobile
- no major text overlap, clipped actions, or broken button stacking on key tenant screens

### Testing

- Playwright tenant flow covers:
  - dashboard load
  - redirect behavior
  - properties access
  - property details isolation
- at least one tenant-focused responsive/mobile check exists or is added during the sprint

## Engineering task breakdown

### Track 1: tenant route and page hardening

Files likely involved:

- [src/pages/Dashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Dashboard.jsx)
- [src/pages/Properties.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Properties.jsx)
- [src/pages/Tenants.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Tenants.jsx)
- [src/pages/Documents.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- [src/pages/TenantPayments.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/TenantPayments.jsx)
- [src/components/TenantPortalOverview.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantPortalOverview.jsx)

Tasks:

- verify tenant dashboard CTA destinations
- harden route guards and redirects where shared routes still rely on UI hiding alone
- keep empty states tenant-safe and truthful
- ensure dashboard entry paths do not create misleading filtered states

### Track 2: responsive behavior checks

Files likely involved:

- [src/components/TenantPortalOverview.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantPortalOverview.jsx)
- [src/pages/TenantPayments.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/TenantPayments.jsx)
- [src/pages/Documents.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/pages/Documents.jsx)
- [src/components/TenantMaintenanceDashboard.jsx](/mnt/c/users/home/oasisrentalmanagementapp/src/components/TenantMaintenanceDashboard.jsx)

Tasks:

- review critical tenant surfaces at mobile widths
- fix button stacking, card order, and text overflow issues
- keep information hierarchy consistent between desktop and mobile

### Track 3: browser test coverage

Files likely involved:

- [tests/e2e/tenant-restrictions-flow.spec.js](/mnt/c/users/home/oasisrentalmanagementapp/tests/e2e/tenant-restrictions-flow.spec.js)
- [tests/e2e/README.md](/mnt/c/users/home/oasisrentalmanagementapp/tests/e2e/README.md)

Tasks:

- broaden tenant Playwright coverage from route restriction into click-through behavior
- add assertions for dashboard landing, core CTA navigation, and tenant-safe shared routes
- add at least one mobile-oriented browser check if feasible within the sprint

## QA / test scope

### Must run

- targeted ESLint on touched files
- production build
- focused Playwright tenant flow using the local Supabase-backed harness

### Recommended

- screenshot review at key mobile widths
- regression spot-check on landlord dashboard shortcuts
- regression spot-check on contractor portal navigation if shared code paths are touched

## Risks

- route hardening can accidentally hide legitimate shared-role behavior if we overcorrect
- mobile fixes can change layout semantics in subtle ways
- dashboard CTA logic can look correct in code while still being misleading in the browser

## Guardrails

- do not weaken auth, account scoping, RLS, or role isolation
- do not build a parallel tenant portal
- prefer using current services, hooks, and RPC-backed reads
- keep landlord/manager workflows stable unless a shared-route fix truly requires change

## Notable follow-on sprint after this one

If this sprint succeeds, the next best tenant-facing sprint is:

- rich tenant activity timeline
- advanced maintenance progress history
- true document prioritization metadata

That sequence builds depth on top of a tenant portal we can already trust in the browser.
