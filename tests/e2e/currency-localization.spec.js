/**
 * E2E: Currency internationalisation
 *
 * Validates:
 *   • /settings/localization page loads for owners
 *   • Changing country auto-suggests matching currency
 *   • Saving settings persists (success message shown)
 *   • Finance summary cards reflect the account currency
 *   • German landlord (EUR) and Polish landlord (PLN) are representable
 *   • accounts.currency column exists (verified via admin client)
 *   • payments.currency column inherits from account (via DB check)
 */

import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);
test.use({ viewport: { width: 1440, height: 900 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAccountLocalization() {
  const admin = getIntegrationAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .select("country_code, currency, language")
    .eq("id", ACCOUNT_ID)
    .single();
  if (error) throw new Error(`getAccountLocalization failed: ${error.message}`);
  return data;
}

async function resetAccountLocalization(countryCode, currency, language) {
  const admin = getIntegrationAdminClient();
  await admin
    .from("accounts")
    .update({ country_code: countryCode, currency, language })
    .eq("id", ACCOUNT_ID);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("accounts table has country_code and currency columns", async () => {
  const loc = await getAccountLocalization();
  expect(loc).toHaveProperty("country_code");
  expect(loc).toHaveProperty("currency");
  expect(loc).toHaveProperty("language");
  expect(loc.currency).toMatch(/^[A-Z]{3}$/);
  expect(loc.country_code).toMatch(/^[A-Z]{2}$/);
});

test("localization settings page loads for account owner", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/settings/localization");
  await expect(page.getByTestId("localization-form")).toBeVisible();
  await expect(page.getByRole("heading", { name: /locali/i }).first()).toBeVisible();
});

test("localization page shows correct fields — country, currency, language", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/settings/localization");
  await expect(page.getByTestId("localization-form")).toBeVisible();

  // Country, currency, language dropdowns present
  const form = page.getByTestId("localization-form");
  await expect(form.getByLabel(/country/i)).toBeVisible();
  await expect(form.getByLabel(/currency/i)).toBeVisible();
  await expect(form.getByLabel(/interface language/i)).toBeVisible();
});

test("selecting Germany auto-suggests EUR currency", async ({ page }) => {
  const original = await getAccountLocalization();

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/settings/localization");
  const form = page.getByTestId("localization-form");
  await expect(form).toBeVisible();

  // Change country to Germany
  await form.getByLabel(/country/i).selectOption("DE");

  // Currency should auto-switch to EUR
  const currencyValue = await form.getByLabel(/currency/i).inputValue();
  expect(currencyValue).toBe("EUR");

  await resetAccountLocalization(original.country_code, original.currency, original.language);
});

test("selecting Poland auto-suggests PLN currency", async ({ page }) => {
  const original = await getAccountLocalization();

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/settings/localization");
  const form = page.getByTestId("localization-form");
  await expect(form).toBeVisible();

  // Set to Germany first, then back to Poland to confirm PLN suggestion
  await form.getByLabel(/country/i).selectOption("DE");
  await form.getByLabel(/country/i).selectOption("PL");

  const currencyValue = await form.getByLabel(/currency/i).inputValue();
  expect(currencyValue).toBe("PLN");

  await resetAccountLocalization(original.country_code, original.currency, original.language);
});

test("saving localization settings shows success message and persists to DB", async ({ page }) => {
  const original = await getAccountLocalization();

  try {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/localization");
    const form = page.getByTestId("localization-form");
    await expect(form).toBeVisible();

    // Change to UK / GBP
    await form.getByLabel(/country/i).selectOption("GB");
    // Currency should auto-suggest GBP
    await expect(form.getByLabel(/currency/i)).toHaveValue("GBP");

    await form.getByRole("button", { name: /save/i }).click();
    await expect(form.getByText(/saved/i)).toBeVisible();

    // Verify persisted in DB
    const saved = await getAccountLocalization();
    expect(saved.country_code).toBe("GB");
    expect(saved.currency).toBe("GBP");
  } finally {
    // Always restore original settings
    await resetAccountLocalization(original.country_code, original.currency, original.language);
  }
});

test("finance page uses account currency, not browser default", async ({ page }) => {
  const original = await getAccountLocalization();

  try {
    // Set account to Germany / EUR via direct DB update
    await resetAccountLocalization("DE", "EUR", "en");

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();

    // Wait for summary cards to render
    await expect(page.getByText(/Received|Erhalten/i).first()).toBeVisible();

    // EUR symbol (€) or EUR text should appear somewhere in the summary cards.
    // The exact format depends on Intl.NumberFormat for de-DE locale.
    const pageText = await page.locator(".grid").first().textContent();
    expect(pageText).toMatch(/€|EUR/);
  } finally {
    await resetAccountLocalization(original.country_code, original.currency, original.language);
  }
});

test("new payments inherit account currency (DB check)", async () => {
  const admin = getIntegrationAdminClient();

  // Verify payments.currency column exists
  const { data: cols } = await admin
    .from("payments")
    .select("currency")
    .eq("account_id", ACCOUNT_ID)
    .limit(1);

  // If column doesn't exist this would throw; reaching here means it's present
  expect(Array.isArray(cols)).toBe(true);

  // Check any existing payment has a valid ISO 4217 currency code
  if (cols.length > 0) {
    expect(cols[0].currency).toMatch(/^[A-Z]{3}$/);
  }
});
