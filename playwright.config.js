import { defineConfig, devices } from "@playwright/test";
import { getIntegrationEnv } from "./tests/integration/helpers/env.js";

const port = process.env.PLAYWRIGHT_PORT || "4173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const integrationEnv = getIntegrationEnv();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: `node scripts/with-local-node.mjs vite --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: integrationEnv.url,
      VITE_SUPABASE_ANON_KEY: integrationEnv.anonKey,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
