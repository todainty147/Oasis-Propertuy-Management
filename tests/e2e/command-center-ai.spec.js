import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees the operator briefing on the command center", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/command-center");
  const card = page.getByTestId("attention-insight-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Operator briefing|Szybki briefing operacyjny/i);
  await expect(card.getByRole("button", { name: /Refresh briefing|Odśwież briefing/i })).toBeVisible();
  await expect(card.getByText(/Why this matters|Dlaczego to jest ważne/i)).toBeVisible();
});

