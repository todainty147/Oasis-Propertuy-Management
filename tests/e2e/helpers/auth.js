/* global process */
import { expect } from "@playwright/test";
import { isolationFixtures } from "../../fixtures/isolationFixtures.js";

// Always allow the auth rate-limit RPC so test fixture users are never blocked
// by accumulated events from previous runs. Specific rate-limit tests override
// this in their own page.route() call (last-registered route wins in Playwright).
async function bypassRateLimit(page) {
  await page.route("**/rpc/record_auth_rate_limit_attempt", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true, attempt_count: 1, max_attempts: 5,
        window_seconds: 900, retry_after_seconds: 0,
      }),
    });
  });
}

const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "OasisTest123!";

export const seededUsers = {
  ownerA: isolationFixtures.users.ownerA.email,
  adminA: isolationFixtures.users.adminA.email,
  staffA: isolationFixtures.users.staffA.email,
  rootOwner: isolationFixtures.users.rootOwner.email,
  tenantA1: isolationFixtures.users.tenantA1.email,
  contractorA1: isolationFixtures.users.contractorA1.email,
};

export const seededEntityIds = {
  propertyA: isolationFixtures.users.tenantA1.propertyId,
};

export async function prepareEnglishLocale(page) {
  await bypassRateLimit(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("oasis_lang", "en");
  });
}

export async function signInAs(page, email) {
  await bypassRateLimit(page);
  await prepareEnglishLocale(page);
  await page.goto("/login");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  if (!(await emailInput.isVisible().catch(() => false))) {
    const logoutButton = page.getByRole("button", { name: "Logout" });
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
      await page.goto("/login");
    }
  }

  if (!(await emailInput.isVisible().catch(() => false))) {
    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await prepareEnglishLocale(page);
    await page.goto("/login");
  }

  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await passwordInput.fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("main")).toBeVisible();
}
