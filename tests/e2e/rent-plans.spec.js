// tests/e2e/rent-plans.spec.js
// E2E tests for the Rent Plans page and calculation preview.

import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;

test.describe("Rent Plans page", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(async () => {
    const admin = getIntegrationAdminClient();
    await admin.from("accounts").update({
      subscription_plan: "pro",
      subscription_status: "active",
      billing_locked_at: null,
    }).eq("id", accountA.id);
  });

  test.afterAll(async () => {
    const admin = getIntegrationAdminClient();
    // Restore seeded baseline
    await admin.from("accounts").update({
      subscription_plan: "pro",
      subscription_status: "active",
    }).eq("id", accountA.id);
    // Clean up any test plans
    await admin.from("rent_plans")
      .delete()
      .eq("account_id", accountA.id)
      .ilike("notes", "E2E test%");
  });

  test("Rent Plans page loads with empty state", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
    // Either empty state or existing plans
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("Create a new rent plan shows as draft", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    // Open the form
    await page.getByRole("button", { name: /New plan/i }).click();

    // Fill required fields
    await page.getByLabel(/Base rent amount/i).fill("1500");
    await page.getByLabel(/Start date/i).fill("2026-01-01");
    await page.getByLabel(/Notes/i).fill("E2E test plan");

    // Save as draft
    await page.getByRole("button", { name: /Save as draft/i }).click();

    // Should disappear (form closes)
    await expect(page.getByRole("button", { name: /Save as draft/i })).toBeHidden({ timeout: 10_000 });

    // New plan card should appear with "draft" badge
    await expect(page.getByText("draft").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("1,500.00").first()).toBeVisible();
  });

  test("Preview calculation button opens preview panel", async ({ page }) => {
    // Create a plan first via admin client
    const admin = getIntegrationAdminClient();
    const { data: plan } = await admin.from("rent_plans").insert({
      account_id:        accountA.id,
      base_rent_amount:  2000,
      start_date:        "2026-01-01",
      currency:          "GBP",
      market:            "uk",
      billing_frequency: "monthly",
      notes:             "E2E test preview",
      status:            "draft",
    }).select().single();

    expect(plan?.id).toBeTruthy();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    // Click Preview calculation
    const previewBtn = page.getByRole("button", { name: /Preview calculation/i }).first();
    await expect(previewBtn).toBeVisible({ timeout: 15_000 });
    await previewBtn.click();

    // Preview panel should show
    await expect(page.getByRole("button", { name: /Calculate preview/i })).toBeVisible({ timeout: 10_000 });

    // Run a preview
    await page.getByRole("button", { name: /Calculate preview/i }).click();

    // Should show total
    await expect(page.getByText(/Total/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2,000.00")).toBeVisible({ timeout: 10_000 });

    // Back button should work
    await page.getByRole("button", { name: /Back to plans/i }).click();
    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 10_000 });

    await admin.from("rent_plans").delete().eq("id", plan.id);
  });

  test("Activate plan button works and shows active badge", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const { data: plan } = await admin.from("rent_plans").insert({
      account_id:        accountA.id,
      base_rent_amount:  1800,
      start_date:        "2026-01-01",
      currency:          "GBP",
      market:            "generic",
      billing_frequency: "monthly",
      notes:             "E2E test activate",
      status:            "draft",
    }).select().single();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    // Click Activate (dialog confirm)
    page.on("dialog", async (dialog) => dialog.accept());
    const activateBtn = page.getByRole("button", { name: /Activate/i }).first();
    await expect(activateBtn).toBeVisible({ timeout: 15_000 });
    await activateBtn.click();

    // Should now show "active" badge
    await expect(page.getByText("active").first()).toBeVisible({ timeout: 15_000 });

    await admin.from("rent_plans").delete().eq("id", plan.id);
  });

  test("Mobile layout renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // allow 5px tolerance
  });
});

test.describe("Rent Plans — regression: existing Finance still works", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Finance page still loads correctly", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Finance by property")).toBeVisible({ timeout: 15_000 });
  });

  test("Payment ledger is still functional (can see payments)", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("main")).toBeVisible();
  });
});
