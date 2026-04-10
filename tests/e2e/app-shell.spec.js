import { expect, test } from "@playwright/test";
import { prepareEnglishLocale } from "./helpers/auth.js";

test("loads the Oasis app shell", async ({ page }) => {
  await prepareEnglishLocale(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/oasis/i);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
});
