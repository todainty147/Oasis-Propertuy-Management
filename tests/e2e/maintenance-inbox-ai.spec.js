import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees AI triage guidance on active maintenance requests", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/maintenance-inbox");
  const heading = page.getByText(/Triage suggestion|Sugestia triage/i).first();
  await expect(heading).toBeVisible();
  await expect(page.getByText(/Facts used for triage|Fakty użyte do triage/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh suggestion|Odśwież sugestię/i }).first()).toBeVisible();
});
