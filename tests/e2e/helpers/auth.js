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

export async function openUserMenu(page) {
  await page.getByRole("button", { name: "Open user menu" }).click();
}

async function waitForAuthenticatedAppReady(page) {
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });

  // The root auth/account gate renders only "Loading…" while the session and
  // active account are hydrating. Under parallel Playwright load this can last
  // longer than the immediate post-login URL change, so do not use <main> as a
  // pre-hydration readiness signal.
  await expect(page.locator("body")).not.toHaveText(/^\s*Loading…\s*$/, {
    timeout: 30_000,
  });

  const appShellMain = page.getByTestId("app-shell-main");
  if (await appShellMain.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return;
  }

  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
}

export async function logout(page) {
  // TenantPortalLayout exposes a direct Logout button; AppLayout hides it in UserMenu
  if (page.url().includes("/tenant")) {
    const tenantLogout = page.getByRole("button", { name: "Logout" }).first();
    await tenantLogout.click({ timeout: 10_000 });
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    return;
  }

  const directLogoutButtons = page.getByRole("button", { name: "Logout" });
  const directCount = await directLogoutButtons.count().catch(() => 0);
  for (let index = 0; index < directCount; index += 1) {
    const button = directLogoutButtons.nth(index);
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click();
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      return;
    }
  }

  await openUserMenu(page);
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });
}

export async function signInAs(page, email) {
  await bypassRateLimit(page);
  await prepareEnglishLocale(page);
  await page.goto("/login");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  if (!(await emailInput.isVisible().catch(() => false))) {
    // Try direct logout (TenantPortalLayout) then UserMenu logout (AppLayout)
    const directLogout = page.getByRole("button", { name: "Logout" }).first();
    if (await directLogout.isVisible().catch(() => false)) {
      await directLogout.click();
      await page.goto("/login");
    } else {
      const userMenuBtn = page.getByRole("button", { name: "Open user menu" });
      if (await userMenuBtn.isVisible().catch(() => false)) {
        await userMenuBtn.click();
        const logoutBtn = page.getByRole("button", { name: "Logout" });
        if (await logoutBtn.isVisible().catch(() => false)) {
          await logoutBtn.click();
          await page.goto("/login");
        }
      }
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

  await waitForAuthenticatedAppReady(page);
}
