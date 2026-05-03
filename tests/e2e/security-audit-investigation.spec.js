import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;

test.describe("Epic 6 – Security Audit Investigation Panel", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("security audit page loads with ledger, anomaly, and hosted event sections", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/settings/security-audit");

    await expect(page.getByText("Security Audit")).toBeVisible({ timeout: 20_000 });

    // All three main content cards should be present in some form
    await expect(page.getByText("Open anomaly alerts")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Hosted Observability Events")).toBeVisible({ timeout: 15_000 });
  });

  test("investigation context strip appears when URL contains hosted event id", async ({ page }) => {
    const fakeHostedId = "hosted-e2e-test-id";

    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/settings/security-audit?hosted=${fakeHostedId}`);

    // Investigation context strip should render because focusedHostedEventId is set
    const strip = page.getByText("Current investigation context");
    await expect(strip).toBeVisible({ timeout: 20_000 });

    // Shows empty state since the hosted event doesn't exist in DB
    await expect(page.getByText("No investigation context is selected yet.")).toBeVisible({ timeout: 10_000 });

    // Clear button is present
    await expect(page.getByRole("button", { name: /Clear context/i })).toBeVisible({ timeout: 5_000 });
  });

  test("clearing investigation context removes the strip and clears URL param", async ({ page }) => {
    const fakeHostedId = "hosted-e2e-clear-test";

    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/settings/security-audit?hosted=${fakeHostedId}`);

    const strip = page.getByText("Current investigation context");
    await expect(strip).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Clear context/i }).click();

    await expect(strip).toBeHidden({ timeout: 10_000 });

    // URL should no longer contain the hosted param
    await expect(page).not.toHaveURL(/hosted=/);
  });

  test("security audit ledger shows a real inserted event row", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const eventId = randomUUID();
    const stamp = Date.now();

    // Insert a synthetic security audit event directly
    const { error: insertErr } = await admin.from("security_audit_ledger").insert({
      id: eventId,
      account_id: accountA.id,
      action: "e2e_test_action",
      actor_user_id: isolationFixtures.users.ownerA.id,
      entity_type: "property",
      entity_id: isolationFixtures.users.tenantA1.propertyId,
      metadata: { e2e_stamp: stamp, note: "epic-6-e2e-test" },
    });
    expect(insertErr).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/settings/security-audit");

      // Ledger card should eventually show the event
      await expect.poll(async () => {
        const hasAction = await page.getByText("e2e_test_action").count();
        return hasAction > 0 ? "found" : "waiting";
      }, { timeout: 30_000 }).toBe("found");

      // Clicking Review on the event row should open the event drawer
      const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first();
      await expect(reviewBtn).toBeVisible({ timeout: 10_000 });
      await reviewBtn.click();

      // Event drawer should appear with the event details
      await expect.poll(async () => {
        const hasDetail = await page.getByText(/e2e_test_action|epic-6-e2e-test|e2e_stamp/i).count();
        return hasDetail > 0 ? "found" : "waiting";
      }, { timeout: 15_000 }).toBe("found");
    } finally {
      await admin.from("security_audit_ledger").delete().eq("id", eventId);
    }
  });

  test("investigation context strip shows anomaly badge when alert id is in URL", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const alertId = randomUUID();

    // Insert a real anomaly alert to test the badge rendering
    const { error: alertErr } = await admin.from("security_anomaly_alerts").insert({
      id: alertId,
      account_id: accountA.id,
      alert_type: "e2e_cross_role_test",
      severity: "urgent",
      status: "open",
      title: "E2E investigation panel test alert",
      summary: "Synthetic alert inserted by E2E test for epic 6.",
      dedupe_key: `e2e-investigation-${alertId}`,
      metadata: { e2e: true },
    });
    expect(alertErr).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto(`/settings/security-audit?alert=${alertId}&alertStatus=open`);

      // Investigation context strip should render
      const strip = page.getByText("Current investigation context");
      await expect(strip).toBeVisible({ timeout: 20_000 });

      // The anomaly alert should be loaded and the severity badge visible
      await expect.poll(async () => {
        const hasBadge = await page.getByText(/urgent/i).count();
        return hasBadge > 0 ? "found" : "waiting";
      }, { timeout: 30_000 }).toBe("found");
    } finally {
      await admin.from("security_anomaly_alerts").delete().eq("id", alertId);
    }
  });
});
