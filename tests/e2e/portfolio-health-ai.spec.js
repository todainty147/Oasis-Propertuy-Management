import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees the property health AI explainer on the portfolio health page", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/portfolio-health");
  const card = page.getByTestId("property-health-ai-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh explainer|Odśwież wyjaśnienie/i })).toBeEnabled({ timeout: 30000 });
  await expect(card).toContainText(/What is driving risk for this property|Co napędza ryzyko tej nieruchomości/i);
  await expect(card.getByText(/Facts used for the explanation|Fakty użyte do wyjaśnienia/i)).toBeVisible();
});
