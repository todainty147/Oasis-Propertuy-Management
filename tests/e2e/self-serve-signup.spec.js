import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { prepareEnglishLocale } from "./helpers/auth.js";

test("shows the self-serve signup sandbox option", async ({ page }) => {
  await prepareEnglishLocale(page);
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: "Create landlord account" })).toBeVisible();
  await expect(page.getByPlaceholder("Account name (e.g. ACME Rentals)")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /start as demo\/sandbox/i })).toBeVisible();
  await expect(page.getByText("loads sample data for demos and testing.")).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "self-serve signup shell");
});
