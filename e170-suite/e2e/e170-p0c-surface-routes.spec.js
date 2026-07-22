/**
 * E-170 P0-C E2E spec — surface-route browser evidence.
 *
 * Proves the following PO-authorised browser coverage requirements:
 *   R1  PropertyDetails  — financials tab unknown-state testid visible; no monetary balance
 *   R2  PropertyPerformanceCard — unknown-state testids present; "Rent collection risk" absent
 *   R3  TenantHomePage   — outstanding card + unavailable copy; no monetary balance
 *   R3  TenantPayments   — outstanding card + unavailable copy; no monetary balance;
 *                         Tenant A payment (950) visible; Tenant B marker (750) absent
 *
 * Uses the standard isolation harness fixtures (ownerA + tenantA1).
 * Seeds one overdue payment of £950 for tenantA1's property so that
 * Tenant A's transaction is visible in the TenantPayments history.
 *
 * Evidence tag: EXECUTED_E2E_BROWSER once passing.
 */

import { test, expect } from "@playwright/test";

import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import {
  getIntegrationAdminClient,
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "../../tests/integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../../tests/integration/helpers/env.js";
import { signInAs, seededUsers, prepareEnglishLocale } from "../../tests/e2e/helpers/auth.js";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

// Fixture references
const PROPERTY_A_ID    = isolationFixtures.users.tenantA1.propertyId;  // 44444444-...-4441
const TENANT_A1_EMAIL  = isolationFixtures.users.tenantA1.email;
const TENANT_A1_ID     = isolationFixtures.users.tenantA1.tenantId;    // 33333333-...-3331
const ACCOUNT_A_ID     = isolationFixtures.accounts.accountA.id;

// Distinctive amounts: Tenant A's payment (950) must appear; Tenant B's marker (750) must be absent.
const TENANT_A_PAYMENT_AMOUNT = 950;
const TENANT_B_ABSENT_MARKER  = 750;
const P0C_PAYMENT_ID = "e1700005-0000-4000-8000-000000000001";

test.describe("E-170 P0-C — P0-C surface-route browser evidence", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  let admin;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    await ensureIsolationHarnessSeed(admin);

    // Resolve ownerA's real auth UUID (same pattern as phantom accrual spec)
    const { user: ownerAUser } = await signInAsFixtureUser("ownerA");
    const ownerUserId = ownerAUser.id;

    // Seed a distinctive overdue payment for tenantA1 so TenantPayments shows history.
    // Idempotent: upsert so re-runs are safe.
    const { error } = await admin.from("payments").upsert(
      {
        id:          P0C_PAYMENT_ID,
        owner_id:    ownerUserId,
        account_id:  ACCOUNT_A_ID,
        property_id: PROPERTY_A_ID,
        tenant_id:   TENANT_A1_ID,
        amount:      TENANT_A_PAYMENT_AMOUNT,
        status:      "overdue",
        due_date:    "2026-03-01",
        paid_at:     null,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`P0-C payment seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (!admin) return;
    try {
      await admin.from("payments").delete().eq("id", P0C_PAYMENT_ID);
    } catch (_) {}
  });

  // ── R1: PropertyDetails financials tab ──────────────────────────────────────

  test.describe("R1 — PropertyDetails financials tab", () => {
    test.beforeEach(async ({ page }) => {
      await prepareEnglishLocale(page);
      await signInAs(page, seededUsers.ownerA);
    });

    test("R1-E2E-01: financials-balance-unavailable testid visible; no monetary amount in tile", async ({ page }) => {
      await page.goto(`/properties/${PROPERTY_A_ID}?tab=financials`);
      const unavailable = page.getByTestId("financials-balance-unavailable");
      await expect(unavailable).toBeVisible({ timeout: 20_000 });
      // The tile shows unavailable copy, not a monetary figure
      const tileText = await unavailable.textContent();
      expect(tileText).toMatch(/unavailable|not imported|balance/i);
      // No currency symbol in the unavailable paragraph itself
      expect(tileText).not.toMatch(/£\d/);
    });

    test("R1-E2E-02: financials tab renders without runtime errors", async ({ page }) => {
      await page.goto(`/properties/${PROPERTY_A_ID}?tab=financials`);
      await page.waitForSelector("[data-testid='financials-balance-unavailable']", { timeout: 20_000 });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toContain("undefined");
      expect(bodyText).not.toContain("[object Object]");
    });
  });

  // ── R2: PropertyPerformanceCard ─────────────────────────────────────────────

  test.describe("R2 — PropertyPerformanceCard unknown state", () => {
    test.beforeEach(async ({ page }) => {
      await prepareEnglishLocale(page);
      await signInAs(page, seededUsers.ownerA);
    });

    test("R2-E2E-01: perf-overdue-unavailable testid visible on property details page", async ({ page }) => {
      await page.goto(`/properties/${PROPERTY_A_ID}`);
      const overdueUnavailable = page.getByTestId("perf-overdue-unavailable");
      await expect(overdueUnavailable).toBeVisible({ timeout: 20_000 });
    });

    test("R2-E2E-02: perf-outstanding-unavailable testid visible", async ({ page }) => {
      await page.goto(`/properties/${PROPERTY_A_ID}`);
      const outstandingUnavailable = page.getByTestId("perf-outstanding-unavailable");
      await expect(outstandingUnavailable).toBeVisible({ timeout: 20_000 });
    });

    test("R2-E2E-03: Rent collection risk flag absent in unknown state", async ({ page }) => {
      await page.goto(`/properties/${PROPERTY_A_ID}`);
      // Wait for the performance card to render
      await page.getByTestId("perf-overdue-unavailable").waitFor({ timeout: 20_000 });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toContain("Rent collection risk");
    });
  });

  // ── R3: TenantHomePage ──────────────────────────────────────────────────────

  test.describe("R3 — TenantHomePage outstanding card", () => {
    test.beforeEach(async ({ page }) => {
      await prepareEnglishLocale(page);
      await signInAs(page, TENANT_A1_EMAIL);
    });

    test("R3-HOME-01: tenant-home-outstanding-card present with unavailable copy", async ({ page }) => {
      await page.goto("/tenant/home");
      const card = page.getByTestId("tenant-home-outstanding-card");
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Balance unavailable");
      await expect(card).toContainText("A tenancy-specific balance has not been established.");
    });

    test("R3-HOME-02: tenant-home-balance-unavailable testid present", async ({ page }) => {
      await page.goto("/tenant/home");
      const unavailable = page.getByTestId("tenant-home-balance-unavailable");
      await expect(unavailable).toBeVisible({ timeout: 20_000 });
    });

    test("R3-HOME-03: no monetary balance amount inside outstanding card", async ({ page }) => {
      await page.goto("/tenant/home");
      const card = page.getByTestId("tenant-home-outstanding-card");
      await expect(card).toBeVisible({ timeout: 20_000 });
      const cardText = await card.textContent();
      // Card must not show a currency figure (£ followed by digits)
      expect(cardText).not.toMatch(/£\d/);
    });
  });

  // ── R3: TenantPayments ──────────────────────────────────────────────────────

  test.describe("R3 — TenantPayments outstanding card + history isolation", () => {
    test.beforeEach(async ({ page }) => {
      await prepareEnglishLocale(page);
      await signInAs(page, TENANT_A1_EMAIL);
    });

    test("R3-PAY-01: tenant-payments-outstanding-card present with unavailable copy", async ({ page }) => {
      await page.goto("/tenant/payments");
      const card = page.getByTestId("tenant-payments-outstanding-card");
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Balance unavailable");
      await expect(card).toContainText("A tenancy-specific balance has not been established.");
    });

    test("R3-PAY-02: tenant-payments-balance-unavailable testid present inside outstanding card", async ({ page }) => {
      await page.goto("/tenant/payments");
      const unavailable = page.getByTestId("tenant-payments-balance-unavailable");
      await expect(unavailable).toBeVisible({ timeout: 20_000 });
    });

    test("R3-PAY-03: no monetary balance inside outstanding card (no attributed branch)", async ({ page }) => {
      await page.goto("/tenant/payments");
      const card = page.getByTestId("tenant-payments-outstanding-card");
      await expect(card).toBeVisible({ timeout: 20_000 });
      const cardText = await card.textContent();
      expect(cardText).not.toMatch(/£\d/);
    });

    test("R3-PAY-04: Tenant A own payment (950) visible in payment history", async ({ page }) => {
      await page.goto("/tenant/payments");
      // Wait for card to confirm page loaded
      await page.getByTestId("tenant-payments-outstanding-card").waitFor({ timeout: 20_000 });
      const bodyText = await page.locator("body").textContent();
      // 950 must appear somewhere in payment history
      expect(bodyText).toContain(String(TENANT_A_PAYMENT_AMOUNT));
    });

    test("R3-PAY-05: Tenant B marker amount (750) absent from Tenant A view", async ({ page }) => {
      await page.goto("/tenant/payments");
      await page.getByTestId("tenant-payments-outstanding-card").waitFor({ timeout: 20_000 });
      const bodyText = await page.locator("body").textContent();
      // 750 is the Tenant B marker — must not appear in tenantA1's session
      expect(bodyText).not.toContain(String(TENANT_B_ABSENT_MARKER));
    });
  });
});
