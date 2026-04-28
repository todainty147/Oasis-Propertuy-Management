import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner can drill from the property health explainer into the property record", async ({ page }) => {
  const propertyId = isolationFixtures.users.tenantA1.propertyId;

  await page.route("**/functions/v1/generate-property-health-explainer", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        insight: {
          property_id: propertyId,
          property_label: "11 Starlight Avenue",
          category: "attention_needed",
          health_explanation: "11 Starlight Avenue needs review because maintenance pressure is active across requests and work orders.",
          risk_drivers: [
            {
              driver: "maintenance",
              severity: "medium",
              explanation: "Maintenance pressure is active across requests and work orders.",
            },
          ],
          recommended_next_step: "Review the slowest repair and move the contractor follow-up forward.",
          non_ai_facts_used: ["Open maintenance requests: 1", "Active work orders: 1"],
          confidence: "medium",
          source: "fallback",
          generated_at: new Date().toISOString(),
        },
      }),
    });
  });

  await signInAs(page, seededUsers.ownerA);

  await page.goto("/portfolio-health");
  const card = page.getByTestId("property-health-ai-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole("button", { name: /Refresh explainer|Odśwież wyjaśnienie|Analyse aktualisieren/i })).toBeEnabled({ timeout: 30000 });
  await expect(card).toContainText(/What is driving risk for this property|Co napędza ryzyko tej nieruchomości|Was das Risiko dieser Immobilie verursacht/i);
  await expect(card.getByText(/Facts used for the explanation|Fakty użyte do wyjaśnienia|Datengrundlage/i)).toBeVisible();

  await card.getByTestId("property-health-open-property-link").click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}/i);
  await expect(page.getByText(/Custom property fields|Niestandardowe pola nieruchomości|Benutzerdefinierte Immobilienfelder/i)).toBeVisible({ timeout: 30000 });
});
