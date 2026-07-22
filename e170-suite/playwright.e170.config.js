import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { getIntegrationEnv } from "../tests/integration/helpers/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "..");

const port       = process.env.PLAYWRIGHT_PORT || "4173";
const baseURL    = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const integrationEnv = getIntegrationEnv();

export default defineConfig({
  testDir: resolve(__dirname, "e2e"),
  globalSetup: resolve(REPO_ROOT, "tests/e2e/globalSetup.mjs"),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: resolve(REPO_ROOT, "playwright-report-e170") }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `node scripts/with-local-node.mjs vite --host 127.0.0.1 --port ${port}`,
    cwd: REPO_ROOT,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: integrationEnv.url,
      VITE_SUPABASE_ANON_KEY: integrationEnv.anonKey,
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
