# Playwright E2E

This folder contains browser-level Playwright tests for the main OASIS app.

The setup mirrors the working `APStaffCommandCenter` pattern:

- a small Node launcher in [scripts/runPlaywright.mjs](/mnt/c/Users/Home/oasisrentalmanagementapp/scripts/runPlaywright.mjs)
- Playwright-managed Vite startup
- integration env injection from [tests/integration/helpers/env.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/helpers/env.js)

## Run locally

```bash
npm run test:e2e
```

Playwright starts the Vite app automatically on `http://127.0.0.1:4173`.

If you switch between PowerShell and WSL, reinstall dependencies in the shell you will run tests from. Native packages such as `esbuild` install platform-specific binaries, so a `node_modules` folder created in WSL will not run Vite from Windows PowerShell, and vice versa.

## Useful variants

```bash
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:debug
```

## Release-critical pack

Use the critical pack before release-style checks when you want the fastest browser signal over the highest-risk app paths:

```bash
npm run test:e2e:critical
```

The critical pack covers:

- app shell sign-in
- owner property creation, tenant assignment, and downstream Finance visibility
- maintenance request triage to contractor-completed linked work order
- invited staff acceptance and scoped account landing
- reusable role navigation, direct-route, action visibility, and account switcher matrix checks
- tenant-scoped navigation
- root invitations surface
- self-serve signup

## Operator / AI journey pack

Use the operator pack when changing the AI-led surfaces that explain issues, facts, and next steps:

```bash
npm run test:e2e:operator
```

The operator pack covers:

- Command Center operator briefing action click-through
- Portfolio Health explainer drill-down into the affected property
- Maintenance Inbox AI triage handoff into contractor recommendation
- contractor recommendation in the create-work-order drawer
- weekly portfolio briefing visibility

## Responsive / accessibility release pack

Use the responsive pack when changing shell layout, commercial pages, or role-specific page structure:

```bash
npm run test:e2e:responsive
```

The pack runs desktop and mobile-width accessibility checks for:

- dashboard
- finance
- documents
- contractor portal
- security/root telemetry

These checks intentionally scan release-level page states rather than every possible modal. If a route gains a new primary card, action panel, or subscription state, extend this pack before release.

## Degraded-path pack

Use the degraded-path pack when changing routing, RPC loading, signup, invite handling, entitlement gates, or empty states:

```bash
npm run test:e2e:degraded
```

The pack currently proves:

- invalid invite links fail with a visible message
- stale property query parameters show a clear empty state
- new landlord accounts start with a safe empty property state
- starter accounts see a subscription upgrade card for gated operator surfaces
- Command Center RPC failures render a visible degraded-path banner

## Extended and visual lanes

The release lanes are split by risk and runtime:

```bash
npm run test:e2e:critical
npm run test:e2e:extended
npm run test:e2e:visual
```

- `critical` must pass before every release and covers the highest-risk business journeys.
- `extended` adds operator/AI, document, payment setup, responsive, and degraded-path confidence.
- `visual` is for marketing/social screenshot generation and UI presentation checks.

## Current matrix status

The browser test matrix is currently at release baseline for Phases 2-7:

- Phase 2 business journeys: covered by `critical-owner-business-flow`, `maintenance-work-order-flow`, `invite-acceptance-flow`, and `self-serve-signup-flow`.
- Phase 3 operator journeys: covered by `command-center-ai`, `portfolio-health-ai`, `maintenance-inbox-ai`, `contractor-recommendation-ai`, and `weekly-portfolio-ai`.
- Phase 4 role/permission matrix: covered by `role-navigation-permissions`.
- Phase 5 responsive/accessibility pack: covered by `responsive-accessibility-release`.
- Phase 6 degraded-path pack: covered by `degraded-paths`.
- Phase 7 lane packaging: covered by the `critical`, `extended`, and `visual` scripts, with the critical local E2E lane wired into GitHub Actions.

Remaining matrix work is second-order hardening rather than baseline coverage:

- add tablet-width responsive checks after breakpoints stabilize
- add deeper modal/form Axe scans for Add Property, Add Tenant, work order drawer, role management, and document review flows
- add AI unavailable/fallback-copy tests once those fallback states are standardized across AI surfaces
- decide whether `test:e2e:extended` should run nightly or manually in CI, based on runtime and stability
- add more targeted browser failure simulations for documents, finance snapshots, storage upload errors, and expired invite acceptance

## Local full flow

To mirror the working `APStaffCommandCenter` local browser flow, OASIS also includes:

```bash
npm run test:e2e:local
```

That command will:

1. start local Supabase
2. run `db:bootstrap`
3. run `db:verify`
4. seed the integration harness
5. run Playwright
6. stop local Supabase

To run the same local stack bootstrap with only the critical pack:

```bash
npm run test:e2e:local:critical
```

## Marketing / social screenshots

To generate the LinkedIn-ready product shots for the AI-led operator surfaces, run:

```bash
npm run marketing:screenshots:linkedin
```

That flow captures reusable screenshots into:

- [marketing-site/public/screenshots/linkedin](/mnt/c/Users/Home/oasisrentalmanagementapp/marketing-site/public/screenshots/linkedin)

The dedicated social set currently covers:

- Command Center operator briefing
- Portfolio Health explainer
- Maintenance Inbox triage guidance

## Accessibility checks

The core browser journeys use `@axe-core/playwright` through [helpers/accessibility.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/helpers/accessibility.js).

The helper currently blocks `critical` and `serious` WCAG 2.0/2.1 A/AA violations on:

- sign-in shell
- self-serve signup shell
- owner property details
- tenant-scoped property details
- root invitations admin

If a new Axe failure appears, prefer fixing the markup or accessible name first. Only exclude a selector when the issue belongs to an unavoidable third-party widget or a deliberately documented false positive.

## Environment

- `PLAYWRIGHT_PORT`
  - overrides the Vite port used by Playwright
- `PLAYWRIGHT_BASE_URL`
  - overrides the app URL if you want to target an already-running environment

## Suggested next tests

- expand responsive checks to tablet width after layout breakpoints stabilize
- add degraded-path coverage for unavailable AI insight fallback copy once that UI copy is formalized
- add CI scheduling for the extended lane if runtime remains acceptable
