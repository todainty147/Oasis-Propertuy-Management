import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner can follow an operator briefing action to the target surface", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/command-center");
  const card = page.getByTestId("attention-insight-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh briefing|Odśwież briefing/i })).toBeEnabled({ timeout: 30000 });
  await expect(card).toContainText(/Operator briefing|Szybki briefing operacyjny/i);
  await expect(card.getByText(/Why this matters|Dlaczego to jest ważne/i)).toBeVisible();

  const action = card.getByTestId("attention-insight-action-link").first();
  await expect(action).toBeVisible({ timeout: 30000 });
  await action.click();

  await expect(page).not.toHaveURL(/\/command-center(?:\?.*)?$/);
  await expect(page.getByRole("main")).toBeVisible();
});
