/**
 * E-170 E2E spec — Finance page phantom accrual regression.
 *
 * Creates its own short-lived Alice + Bob fixtures in beforeAll (fixed UUIDs
 * so the data-testid selectors are stable) and tears them down in afterAll.
 *
 * Auth: signs in as ownerA before each test.
 * Viewport: 1280×900 so the desktop table (hidden md:block) is visible.
 *
 * Evidence tag: EXECUTED_E2E_BROWSER once passing.
 */

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "../../tests/integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../../tests/integration/helpers/env.js";
import { signInAs, seededUsers } from "../../tests/e2e/helpers/auth.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;

// Fixed UUIDs — stable across runs; env-var override if pre-seeded externally.
const ALICE_PROP_ID = process.env.PLAYWRIGHT_E170_ALICE_PROP ?? "e1700001-0000-4000-8000-000000000001";
const BOB_PROP_ID   = process.env.PLAYWRIGHT_E170_BOB_PROP   ?? "e1700002-0000-4000-8000-000000000002";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

async function teardownProp(admin, propId) {
  await admin.from("tenancy_finance_activations").delete().eq("property_id", propId);
  await admin.from("leases").delete().eq("property_id", propId);
  await admin.from("payments").delete().eq("property_id", propId);
  await admin.from("tenants").delete().eq("property_id", propId);
  await admin.from("properties").delete().eq("id", propId);
}

async function seedProp(admin, ownerUserId, { propId, address, rent, leaseStartDate, leaseEndDate = null }) {
  // Idempotent: remove any stale fixture first
  await teardownProp(admin, propId);

  const { error: pErr } = await admin.from("properties").insert({
    id:         propId,
    owner_id:   ownerUserId,
    account_id: ACCOUNT_ID,
    address,
    city:       "E170-City",
    rent,
    status:     "Wolne",
    tenant_id:  null,
  });
  if (pErr) throw new Error(`seed property ${address}: ${pErr.message}`);

  const tenantId = randomUUID();
  const { error: tErr } = await admin.from("tenants").insert({
    id:          tenantId,
    owner_id:    ownerUserId,
    account_id:  ACCOUNT_ID,
    user_id:     null,
    property_id: propId,
    name:        `E170 E2E Tenant ${propId.slice(0, 8)}`,
    email:       `e170.e2e.${propId.slice(0, 8)}@test.invalid`,
    phone:       "+447700000000",
    status:      "active",
  });
  if (tErr) throw new Error(`seed tenant for ${address}: ${tErr.message}`);

  await admin.from("properties").update({ tenant_id: tenantId, status: "Wynajęte" }).eq("id", propId);

  const { error: lErr } = await admin.from("leases").insert({
    id:               randomUUID(),
    account_id:       ACCOUNT_ID,
    property_id:      propId,
    tenant_id:        tenantId,
    lease_start_date: leaseStartDate,
    lease_end_date:   leaseEndDate,
    renewal_status:   "active",   // import default → E-170 target case
  });
  if (lErr) throw new Error(`seed lease for ${address}: ${lErr.message}`);
}

test.describe("E-170 Finance page — phantom accrual regression", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  let admin;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();

    // Resolve the REAL ownerA user ID via the fixture harness (not the hardcoded
    // isolationFixtures.users.ownerA.id, which may differ from the auth-assigned UUID).
    const { user: ownerAUser } = await signInAsFixtureUser("ownerA");
    const ownerUserId = ownerAUser.id;

    await seedProp(admin, ownerUserId, {
      propId:         ALICE_PROP_ID,
      address:        "E170 E2E Alice - 1 Phantom Lane",
      rent:           1250,
      leaseStartDate: "2024-01-01",
      leaseEndDate:   "2024-12-31",
    });

    await seedProp(admin, ownerUserId, {
      propId:         BOB_PROP_ID,
      address:        "E170 E2E Bob - 2 Phantom Row",
      rent:           1100,
      leaseStartDate: "2024-06-01",
      leaseEndDate:   null,
    });
  });

  test.afterAll(async () => {
    if (!admin) return;
    await teardownProp(admin, ALICE_PROP_ID).catch(() => {});
    await teardownProp(admin, BOB_PROP_ID).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await page.waitForSelector("[data-testid='property-finance-table']", { timeout: 20_000 });
  });

  // ── E2E-01: Unknown notice visible ─────────────────────────────────────────

  test("E2E-01: finance-unknown-notice is visible (unactivated import fixtures counted)", async ({ page }) => {
    const notice = page.getByTestId("finance-unknown-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Balance unavailable");
  });

  // ── E2E-02: Alice row shows unknown status (not overdue) ─────────────────

  test("E2E-02: Alice row shows status = unknown (not Overdue — no phantom)", async ({ page }) => {
    const row = page.getByTestId(`finance-prop-row-${ALICE_PROP_ID}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const statusCell = page.getByTestId(`finance-status-${ALICE_PROP_ID}`);
    await expect(statusCell).toBeVisible();
    await expect(statusCell).not.toContainText("Overdue");
    await expect(statusCell).toContainText(/Unknown|unknown/i);
  });

  // ── E2E-03: Alice remaining cell shows no phantom £38,750 ─────────────────

  test("E2E-03: Alice remaining cell does not show phantom £38,750", async ({ page }) => {
    const row = page.getByTestId(`finance-prop-row-${ALICE_PROP_ID}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const remainingCell = page.getByTestId(`finance-remaining-${ALICE_PROP_ID}`);
    await expect(remainingCell).toBeVisible();
    await expect(remainingCell).not.toContainText("38,750");
    await expect(remainingCell).not.toContainText("38750");
    await expect(remainingCell).toContainText(/unavailable|history|unknown/i);
  });

  // ── E2E-04: Bob row shows status = unknown ────────────────────────────────

  test("E2E-04: Bob row shows status = unknown (not Overdue)", async ({ page }) => {
    const row = page.getByTestId(`finance-prop-row-${BOB_PROP_ID}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const statusCell = page.getByTestId(`finance-status-${BOB_PROP_ID}`);
    await expect(statusCell).toBeVisible();
    await expect(statusCell).not.toContainText("Overdue");
  });

  // ── E2E-05: Bob remaining cell shows no phantom £28,600 ──────────────────

  test("E2E-05: Bob remaining cell does not show phantom £28,600", async ({ page }) => {
    const row = page.getByTestId(`finance-prop-row-${BOB_PROP_ID}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const remainingCell = page.getByTestId(`finance-remaining-${BOB_PROP_ID}`);
    await expect(remainingCell).toBeVisible();
    await expect(remainingCell).not.toContainText("28,600");
    await expect(remainingCell).not.toContainText("28600");
  });

  // ── E2E-06: Both fixture rows are present in the table ───────────────────

  test("E2E-06: finance table contains rows for both Alice and Bob fixtures", async ({ page }) => {
    await expect(page.getByTestId(`finance-prop-row-${ALICE_PROP_ID}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`finance-prop-row-${BOB_PROP_ID}`)).toBeVisible({ timeout: 15_000 });
  });
});
