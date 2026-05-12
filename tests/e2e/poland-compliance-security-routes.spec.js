// tests/e2e/poland-compliance-security-routes.spec.js
//
// E2E coverage for everything touched in the Phase 1.5 + bug-fix sessions:
//   1. Poland Compliance Toolkit — card-based navigation, breadcrumbs, panel content
//   2. SecurityPostureBanner "Review users" link now routes to /settings/roles?highlight=security
//   3. RolesManagementPage password-highlight mode (?highlight=security)
//   4. PasswordUpgradeNotice link now routes to /settings/profile
//   5. Regression smoke-tests for all touched surfaces

import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;

// ── Helper: set account plan and restore in try/finally ───────────────────────

async function upgradeToPro(admin) {
  const { error } = await admin.from("accounts").update({
    subscription_plan: "pro",
    subscription_status: "active",
    billing_locked_at: null,
  }).eq("id", accountA.id);
  if (error) throw new Error(`upgradeToPro failed: ${error.message}`);
}

// Restores to the seeded baseline (pro) so other test suites aren't broken.
async function restoreProPlan(admin) {
  await admin.from("accounts").update({
    subscription_plan: "pro",
    subscription_status: "active",
    billing_locked_at: null,
  }).eq("id", accountA.id);
}

// ── Route mock helpers ────────────────────────────────────────────────────────

// Stubs list_account_password_security to return one weak + one strong user.
async function mockWeakPasswordSecurity(page) {
  await page.route("**/rpc/list_account_password_security", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
          email: "admin.a@oasis.test",
          password_strength_status: "legacy_weak",
          password_last_set_at: null,
        },
        {
          user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
          email: "owner.a@oasis.test",
          password_strength_status: "strong",
          password_last_set_at: "2026-01-01T00:00:00Z",
        },
      ]),
    });
  });
}

// Also mock list_account_members_for_role_assignment so the members list renders
// without waiting for real Supabase when testing highlight mode.
async function mockRoleMembers(page) {
  await page.route("**/rpc/list_account_members_for_role_assignment", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
          email: "admin.a@oasis.test",
          legacy_role: "admin",
          role_id: null,
          role_name: null,
        },
        {
          user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
          email: "owner.a@oasis.test",
          legacy_role: "owner",
          role_id: null,
          role_name: null,
        },
      ]),
    });
  });
}

// Stubs get_own_security_profile to simulate a user with a legacy_weak password.
async function mockWeakOwnProfile(page) {
  await page.route("**/rpc/get_own_security_profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          password_policy_version: 0,
          password_strength_status: "legacy_weak",
          password_last_set_at: null,
          mfa_required: false,
          mfa_enrolled: false,
        },
      ]),
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Poland Compliance Toolkit — navigation & content
//    serial: prevents beforeAll/afterAll plan-management race with fullyParallel
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.serial("Poland Compliance Toolkit — card navigation", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  let admin;
  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    await upgradeToPro(admin);
  });
  test.afterAll(async () => {
    if (admin) await restoreProPlan(admin);
  });

  test("page loads with correct title and no tab bar", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await expect(page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" })).toBeVisible({ timeout: 20_000 });

    // Overview grid: unlocked feature cards should be visible as clickable buttons
    await expect(page.locator("button").filter({ hasText: /Rental Protection/i }).first()).toBeVisible();

    // There should be NO tab buttons — navigation is card-based only
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(0);
  });

  test("clicking Rental Protection card opens section and shows breadcrumb", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    const rpCard = page.locator("button").filter({ hasText: /Rental Protection/i }).first();
    await expect(rpCard).toBeEnabled();
    await rpCard.click();

    // Breadcrumb button back to overview should appear
    await expect(page.getByRole("button", { name: /Poland Compliance Toolkit/i })).toBeVisible({ timeout: 10_000 });
  });

  test("breadcrumb click returns to overview card grid", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    const rpCard = page.locator("button").filter({ hasText: /Rental Protection/i }).first();
    await rpCard.click();

    await page.getByRole("button", { name: /Poland Compliance Toolkit/i }).click();

    // Overview grid should be visible again
    await expect(page.locator("button").filter({ hasText: /Rental Protection/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button").filter({ hasText: /STR Compliance/i }).first()).toBeVisible();
  });

  test("Rental Protection section shows Documents before Lease Auditor in card order", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    const rpCard = page.locator("button").filter({ hasText: /Rental Protection/i }).first();
    await rpCard.click();

    // Wait for section content to appear (Documents card link)
    await expect(page.getByRole("link", { name: /Documents/i }).first()).toBeVisible({ timeout: 15_000 });

    // Collect all section link texts in DOM order
    const links = page.locator("a[href]").filter({ hasText: /Documents|Lease Auditor|Evidence Pack|Najem/i });
    const texts = await links.allTextContents();

    const docIdx    = texts.findIndex((t) => /Documents/i.test(t));
    const leaseIdx  = texts.findIndex((t) => /Lease Auditor/i.test(t));

    expect(docIdx).toBeGreaterThanOrEqual(0);
    expect(leaseIdx).toBeGreaterThanOrEqual(0);
    // Documents must appear before Lease Auditor
    expect(docIdx).toBeLessThan(leaseIdx);
  });

  test("Lease Auditor link in Rental Protection goes to /compliance/leases, not /dashboard", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    const rpCard = page.locator("button").filter({ hasText: /Rental Protection/i }).first();
    await rpCard.click();

    const leaseLink = page.getByRole("link", { name: /Open Lease Auditor|Go to Lease/i });
    await expect(leaseLink).toBeVisible({ timeout: 15_000 });

    const href = await leaseLink.getAttribute("href");
    expect(href).toMatch(/\/compliance\/leases/);
    expect(href).not.toMatch(/\/dashboard/);
  });

  test("Partners section shows Add partner contact button", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    // Partners card is the last one — find by text
    const partnersCard = page.locator("button").filter({ hasText: /Partner/i }).first();
    await expect(partnersCard).toBeEnabled();
    await partnersCard.click();

    await expect(
      page.getByRole("button", { name: /Add partner|Add partner contact/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Partners section shows add form when Add partner button is clicked", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" }).waitFor({ timeout: 20_000 });

    const partnersCard = page.locator("button").filter({ hasText: /Partner/i }).first();
    await partnersCard.click();

    await page.getByRole("button", { name: /Add partner|Add partner contact/i }).first().click();

    // Form fields should be visible
    await expect(page.getByText(/Name \*/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Area \*/i).first()).toBeVisible();

    // Cancel hides the form
    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByText(/Name \*/i).first()).toBeHidden({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SecurityPostureBanner — "Review users" links to correct route
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("SecurityPostureBanner — Review users route", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Review users link has href /settings/roles?highlight=security", async ({ page }) => {
    await mockWeakPasswordSecurity(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // Banner appears when weak users exist (mocked)
    const banner = page.locator("[class*='amber']").filter({ hasText: "Password security" }).first();
    await expect(banner).toBeVisible({ timeout: 20_000 });

    const reviewLink = page.getByRole("link", { name: /Review users/i });
    await expect(reviewLink).toBeVisible({ timeout: 10_000 });

    const href = await reviewLink.getAttribute("href");
    expect(href).toContain("/settings/roles");
    expect(href).toContain("highlight=security");
  });

  test("clicking Review users navigates to /settings/roles with highlight param", async ({ page }) => {
    await mockWeakPasswordSecurity(page);
    await mockRoleMembers(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    const banner = page.locator("[class*='amber']").filter({ hasText: "Password security" }).first();
    await expect(banner).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: /Review users/i }).click();

    // Should land on the roles page with the highlight param
    await expect(page).toHaveURL(/\/settings\/roles/, { timeout: 20_000 });
    await expect(page).toHaveURL(/highlight=security/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RolesManagementPage — ?highlight=security mode
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("RolesManagementPage — password highlight mode", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("roles page loads normally at /settings/roles without highlight note", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/roles");

    // h1 specifically to avoid matching h2s "Custom roles" / "Assign roles"
    await expect(page.locator("h1").filter({ hasText: "Roles" })).toBeVisible({ timeout: 20_000 });
    // No highlight note should appear without the query param
    await expect(page.getByText(/Users flagged below|passwords that do not meet/i)).toHaveCount(0);
  });

  test("roles page with ?highlight=security shows the highlight note", async ({ page }) => {
    await mockWeakPasswordSecurity(page);
    await mockRoleMembers(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/roles?highlight=security");

    await expect(page.locator("h1").filter({ hasText: "Roles" })).toBeVisible({ timeout: 20_000 });

    // The amber highlight note should appear
    await expect(page.getByText(/Users flagged below|passwords that do not meet/i)).toBeVisible({ timeout: 15_000 });
  });

  test("weak-password user has amber badge in highlight mode", async ({ page }) => {
    await mockWeakPasswordSecurity(page);
    await mockRoleMembers(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/roles?highlight=security");

    await expect(page.locator("h1").filter({ hasText: "Roles" })).toBeVisible({ timeout: 20_000 });

    // admin.a is the weak user — should see a "Legacy password" badge
    await expect.poll(async () => {
      const count = await page.getByText(/Legacy password/i).count();
      return count > 0 ? "found" : "waiting";
    }, { timeout: 20_000 }).toBe("found");

    // Badge should be near the admin user's email
    const adminRow = page.locator("div").filter({ hasText: "admin.a@oasis.test" }).first();
    await expect(adminRow.getByText(/Legacy password/i)).toBeVisible({ timeout: 10_000 });
  });

  test("only weak-password users have a badge — strong users do not", async ({ page }) => {
    await mockWeakPasswordSecurity(page);
    await mockRoleMembers(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/roles?highlight=security");

    await expect(page.locator("h1").filter({ hasText: "Roles" })).toBeVisible({ timeout: 20_000 });
    // Wait for both member rows to appear
    await expect(page.getByText("admin.a@oasis.test")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("owner.a@oasis.test")).toBeVisible({ timeout: 10_000 });

    // Exactly one badge should appear (admin.a = legacy_weak, owner.a = strong → no badge)
    await expect(page.getByText(/Legacy password|Reset required|Unknown/i)).toHaveCount(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PasswordUpgradeNotice — link goes to /settings/profile
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("PasswordUpgradeNotice — correct profile link", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("password upgrade notice link goes to /settings/profile", async ({ page }) => {
    // Clear dismiss key so the notice renders
    await page.addInitScript(() => {
      window.localStorage.removeItem("oasis_pw_upgrade_dismissed_until");
    });
    await mockWeakOwnProfile(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await expect(page.getByText(/Your password needs updating/i)).toBeVisible({ timeout: 20_000 });

    const updateLink = page.getByRole("link", { name: /Update password/i });
    await expect(updateLink).toBeVisible({ timeout: 10_000 });

    const href = await updateLink.getAttribute("href");
    expect(href).toContain("/settings/profile");
    expect(href).not.toMatch(/^\/profile(?!\w)/);
    expect(href).not.toContain("/dashboard");
  });

  test("update password link navigates to /settings/profile, not dashboard", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("oasis_pw_upgrade_dismissed_until");
    });
    await mockWeakOwnProfile(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await page.getByText(/Your password needs updating/i).waitFor({ timeout: 20_000 });
    await page.getByRole("link", { name: /Update password/i }).click();

    await expect(page).toHaveURL(/\/settings\/profile/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("dismissing the notice hides it for the session", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("oasis_pw_upgrade_dismissed_until");
    });
    await mockWeakOwnProfile(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    const notice = page.getByText(/Your password needs updating/i);
    await expect(notice).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Remind me later/i }).click();
    await expect(notice).toBeHidden({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Regression smoke tests for all touched surfaces
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Regression — touched surfaces still load correctly", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("app shell loads and shows sign-in page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
  });

  test("dashboard loads for authenticated owner", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Operations Hub" })).toBeVisible({ timeout: 20_000 });
  });

  test("/settings/roles loads correctly without highlight param", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/roles");
    await expect(page.locator("h1").filter({ hasText: "Roles" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Assign roles" })).toBeVisible({ timeout: 15_000 });
  });

  test("/settings/profile page loads for authenticated owner", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/profile");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("/compliance/poland-advanced loads without error for starter account", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland-advanced");

    await expect(page.locator("h1").filter({ hasText: "Poland Compliance Toolkit" })).toBeVisible({ timeout: 20_000 });
    // Should show upgrade gate or overview — no error state
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test("/compliance/leases (Lease Auditor) is a valid route that does not redirect to dashboard", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/leases");
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
  });

  test("/documents route still loads", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/documents");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Add document/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
