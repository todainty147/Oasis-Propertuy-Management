/**
 * FIN-GATE-01 — Portfolio Health page: mixed-portfolio browser evidence
 *
 * Proves the Portfolio Health page renders:
 *   1. The arrears-aging unavailability card (ph-arrears-aging-unavailable) for a
 *      portfolio that contains at least one unactivated tenancy.
 *   2. The approved copy inside that card (no £0 / currency / bucket labels).
 *   3. The overdue/outstanding headline renders without crashing.
 *
 * The isolation fixture's ownerA has tenantA1 whose property has no
 * tenancy_finance_activations row → anyUnknown=true →
 * arrearsAgingState="unavailable_unknown_balances" → unavailability card shown.
 *
 * EXECUTED_E2E_BROWSER
 */

import { expect, test } from "@playwright/test";

import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { prepareEnglishLocale, seededUsers, signInAs } from "./helpers/auth.js";

const SCREENSHOT_DIR = "artifacts/evidence";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("FIN-GATE-01: Portfolio Health — mixed portfolio", () => {
  // Serial mode: sign-in collisions under parallel workers cause flaky auth failures
  // when run alongside other specs that also sign in as ownerA.
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationHarnessConfigured(),
    "requires local Supabase harness",
  );

  /** Navigate to portfolio-health and wait for the page shell to settle. */
  async function gotoPortfolioHealth(page) {
    await prepareEnglishLocale(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/portfolio-health");
    // Wait for the hero headline to confirm the page has mounted
    await expect(
      page.getByText(/Portfolio Health|portfolio/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  test("PH-E2E-01: ph-arrears-aging-unavailable card is visible", async ({ page }) => {
    await gotoPortfolioHealth(page);

    const card = page.getByTestId("ph-arrears-aging-unavailable");
    await expect(card).toBeVisible({ timeout: 20_000 });

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ph-e2e-01-unavailable-card.png`,
      fullPage: true,
    });
  });

  test("PH-E2E-02: unavailable card contains 'Arrears breakdown unavailable'", async ({ page }) => {
    await gotoPortfolioHealth(page);

    const card = page.getByTestId("ph-arrears-aging-unavailable");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Arrears breakdown unavailable");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ph-e2e-02-card-copy.png`,
      fullPage: true,
    });
  });

  test("PH-E2E-03 (Check 2): unavailable card contains ONLY approved copy — no currency/bucket labels", async ({ page }) => {
    await gotoPortfolioHealth(page);

    const card = page.getByTestId("ph-arrears-aging-unavailable");
    await expect(card).toBeVisible({ timeout: 20_000 });

    const cardText = await card.textContent();

    // Must not contain any currency symbol or zero-balance value
    expect(cardText).not.toContain("£0");
    expect(cardText).not.toContain("£");
    expect(cardText).not.toContain("%");
    // Must not contain arrears-bucket boundary labels
    expect(cardText).not.toContain("0-7");
    expect(cardText).not.toContain("8-30");
    expect(cardText).not.toContain("30+");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ph-e2e-03-check2-copy-only.png`,
      fullPage: true,
    });
  });

  test("PH-E2E-04: outstanding headline renders without error (not the ungated £152,332 value)", async ({ page }) => {
    await gotoPortfolioHealth(page);

    // The Finance stat group renders "Outstanding balance" (portfolio.kpi.outstanding)
    // with formatCurrencyAmount(snapshotView.outstanding_amount).
    // We prove it is visible and does NOT show the ungated canary value.
    const outstandingLabel = page.getByText(/Outstanding balance/i).first();
    await expect(outstandingLabel).toBeVisible({ timeout: 20_000 });

    // Confirm no ungated value leaks through — the specific canary amount
    // that would appear if gating were bypassed
    await expect(page.locator("body")).not.toContainText("152,332");
    await expect(page.locator("body")).not.toContainText("£152");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ph-e2e-04-outstanding-headline.png`,
      fullPage: true,
    });
  });
});
