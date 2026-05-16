import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { prepareEnglishLocale } from "./helpers/auth.js";

test("loads the Tenaqo app shell", async ({ page }) => {
  await prepareEnglishLocale(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/tenaqo/i);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "sign-in shell");
});
