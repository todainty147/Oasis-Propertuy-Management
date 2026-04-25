import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees AI triage guidance on active maintenance requests", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/maintenance-inbox");
  const card = page.locator('[data-testid^="maintenance-triage-card-"]').first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh suggestion|Odśwież sugestię/i })).toBeEnabled({ timeout: 30000 });
  await expect(card.getByText(/Triage suggestion|Sugestia triage/i)).toBeVisible();
  await expect(card.getByText(/Facts used for triage|Fakty użyte do triage/i)).toBeVisible();
});
