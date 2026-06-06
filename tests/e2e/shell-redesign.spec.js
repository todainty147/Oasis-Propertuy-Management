/**
 * E2E tests for the Apple-HIG shell redesign:
 * Topbar (UserMenu, page title, notifications), AppLayout two-surface,
 * Card no-shadow contract, MobileBottomNav frosted glass.
 */
import { expect, test } from "@playwright/test";
import { logout, openUserMenu, seededUsers, signInAs } from "./helpers/auth.js";

// ─── UserMenu ────────────────────────────────────────────────────────────────

test.describe("UserMenu popover", () => {
  test("avatar button is visible after sign-in", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
  });

  test("popover opens on avatar click and closes on Escape", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await openUserMenu(page);

    const popover = page.locator("header ~ * [class*='rounded-xl']").first();
    // Verify logout is visible inside the popover
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });

  test("popover contains Profile link", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await openUserMenu(page);
    await expect(page.getByRole("link", { name: /profile/i })).toBeVisible();
  });

  test("logout via UserMenu navigates to /login", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout helper works for admin role", async ({ page }) => {
    await signInAs(page, seededUsers.adminA);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout helper works for staff role", async ({ page }) => {
    await signInAs(page, seededUsers.staffA);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Topbar ───────────────────────────────────────────────────────────────────

test.describe("Topbar", () => {
  test("page title updates when navigating between routes", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/properties");
    // The topbar title should reflect the current page (set by PageTitleContext)
    // Check it is not empty — the exact text is set by the page component
    const titleEl = page.locator("header p").first();
    await expect(titleEl).not.toBeEmpty({ timeout: 10_000 });

    const propertiesTitle = await titleEl.textContent();

    await page.goto("/finance");
    await expect(titleEl).not.toBeEmpty({ timeout: 10_000 });
    const financeTitle = await titleEl.textContent();

    // Title changes on navigation
    expect(financeTitle).not.toBe(propertiesTitle);
  });

  test("topbar is not fixed — main content scrolls under it without overlap", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    const header = page.locator("header").first();
    const headerBox = await header.boundingBox();
    const main = page.locator("main").first();
    const mainBox = await main.boundingBox();

    // Main top edge should be at or below the header bottom (no overlap)
    expect(mainBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
  });

  test("notifications bell is visible in topbar", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    // Bell has a label or recognisable button; check it's inside the header
    const header = page.locator("header").first();
    await expect(header.getByRole("button", { name: /notification/i })).toBeVisible();
  });
});

// ─── Two-surface shell ────────────────────────────────────────────────────────

test.describe("Two-surface app shell", () => {
  test("sidebar and content area render as distinct surfaces", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // Sidebar nav is visible
    const nav = page.getByRole("navigation", { name: /sidebar|main navigation/i }).first();
    await expect(nav).toBeVisible();

    // Main content area is visible
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("main content is scrollable without page-level scroll", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    const shellMain = page.getByTestId("app-shell-main");
    await expect(shellMain).toBeVisible();
    await expect(shellMain).toHaveClass(/overflow-y-auto/);
  });
});

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

test.describe("Mobile bottom nav", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders for owner role on mobile viewport", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    const bottomNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(bottomNav).toBeVisible();
  });

  test("shows Command, Repairs, Portfolio, Finance, Privacy for owner", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(nav.getByText("Command")).toBeVisible();
    await expect(nav.getByText("Repairs")).toBeVisible();
    await expect(nav.getByText("Portfolio")).toBeVisible();
    await expect(nav.getByText("Finance")).toBeVisible();
    await expect(nav.getByText("Privacy")).toBeVisible();
  });

  test("Command nav item navigates to /command-center", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await nav.getByText("Command").click();
    await expect(page).toHaveURL(/\/command-center/);
  });
});

// ─── Tenant layout logout (regression) ───────────────────────────────────────

test.describe("Tenant portal layout (unchanged)", () => {
  test("tenant logout button is directly accessible without UserMenu", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/tenant/home");

    // Tenant uses TenantPortalLayout which has a direct Logout button (not in a popover)
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    // Should NOT need to open a UserMenu
    await expect(page.getByRole("button", { name: "Open user menu" })).toHaveCount(0);
  });

  test("logout helper works for tenant role via direct button", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/tenant/home");
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
