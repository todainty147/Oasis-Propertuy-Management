import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner can browse properties and open the property detail experience", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/properties");
  await expect(page).toHaveURL(/\/properties$/);
  await expect(page.getByText("11 Starlight Avenue")).toBeVisible();

  await page.getByRole("link", { name: /11 Starlight Avenue/i }).click();
  await expect(page).toHaveURL(/\/properties\/44444444-4444-4444-4444-444444444441$/);
  await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible();
  await expect(page.getByText("Custom property fields")).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "owner property details");
});
