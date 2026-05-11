// tests/e2e/password-policy-ui.spec.js
//
// End-to-end verification of the Authentication Hardening v1 password policy
// UI behaviour. Tests run against the local Vite dev server (same config as
// all other E2E specs).
//
// Coverage:
//   - Signup page: strength meter appears, weak password disables button,
//     strong password re-enables it, weak submission is blocked in-page
//   - Invite page: same behaviour for the set-password form
//   - Reset-password page: same behaviour for the recovery set-password form
//
// These tests do NOT create real auth users (they stop before the actual
// Supabase signUp / updateUser call) — they only verify the UI gate.

import { expect, test } from "@playwright/test";
import { prepareEnglishLocale } from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEAK_PASSWORD  = "abc123";           // too short, no upper, no symbol
const MEDIUM_PASSWORD = "Password123";     // no symbol, too short
const STRONG_PASSWORD = "Velvet#Bloom2026!"; // passes all requirements

async function fillSignupForm(page, { accountName, email, password }) {
  await prepareEnglishLocale(page);
  await page.goto("/signup");
  if (accountName) await page.getByPlaceholder("Account name (e.g. ACME Rentals)").fill(accountName);
  if (email)       await page.getByPlaceholder("Email").fill(email);
  if (password)    await page.getByPlaceholder("Password").fill(password);
}

// ---------------------------------------------------------------------------
// Signup page
// ---------------------------------------------------------------------------

test.describe("Signup page — password strength UI", () => {
  test("strength meter is hidden when password field is empty", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: "" });

    // Meter must not be visible before any password is typed
    await expect(page.getByRole("progressbar")).not.toBeVisible();
  });

  test("strength meter appears as soon as a character is typed", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: "a" });

    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("weak password shows a strength label and unmet requirements in the checklist", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: WEAK_PASSWORD });

    // Meter shows some label (Weak or Fair — exact label depends on which checks pass)
    await expect(page.getByText(/^(Weak|Fair|Good)$/)).toBeVisible();
    // Unmet requirements appear in the checklist
    await expect(page.getByText("At least 12 characters")).toBeVisible();
    // At least one unmet item (○) is shown
    await expect(page.locator("li").filter({ hasText: "○" }).first()).toBeVisible();
  });

  test("weak password disables the Create account button", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: WEAK_PASSWORD });

    const button = page.getByRole("button", { name: "Create account" });
    await expect(button).toBeDisabled();
  });

  test("strong password enables the Create account button", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: STRONG_PASSWORD });

    const button = page.getByRole("button", { name: "Create account" });
    await expect(button).toBeEnabled();
  });

  test("strong password shows 'Strong' label", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: STRONG_PASSWORD });

    await expect(page.getByText("Strong")).toBeVisible();
  });

  test("all requirement items are ticked for a valid strong password", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: STRONG_PASSWORD });

    // Every checklist item should show the ✓ tick — none should show ○
    const uncheckedItems = page.locator("li").filter({ hasText: "○" });
    await expect(uncheckedItems).toHaveCount(0);
  });

  test("a common password (Password123!) is blocked even at 12 chars", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: "Password123!" });

    const button = page.getByRole("button", { name: "Create account" });
    await expect(button).toBeDisabled();
    await expect(page.getByText("Not a commonly used password")).toBeVisible();
  });

  test("form blocks submission for weak password even if button is force-clicked via JS", async ({ page }) => {
    await fillSignupForm(page, { accountName: "Test Co", email: "e@example.com", password: WEAK_PASSWORD });

    // Force-submit by triggering the form directly (bypasses disabled attribute)
    await page.evaluate(() => {
      document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // Should stay on /signup — not navigate away
    await expect(page).toHaveURL(/\/signup$/);
    // An error message or the strength meter remains visible
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("personal info check: email local-part in password triggers noPersonal requirement", async ({ page }) => {
    const email = "alice@example.com";
    // Password includes "alice" from email local-part
    await fillSignupForm(page, { accountName: "Test Co", email, password: "Alice!World99#Z" });

    await expect(page.getByText("Does not contain your name or email")).toBeVisible();
    const button = page.getByRole("button", { name: "Create account" });
    await expect(button).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Invite page (set-password form)
// The invite page requires a user session. We test the UI without a real
// invite token by navigating to /invite?token=fake-token while already
// having a session (the page shows the password form when user is logged in).
// We sign in as ownerA from the fixture and then visit the invite URL.
// ---------------------------------------------------------------------------

test.describe("Invite page — password strength UI", () => {
  test.beforeEach(async ({ page }) => {
    await prepareEnglishLocale(page);
    // Sign in as ownerA fixture user
    await page.goto("/login");
    const env = {
      email:    process.env.VITE_FIXTURE_OWNER_A_EMAIL || "owner.a@oasis.test",
      password: process.env.VITE_FIXTURE_OWNER_A_PASSWORD || "OasisTest123!",
    };
    await page.locator('input[type="email"]').fill(env.email);
    await page.locator('input[type="password"]').fill(env.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Wait until we leave login page
    await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });
  });

  test("strength meter appears on the invite set-password form", async ({ page }) => {
    await page.goto("/invite?token=fake-token-for-ui-test");

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill("ab");

    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("weak password disables the Set password and join button on invite page", async ({ page }) => {
    await page.goto("/invite?token=fake-token-for-ui-test");

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(WEAK_PASSWORD);

    const button = page.getByRole("button", { name: /Set password and join|Complete setup/i });
    await expect(button).toBeDisabled();
  });

  test("strong password enables the Set password and join button on invite page", async ({ page }) => {
    await page.goto("/invite?token=fake-token-for-ui-test");

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(STRONG_PASSWORD);

    const button = page.getByRole("button", { name: /Set password and join|Complete setup/i });
    await expect(button).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Reset-password page (recovery set-password form)
// We navigate to /reset-password?flow=recovery to reveal the password form
// without needing a real recovery token.
// ---------------------------------------------------------------------------

test.describe("Reset-password page — password strength UI", () => {
  test.beforeEach(async ({ page }) => {
    await prepareEnglishLocale(page);
    // Show the set-new-password form by simulating a recovery flow marker
    await page.goto("/reset-password?flow=recovery");
    // The page reads the flow param and sets isRecovery = true,
    // revealing the password inputs
    await expect(page.locator('input[placeholder="New password"]')).toBeVisible({ timeout: 8_000 });
  });

  test("strength meter appears when typing on the reset-password form", async ({ page }) => {
    await page.locator('input[placeholder="New password"]').fill("a");
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("weak password disables Save new password button", async ({ page }) => {
    await page.locator('input[placeholder="New password"]').fill(WEAK_PASSWORD);

    const button = page.getByRole("button", { name: /Save new password|Save password/i });
    await expect(button).toBeDisabled();
  });

  test("strong password enables Save new password button", async ({ page }) => {
    await page.locator('input[placeholder="New password"]').fill(STRONG_PASSWORD);

    const button = page.getByRole("button", { name: /Save new password|Save password/i });
    await expect(button).toBeEnabled();
  });

  test("strength meter shows all requirements met for a strong password", async ({ page }) => {
    await page.locator('input[placeholder="New password"]').fill(STRONG_PASSWORD);

    const uncheckedItems = page.locator("li").filter({ hasText: "○" });
    await expect(uncheckedItems).toHaveCount(0);
  });
});
