import { expect, test } from "@playwright/test";

import { prepareEnglishLocale, seededUsers, signInAs } from "./helpers/auth.js";

test("invalid invitation links fail clearly without creating an account context", async ({ page }) => {
  await prepareEnglishLocale(page);

  await page.goto("/invite");

  await expect(page.getByRole("heading", { name: "You’ve been invited" })).toBeVisible();
  await expect(page.getByText("Invalid or missing invitation token.")).toBeVisible();
});

test("stale property search parameters show a clear empty state", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/properties?q=no-such-property-release-e2e&status=stale&sort=unknown");

  await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.getByText("No properties match your search.")).toBeVisible();
});

test("new landlord accounts show the empty property state before first data entry", async ({ page }) => {
  const stamp = Date.now();

  await prepareEnglishLocale(page);
  await page.goto("/signup");

  await page.getByPlaceholder("Account name (e.g. ACME Rentals)").fill(`Empty State Rentals ${stamp}`);
  await page.getByPlaceholder("Email").fill(`empty.state.${stamp}@oasis.test`);
  await page.getByPlaceholder("Password").fill("OasisTest123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/properties");

  await expect(page.getByText("No properties")).toBeVisible();
  await expect(page.getByText("Add your first property")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add property" })).toBeVisible();
});

test("subscription-gated operator surfaces show an upgrade card instead of noisy RPC errors", async ({ page }) => {
  const stamp = Date.now();

  await prepareEnglishLocale(page);
  await page.goto("/signup");

  await page.getByPlaceholder("Account name (e.g. ACME Rentals)").fill(`Starter Gate Rentals ${stamp}`);
  await page.getByPlaceholder("Email").fill(`starter.gate.${stamp}@oasis.test`);
  await page.getByPlaceholder("Password").fill("OasisTest123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/portfolio-health");

  await expect(page.getByText("Plan upgrade")).toBeVisible();
  await expect(page.getByText("Portfolio Health is outside your current plan")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open billing/i })).toBeVisible();
});

test("command center RPC failures render a visible degraded-path banner", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.route("**/rest/v1/rpc/command_center_items", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PGRST_TEST",
        message: "Synthetic command center failure",
      }),
    });
  });

  await page.goto("/command-center");

  await expect(page.locator("main")).toContainText("Synthetic command center failure");
});
