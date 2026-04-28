import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner sees contractor recommendation guidance in the create work order drawer", async ({ page }) => {
  await page.route("**/functions/v1/generate-contractor-recommendation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        insight: {
          request_id: "browser-e2e",
          request_title: "Browser work order recommendation",
          recommended_contractor_id: isolationFixtures.users.contractorA1.contractorId,
          recommended_contractor_name: "Contractor A1",
          reason: "Contractor A1 is available and suitable for this maintenance request.",
          alternatives: [],
          missing_data_warning: null,
          facts_used: ["Active contractor in account", "General repair request"],
          confidence: "medium",
          source: "fallback",
          generated_at: new Date().toISOString(),
        },
      }),
    });
  });

  await signInAs(page, seededUsers.ownerA);

  await page.goto("/maintenance-inbox");
  await page.getByRole("button", { name: /Create work order|Utwórz zlecenie/i }).first().click();

  const card = page.getByTestId("contractor-recommendation-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Contractor recommendation|Rekomendacja wykonawcy|Dienstleisterempfehlung/i);
  await expect(card.getByRole("button", { name: /Refresh recommendation|Odśwież rekomendację|Empfehlung aktualisieren/i })).toBeVisible();
  await expect(card.getByText(/Facts used for the recommendation|Fakty użyte do rekomendacji|Datengrundlage für die Empfehlung/i)).toBeVisible();
});
