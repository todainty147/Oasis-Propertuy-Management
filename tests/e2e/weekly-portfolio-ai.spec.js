import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees the weekly portfolio AI briefing on the portfolio health page", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/portfolio-health");
  const card = page.getByTestId("weekly-portfolio-ai-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh briefing|Odśwież briefing/i })).toBeEnabled({ timeout: 30000 });
  await expect(card).toContainText(/Weekly portfolio picture|Tygodniowy obraz portfela/i);
  await expect(card.getByText(/What is working|Co idzie dobrze/i)).toBeVisible();
});
