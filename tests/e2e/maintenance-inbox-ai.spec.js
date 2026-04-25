import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees AI triage guidance on active maintenance requests", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/maintenance-inbox");
  const card = page.locator('[data-testid^="maintenance-triage-card-"]').first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh suggestion|Odśwież sugestię/i })).toBeEnabled({ timeout: 30000 });
  await expect(card.getByText(/Triage suggestion|Sugestia triage/i)).toBeVisible();
  await expect
    .poll(async () => {
      if ((await card.getByRole("button", { name: /Show facts|Pokaż fakty|Hide facts|Ukryj fakty/i }).count()) > 0) {
        return "toggle";
      }
      if ((await card.getByRole("button", { name: /Show drafts|Pokaż szkice|Hide drafts|Ukryj szkice/i }).count()) > 0) {
        return "drafts-toggle";
      }
      if ((await card.getByText(/Generated|Wygenerowano/i).count()) > 0) return "generated";
      if ((await card.getByText(/General maintenance contractor|Hydraulik|Elektryk|Plumber|Heating engineer/i).count()) > 0) {
        return "summary";
      }
      if ((await card.getByText(/Failed to send a request to the Edge Function|Could not generate/i).count()) > 0) {
        return "error";
      }
      return "missing";
    }, { timeout: 30000 })
    .not.toBe("missing");
});
