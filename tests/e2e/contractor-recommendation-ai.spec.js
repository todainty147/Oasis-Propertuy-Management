import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees contractor recommendation guidance in the create work order drawer", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/maintenance-inbox");
  await page.getByRole("button", { name: /Create work order|Utwórz zlecenie/i }).first().click();

  const card = page.getByTestId("contractor-recommendation-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Contractor recommendation|Rekomendacja wykonawcy/i);
  await expect(card.getByRole("button", { name: /Refresh recommendation|Odśwież rekomendację/i })).toBeVisible();
  await expect(card.getByText(/Facts used for the recommendation|Fakty użyte do rekomendacji/i)).toBeVisible();
});
