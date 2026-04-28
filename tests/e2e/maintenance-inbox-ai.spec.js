import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner can move from AI triage guidance into contractor recommendation", async ({ page }) => {
  const admin = getIntegrationAdminClient();
  const requestId = randomUUID();
  const title = `E2E AI triage click-through ${Date.now()}`;

  const { error: requestError } = await admin.from("maintenance_requests").insert({
    id: requestId,
    account_id: isolationFixtures.accounts.accountA.id,
    property_id: isolationFixtures.users.tenantA1.propertyId,
    reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    title,
    description: "Playwright verifies AI triage can hand off into work order recommendation.",
    priority: "high",
    status: "open",
  });
  expect(requestError).toBeNull();

  try {
    await page.route("**/functions/v1/generate-maintenance-triage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          insight: {
            request_id: requestId,
            request_title: title,
            category: "general_repairs",
            urgency: "high",
            safety_flag: false,
            suggested_trade: "General maintenance contractor",
            tenant_acknowledgement: "We have the issue and are arranging a contractor.",
            manager_note: "Create a work order and assign the best available contractor.",
            facts_used: ["High priority request", "No linked work order"],
            confidence: "medium",
            source: "fallback",
            generated_at: new Date().toISOString(),
          },
        }),
      });
    });
    await page.route("**/functions/v1/generate-contractor-recommendation", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          insight: {
            request_id: requestId,
            request_title: title,
            recommended_contractor_id: isolationFixtures.users.contractorA1.contractorId,
            recommended_contractor_name: "Contractor A1",
            reason: "Contractor A1 is already available for this account and is suitable for general repairs.",
            alternatives: [],
            missing_data_warning: null,
            facts_used: ["Request priority: high", "Category: general repairs"],
            confidence: "medium",
            source: "fallback",
            generated_at: new Date().toISOString(),
          },
        }),
      });
    });

    await signInAs(page, seededUsers.ownerA);

    await page.goto("/maintenance-inbox");
    const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
    await expect(requestCard).toBeVisible({ timeout: 30000 });

    const triageCard = requestCard.locator('[data-testid^="maintenance-triage-card-"]').first();
    await expect(triageCard).toBeVisible({ timeout: 30000 });
    await expect(triageCard.getByRole("button", { name: /Refresh suggestion|Odśwież sugestię|Empfehlung aktualisieren/i })).toBeEnabled({ timeout: 30000 });
    await expect(triageCard.getByText(/Triage suggestion|Sugestia triage|Triage-Empfehlung/i)).toBeVisible();
    await expect
      .poll(async () => {
        if ((await triageCard.getByRole("button", { name: /Show facts|Pokaż fakty|Hide facts|Ukryj fakty|Datengrundlage anzeigen|Datengrundlage ausblenden/i }).count()) > 0) {
          return "toggle";
        }
        if ((await triageCard.getByRole("button", { name: /Show drafts|Pokaż szkice|Hide drafts|Ukryj szkice|Entwürfe anzeigen|Entwürfe ausblenden/i }).count()) > 0) {
          return "drafts-toggle";
        }
        if ((await triageCard.getByText(/Generated|Wygenerowano|Generiert/i).count()) > 0) return "generated";
        if ((await triageCard.getByText(/General maintenance contractor|Hydraulik|Elektryk|Plumber|Heating engineer/i).count()) > 0) {
          return "summary";
        }
        if ((await triageCard.getByText(/Failed to send a request to the Edge Function|Could not generate|Edge Function returned/i).count()) > 0) {
          return "error";
        }
        return "missing";
      }, { timeout: 30000 })
      .not.toBe("missing");

    await requestCard.getByRole("button", { name: /Create work order|Utwórz zlecenie/i }).click();
    const drawer = page.getByTestId("create-work-order-drawer");
    await expect(drawer).toContainText(title);
    const recommendation = drawer.getByTestId("contractor-recommendation-card");
    await expect(recommendation).toBeVisible({ timeout: 30000 });
    await expect(recommendation).toContainText(/Contractor recommendation|Rekomendacja wykonawcy|Dienstleisterempfehlung/i);
    await expect(recommendation.getByText(/Facts used for the recommendation|Fakty użyte do rekomendacji|Datengrundlage für die Empfehlung/i)).toBeVisible();
  } finally {
    await admin.from("work_orders").delete().eq("maintenance_request_id", requestId);
    await admin.from("maintenance_requests").delete().eq("id", requestId);
  }
});
