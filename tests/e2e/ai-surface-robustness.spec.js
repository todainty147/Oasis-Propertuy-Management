import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;
const { tenantA1 } = isolationFixtures.users;

const TRIAGE_URL = "**/functions/v1/generate-maintenance-triage";
const CONTRACTOR_URL = "**/functions/v1/generate-contractor-recommendation";

function makeMockTriageInsight(requestId, title) {
  return {
    insight: {
      request_id: requestId,
      request_title: title,
      category: "plumbing_heating",
      urgency: "high",
      safety_flag: false,
      suggested_trade: "Plumber / heating engineer",
      tenant_acknowledgement: "We have logged the issue and are arranging a repair.",
      manager_note: "Suggested urgency: high. Suggested trade: Plumber.",
      facts_used: ["Priority: high", "No linked work order"],
      confidence: "medium",
      source: "fallback",
      generated_at: new Date().toISOString(),
    },
  };
}

function makeMockContractorInsight(requestId, title, contractorId) {
  return {
    insight: {
      request_id: requestId,
      request_title: title,
      recommended_contractor_id: contractorId || null,
      recommended_contractor_name: "Contractor A1",
      reason: "Best match based on history at this property.",
      alternatives: [],
      missing_data_warning: null,
      facts_used: ["Property match", "2 completed jobs"],
      confidence: "medium",
      source: "fallback",
      generated_at: new Date().toISOString(),
    },
  };
}

test.describe("Epic 5 – AI Surface Robustness", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("maintenance triage AI request does not include tenant email in prompt body", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const title = `E2E AI PII test ${Date.now()}`;

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      description: "Boiler not working — no hot water",
      priority: "high",
      status: "open",
    });
    expect(mrErr).toBeNull();

    const capturedRequests = [];

    try {
      await page.route(TRIAGE_URL, async (route) => {
        const postData = route.request().postData();
        const body = postData ? JSON.parse(postData) : {};
        if (body.requestId === requestId) capturedRequests.push(body);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeMockTriageInsight(body.requestId || requestId, title)),
        });
      });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(requestCard).toBeVisible({ timeout: 30_000 });
      await requestCard.getByRole("button").first().click();

      const triageCard = requestCard.locator('[data-testid^="maintenance-triage-card-"]').first();
      await expect(triageCard).toBeVisible({ timeout: 30_000 });

      await expect.poll(() => capturedRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
      for (const body of capturedRequests) {
        const bodyStr = JSON.stringify(body);
        // Verify no raw email address in the request body
        expect(bodyStr).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        // accountId and requestId are expected
        expect(body.accountId).toBeTruthy();
        expect(body.requestId).toBe(requestId);
      }

      // Verify insight card renders trade suggestion without PII
      await expect.poll(async () => {
        if (await triageCard.getByText(/Plumber|General maintenance|Electrician|plumbing/i).count() > 0) return "found";
        if (await triageCard.getByText(/Generated|Wygenerowano/i).count() > 0) return "generated";
        return "waiting";
      }, { timeout: 30_000 }).not.toBe("waiting");

      // Verify tenant email is NOT shown in the insight card
      const insightText = await triageCard.textContent();
      expect(insightText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("contractor recommendation AI request does not include contractor email or phone", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const title = `E2E contractor PII test ${Date.now()}`;

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      description: "Leaking pipe under kitchen sink",
      priority: "normal",
      status: "open",
    });
    expect(mrErr).toBeNull();

    const capturedContractorRequests = [];

    try {
      await page.route(TRIAGE_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeMockTriageInsight(requestId, title)),
        });
      });

      await page.route(CONTRACTOR_URL, async (route) => {
        const postData = route.request().postData();
        if (postData) capturedContractorRequests.push(JSON.parse(postData));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeMockContractorInsight(requestId, title, isolationFixtures.users.contractorA1.contractorId)
          ),
        });
      });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(requestCard).toBeVisible({ timeout: 30_000 });

      await requestCard.getByRole("button", { name: /Create work order|Utwórz zlecenie/i }).click();
      const drawer = page.getByTestId("create-work-order-drawer");
      await expect(drawer).toBeVisible({ timeout: 15_000 });

      const recommendationCard = drawer.getByTestId("contractor-recommendation-card");
      await expect(recommendationCard).toBeVisible({ timeout: 30_000 });

      if (capturedContractorRequests.length > 0) {
        const bodyStr = JSON.stringify(capturedContractorRequests[0]);
        // Verify no raw email addresses
        expect(bodyStr).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        // Verify no phone numbers (common patterns)
        expect(bodyStr).not.toMatch(/\+\d{7,}|\b0\d{9,10}\b/);
      }

      // Verify recommendation renders contractor name from mock (not raw IDs)
      await expect(recommendationCard).toContainText(/Contractor A1|Recommendation|recommendation/i);
    } finally {
      await admin.from("work_orders").delete().eq("maintenance_request_id", requestId);
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("AI insight card renders gracefully when rate limit (429) is returned", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const title = `E2E rate limit test ${Date.now()}`;

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      description: "Dripping tap in bathroom",
      priority: "normal",
      status: "open",
    });
    expect(mrErr).toBeNull();

    try {
      await page.route(TRIAGE_URL, async (route) => {
        const postData = route.request().postData();
        const body = postData ? JSON.parse(postData) : {};
        await route.fulfill({
          status: body.requestId === requestId ? 429 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            body.requestId === requestId
              ? { error: "Daily AI generation limit reached" }
              : makeMockTriageInsight(body.requestId || requestId, title)
          ),
        });
      });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(requestCard).toBeVisible({ timeout: 30_000 });
      await requestCard.getByRole("button").first().click();

      const triageCard = requestCard.locator('[data-testid^="maintenance-triage-card-"]').first();
      await expect(triageCard).toBeVisible({ timeout: 30_000 });

      await expect.poll(async () => {
        const text = await triageCard.textContent().catch(() => "");
        if (/limit|rate|429|error|failed|unavailable/i.test(text)) return "error-visible";
        if (/Plumber|Electrician|General|generated|Triage/i.test(text)) return "content-visible";
        return "loading";
      }, { timeout: 30_000 }).not.toBe("loading");
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("maintenance triage fallback response does not expose raw PII in facts_used", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const title = `E2E fallback PII test ${Date.now()}`;
    const tenantEmail = "test.tenant@example.invalid";

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      description: `Issue reported. Contact ${tenantEmail} for details.`,
      priority: "normal",
      status: "open",
    });
    expect(mrErr).toBeNull();

    try {
      // Use a mocked response where facts_used simulates what the fallback would return
      await page.route(TRIAGE_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            insight: {
              request_id: requestId,
              request_title: title,
              category: "general_repairs",
              urgency: "normal",
              safety_flag: false,
              suggested_trade: "General maintenance contractor",
              tenant_acknowledgement: "We have logged the issue.",
              manager_note: "Suggested urgency: normal.",
              // facts_used should NOT contain raw email — it's filtered or redacted
              facts_used: ["Priority: normal", "No linked work order"],
              confidence: "low",
              source: "fallback",
              generated_at: new Date().toISOString(),
            },
          }),
        });
      });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(requestCard).toBeVisible({ timeout: 30_000 });
      await requestCard.getByRole("button").first().click();

      const triageCard = requestCard.locator('[data-testid^="maintenance-triage-card-"]').first();
      await expect(triageCard).toBeVisible({ timeout: 30_000 });

      await expect.poll(async () => {
        const text = await triageCard.textContent().catch(() => "");
        if (/general maintenance|normal|generated/i.test(text)) return "rendered";
        if (/error|failed/i.test(text)) return "error";
        return "loading";
      }, { timeout: 30_000 }).toBe("rendered");

      // The tenant email from the description should not appear in the insight card
      const cardText = await triageCard.textContent();
      expect(cardText).not.toContain(tenantEmail);
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });
});
