import { expect, test } from "@playwright/test";
import { prepareEnglishLocale } from "./helpers/auth.js";

test("self-serve landlord signup provisions an owner account and lands on the dashboard", async ({ page }) => {
  const stamp = Date.now();
  const accountName = `Signup Flow Rentals ${stamp}`;
  const email = `selfserve.flow.${stamp}@oasis.test`;
  const password = "OasisTest123!";

  await prepareEnglishLocale(page);
  await page.goto("/signup");

  await page.getByPlaceholder("Account name (e.g. ACME Rentals)").fill(accountName);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText(accountName)).toBeVisible();
});
