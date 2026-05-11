// tests/e2e/auth-hardening-v2.spec.js
//
// End-to-end verification of Authentication Hardening v1 — database layer:
//   • Rate limiting: login, signup, and password-reset request flows
//   • Stage 4 hard enforcement: reset_required redirect in App.jsx
//   • Stage 2 admin banner: SecurityPostureBanner on Dashboard
//   • Stage 3 soft enforcement: PasswordUpgradeNotice in layout shell
//
// Rate-limit tests mock the Supabase RPC response via page.route() so they
// don't touch real quota state in the local database.
// Stage 4 / Stage 2 / Stage 3 tests manipulate user_security_profile directly
// via the admin client and restore state in afterEach.

import { expect, test } from "@playwright/test";

// DB-dependent tests (Stage 2/3/4) all touch the same user_security_profile rows.
// Running the whole file serially prevents parallel state conflicts.
test.describe.configure({ mode: "serial" });

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { prepareEnglishLocale, seededUsers, signInAs } from "./helpers/auth.js";

const STRONG_PASSWORD = "Velvet#Bloom2026!";

// Account IDs match the fixture (seeded with fixed UUIDs)
const ACCOUNT_A = isolationFixtures.accounts.accountA.id;

// ---------------------------------------------------------------------------
// Global: mock rate limit as ALLOWED for every test by default.
// This prevents accumulated DB events from blocking fixture user logins.
// Rate-limit-specific tests override this with mockRateLimitDenied() which
// registers after beforeEach and wins (Playwright: last-registered route wins).
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.route(RATE_LIMIT_RPC, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true, surface: "auth_login",
        attempt_count: 1, max_attempts: 5,
        window_seconds: 900, retry_after_seconds: 0,
      }),
    });
  });
});

// Auth user IDs are assigned by Supabase at seed time — resolve at runtime
async function resolveUserId(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

// RPC URL pattern that matches both local Supabase and any port
const RATE_LIMIT_RPC   = "**/rpc/record_auth_rate_limit_attempt";
const OWN_PROFILE_RPC = "**/rpc/get_own_security_profile";

// ---------------------------------------------------------------------------
// Helper: mock the rate-limit RPC to return denied with a retry countdown
// ---------------------------------------------------------------------------

async function mockRateLimitDenied(page, { surface = "auth_login", retryAfterSeconds = 720 } = {}) {
  await page.route(RATE_LIMIT_RPC, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed:             false,
        surface,
        attempt_count:       99,
        max_attempts:        5,
        window_seconds:      900,
        retry_after_seconds: retryAfterSeconds,
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Rate limiting — login
// ---------------------------------------------------------------------------

test.describe("Rate limiting — login", () => {
  test("shows lockout message when rate limit is exceeded", async ({ page }) => {
    await prepareEnglishLocale(page);
    await mockRateLimitDenied(page, { surface: "auth_login", retryAfterSeconds: 720 });
    await page.goto("/login");

    await page.locator('input[type="email"]').fill("victim@example.com");
    await page.locator('input[type="password"]').fill("somepassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Rate limit message must be visible — not the generic Supabase error
    await expect(page.getByText(/too many sign-in attempts/i)).toBeVisible();
    // Countdown should appear (12 min from 720 s)
    await expect(page.getByText(/12 min/)).toBeVisible();
    // Must stay on /login — not navigate to dashboard
    await expect(page).toHaveURL(/\/login/);
  });

  test("passes through and attempts real login when rate limit is not exceeded", async ({ page }) => {
    await prepareEnglishLocale(page);
    // The global beforeEach already mocks as allowed — no extra setup needed
    await page.goto("/login");

    await page.locator('input[type="email"]').fill("notareal@user.test");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should reach Supabase (wrong creds) — Supabase error, not rate limit error
    await expect(page.getByText(/too many sign-in attempts/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — signup
// ---------------------------------------------------------------------------

test.describe("Rate limiting — signup", () => {
  test("shows lockout message when signup rate limit is exceeded", async ({ page }) => {
    await prepareEnglishLocale(page);
    await mockRateLimitDenied(page, { surface: "auth_signup", retryAfterSeconds: 1800 });
    await page.goto("/signup");

    await page.getByPlaceholder("Account name (e.g. ACME Rentals)").fill("Test Co");
    await page.locator('input[type="email"]').fill("newuser@example.com");
    await page.locator('input[type="password"]').fill(STRONG_PASSWORD);

    // Wait for the button to be enabled (strong password)
    const button = page.getByRole("button", { name: /Create account/i });
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page.getByText(/too many sign-up attempts/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — password reset request
// ---------------------------------------------------------------------------

test.describe("Rate limiting — password reset request", () => {
  test("shows lockout message when reset rate limit is exceeded", async ({ page }) => {
    await prepareEnglishLocale(page);
    await mockRateLimitDenied(page, { surface: "auth_reset", retryAfterSeconds: 2400 });
    await page.goto("/reset-password");

    await page.locator('input[type="email"]').fill("user@example.com");
    await page.getByRole("button", { name: /Send reset link/i }).click();

    await expect(page.getByText(/too many password reset requests/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Stage 4 — hard enforcement (reset_required)
// Mocks get_own_security_profile to return reset_required — no DB writes
// needed so no race conditions with role-navigation tests using the same user.
// ---------------------------------------------------------------------------

async function mockProfileResetRequired(page) {
  await page.route(OWN_PROFILE_RPC, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        password_policy_version:  0,
        password_strength_status: "reset_required",
        password_last_set_at:     null,
        mfa_required:             false,
        mfa_enrolled:             false,
      }]),
    });
  });
}

test.describe("Stage 4 — reset_required hard enforcement", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("user with reset_required profile is redirected to /reset-password after login", async ({ page }) => {
    // Register profile mock BEFORE signInAs navigates so App.jsx intercepts it
    await mockProfileResetRequired(page);

    // Sign in manually — App.jsx sees reset_required and should redirect
    await prepareEnglishLocale(page);
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(seededUsers.ownerA);
    await page.locator('input[type="password"]').fill("OasisTest123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/reset-password/, { timeout: 10_000 });
    await expect(page.getByText(/must be updated before you can continue/i)).toBeVisible();
  });

  test("navigating to /dashboard while reset_required bounces back to /reset-password", async ({ page }) => {
    await mockProfileResetRequired(page);

    await prepareEnglishLocale(page);
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(seededUsers.ownerA);
    await page.locator('input[type="password"]').fill("OasisTest123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/reset-password/, { timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/reset-password/, { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Stage 2 — admin security banner
// ---------------------------------------------------------------------------

test.describe("Stage 2 — SecurityPostureBanner on Dashboard", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.afterEach(async () => {
    const admin = getIntegrationAdminClient();
    const staffId = await resolveUserId(admin, seededUsers.staffA);
    await admin.from("user_security_profile").upsert(
      { user_id: staffId, account_id: ACCOUNT_A, password_strength_status: "strong", password_policy_version: 1 },
      { onConflict: "user_id" },
    );
  });

  test("amber banner appears on Dashboard when account has legacy_weak members", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const staffId = await resolveUserId(admin, seededUsers.staffA);

    const { error } = await admin.from("user_security_profile").upsert(
      { user_id: staffId, account_id: ACCOUNT_A, password_strength_status: "legacy_weak", password_policy_version: 0 },
      { onConflict: "user_id" },
    );
    expect(error).toBeNull();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // The banner title + body should be visible
    await expect(page.getByText("Password security")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/user\(s\) on this account/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Review users" })).toBeVisible();
  });

  test("banner is NOT shown when all members have strong passwords", async ({ page }) => {
    const admin = getIntegrationAdminClient();

    const memberEmails = [seededUsers.ownerA, seededUsers.adminA, seededUsers.staffA];
    for (const email of memberEmails) {
      const userId = await resolveUserId(admin, email);
      await admin.from("user_security_profile").upsert(
        { user_id: userId, account_id: ACCOUNT_A, password_strength_status: "strong", password_policy_version: 1 },
        { onConflict: "user_id" },
      );
    }

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // Give the banner time to appear if it were going to
    await page.waitForTimeout(3_000);
    await expect(page.getByText("Password security")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Stage 3 — personal PasswordUpgradeNotice
// ---------------------------------------------------------------------------

test.describe("Stage 3 — PasswordUpgradeNotice for legacy users", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.afterEach(async () => {
    const admin = getIntegrationAdminClient();
    const ownerAId = await resolveUserId(admin, seededUsers.ownerA);
    await admin.from("user_security_profile").upsert(
      { user_id: ownerAId, account_id: ACCOUNT_A, password_strength_status: "strong", password_policy_version: 1 },
      { onConflict: "user_id" },
    );
  });

  test("personal upgrade notice is shown to a legacy_weak user on the dashboard", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const ownerAId = await resolveUserId(admin, seededUsers.ownerA);

    const { error } = await admin.from("user_security_profile").upsert(
      { user_id: ownerAId, account_id: ACCOUNT_A, password_strength_status: "legacy_weak", password_policy_version: 0 },
      { onConflict: "user_id" },
    );
    expect(error).toBeNull();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await expect(page.getByText("Your password needs updating")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("link", { name: "Update password" })).toBeVisible();
  });

  test("upgrade notice is dismissible and disappears after clicking dismiss", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const ownerAId = await resolveUserId(admin, seededUsers.ownerA);

    await admin.from("user_security_profile").upsert(
      { user_id: ownerAId, account_id: ACCOUNT_A, password_strength_status: "legacy_weak", password_policy_version: 0 },
      { onConflict: "user_id" },
    );

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await expect(page.getByText("Your password needs updating")).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: /remind me later/i }).click();

    await expect(page.getByText("Your password needs updating")).not.toBeVisible({ timeout: 3_000 });
  });

  test("notice is NOT shown to a user with strong password", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const ownerAId = await resolveUserId(admin, seededUsers.ownerA);

    await admin.from("user_security_profile").upsert(
      { user_id: ownerAId, account_id: ACCOUNT_A, password_strength_status: "strong", password_policy_version: 1 },
      { onConflict: "user_id" },
    );

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await page.waitForTimeout(3_000);
    await expect(page.getByText("Your password needs updating")).not.toBeVisible();
  });
});
