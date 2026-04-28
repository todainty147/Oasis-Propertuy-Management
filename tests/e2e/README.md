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
- owner property creation and downstream Finance visibility
- role navigation and direct-route restrictions
- tenant-scoped navigation
- root invitations surface
- self-serve signup

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

- dashboard accessibility scan after key cards settle
- finance accessibility scan
- contractor portal accessibility scan
- security/root telemetry accessibility scan
