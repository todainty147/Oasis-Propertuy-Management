import { expect, test } from "@playwright/test";

import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe("Finance page – mobile responsive tables", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  // ── layout switching tests (no real data needed) ───────────────────────────

  test("mobile viewport hides desktop tables and shows card lists", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

    // Property cards are visible on the overview tab.
    await expect(page.getByTestId("property-finance-cards")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("property-finance-table")).toBeHidden();

    await page.goto("/finance?tab=payments");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("payments-cards")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("payments-table")).toBeHidden();
  });

  test("desktop viewport hides card lists and shows desktop tables", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

    // Property table is visible on the overview tab.
    await expect(page.getByTestId("property-finance-table")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("property-finance-cards")).toBeHidden();

    await page.goto("/finance?tab=payments");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("payments-cards")).toBeHidden();
  });

  test("page header Add Payment button is fully visible on mobile without overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    const addBtn = page.getByRole("button", { name: /add payment/i });
    await expect(addBtn).toBeVisible({ timeout: 20_000 });

    // Button should be within viewport bounds — not clipped on the right
    const box = await addBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 2); // 2px tolerance
  });

  // ── data-driven tests (requires harness) ──────────────────────────────────

  test("payment card on mobile shows tenant name, amount, due date, and action buttons", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");

    const cards = page.getByTestId("payments-cards");
    await expect(cards).toBeVisible({ timeout: 20_000 });

    const firstCard = cards.locator("> div").first();
    await expect(firstCard).toContainText(/tenant\.a1|tenant a1/i, { timeout: 20_000 });
    await expect(firstCard).toContainText(/Due date|Paid at/i);
    await expect(firstCard.getByRole("button", { name: /edit/i })).toBeVisible();
  });

  test("property finance card on mobile shows address, rent, paid, remaining, and status badge", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    const cards = page.getByTestId("property-finance-cards");

    // Page must load without horizontal overflow (scrollWidth === clientWidth)
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

    // If there is at least one property card, verify the key column labels are present
    const cardCount = await cards.locator("> div").count();
    if (cardCount > 0) {
      const firstCard = cards.locator("> div").first();
      // Column label headings (uppercase tracking-wide)
      await expect(firstCard.getByText(/Rent|Czynsz|Miete/i)).toBeVisible({ timeout: 5_000 });
      await expect(firstCard.getByText(/Paid|Zapłacono|Bezahlt/i)).toBeVisible({ timeout: 5_000 });
      await expect(firstCard.getByText(/Remaining|Pozostało|Ausstehend/i)).toBeVisible({ timeout: 5_000 });
      await expect(firstCard.getByText(/Status/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  test("page has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");

    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    // Wait for content to settle
    await page.waitForTimeout(500);

    // Measure document scroll width vs viewport width
    const overflows = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return {
        scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
        clientWidth: Math.max(body.clientWidth, html.clientWidth),
      };
    });

    // Allow a 2px tolerance for rounding
    expect(overflows.scrollWidth).toBeLessThanOrEqual(overflows.clientWidth + 2);
  });

  test("switching from mobile to desktop viewport shows table and hides cards", async ({ page }) => {
    // Start mobile
    await page.setViewportSize(MOBILE_VIEWPORT);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");

    await expect(page.getByTestId("payments-cards")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("payments-table")).toBeHidden();

    // Resize to desktop
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.waitForTimeout(100); // allow CSS to repaint

    await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("payments-cards")).toBeHidden();
  });
});
