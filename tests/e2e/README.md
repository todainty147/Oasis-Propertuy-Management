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

## Environment

- `PLAYWRIGHT_PORT`
  - overrides the Vite port used by Playwright
- `PLAYWRIGHT_BASE_URL`
  - overrides the app URL if you want to target an already-running environment

## Suggested next tests

- authenticated owner dashboard smoke
- property details happy path
- invitation flow smoke
- maintenance inbox smoke
