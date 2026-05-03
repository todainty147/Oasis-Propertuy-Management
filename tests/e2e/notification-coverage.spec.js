import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;
const { tenantA1, ownerA } = isolationFixtures.users;

test.describe("Epic 4 – Notification Coverage", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("owner marking a payment paid sends payment_received notification to tenant", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const paymentId = randomUUID();

    const { error: insertErr } = await admin.from("payments").insert({
      id: paymentId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      tenant_id: tenantA1.tenantId,
      amount: 950,
      due_date: new Date().toISOString().slice(0, 10),
      status: "pending",
    });
    expect(insertErr).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      const markPaidBtn = page.getByTestId(`mark-paid-${paymentId}`);
      await expect(markPaidBtn).toBeVisible({ timeout: 20_000 });
      await markPaidBtn.click();

      await expect(markPaidBtn).toBeHidden({ timeout: 15_000 });

      const { data: notifications } = await admin
        .from("notifications")
        .select("id, type, entity_id, account_id")
        .eq("account_id", accountA.id)
        .eq("entity_id", paymentId)
        .eq("type", "payment_received");

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].type).toBe("payment_received");
    } finally {
      await admin.from("notifications").delete().eq("entity_id", paymentId);
      await admin.from("payments").delete().eq("id", paymentId);
    }
  });

  test("owner approving a tenant cancellation request sends cancellation_approved notification", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const workOrderId = randomUUID();
    const title = `E2E Cancel Request ${Date.now()}`;

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      status: "in_progress",
      priority: "normal",
    });
    expect(mrErr).toBeNull();

    const { error: woErr } = await admin.from("work_orders").insert({
      id: workOrderId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      maintenance_request_id: requestId,
      status: "assigned",
    });
    expect(woErr).toBeNull();

    const { error: cancelErr } = await admin
      .from("work_orders")
      .update({ pending_cancel_request: true })
      .eq("id", workOrderId);
    expect(cancelErr).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto(`/properties/${tenantA1.propertyId}`);

      const approveBtn = page.getByRole("button", { name: /approve cancellation/i });
      await expect(approveBtn).toBeVisible({ timeout: 20_000 });
      await approveBtn.click();

      await expect(approveBtn).toBeHidden({ timeout: 15_000 });

      const { data: notifications } = await admin
        .from("notifications")
        .select("id, type, entity_id")
        .eq("account_id", accountA.id)
        .eq("entity_id", workOrderId)
        .eq("type", "cancellation_approved");

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThan(0);
    } finally {
      await admin.from("notifications").delete().eq("entity_id", workOrderId);
      await admin.from("notifications").delete().eq("entity_id", requestId);
      await admin.from("work_orders").delete().eq("id", workOrderId);
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("owner denying a tenant cancellation request sends cancellation_denied notification", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const workOrderId = randomUUID();
    const title = `E2E Deny Cancel ${Date.now()}`;

    const { error: mrErr } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title,
      status: "in_progress",
      priority: "normal",
    });
    expect(mrErr).toBeNull();

    const { error: woErr } = await admin.from("work_orders").insert({
      id: workOrderId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      maintenance_request_id: requestId,
      status: "assigned",
    });
    expect(woErr).toBeNull();

    const { error: cancelErr } = await admin
      .from("work_orders")
      .update({ pending_cancel_request: true })
      .eq("id", workOrderId);
    expect(cancelErr).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto(`/properties/${tenantA1.propertyId}`);

      const denyBtn = page.getByRole("button", { name: /^reject$/i });
      await expect(denyBtn).toBeVisible({ timeout: 20_000 });
      await denyBtn.click();

      await expect(denyBtn).toBeHidden({ timeout: 15_000 });

      const { data: notifications } = await admin
        .from("notifications")
        .select("id, type, entity_id")
        .eq("account_id", accountA.id)
        .eq("entity_id", workOrderId)
        .eq("type", "cancellation_denied");

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThan(0);
    } finally {
      await admin.from("notifications").delete().eq("entity_id", workOrderId);
      await admin.from("notifications").delete().eq("entity_id", requestId);
      await admin.from("work_orders").delete().eq("id", workOrderId);
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("creating a payment notifies tenant of new payment due", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const stamp = Date.now();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await page.getByRole("button", { name: /add payment/i }).click();

    const modal = page.locator(".fixed").filter({ hasText: /add payment/i });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await modal.locator("select").filter({ hasLabel: /property/i }).selectOption({ index: 1 });
    await modal.locator("select").filter({ hasLabel: /tenant/i }).selectOption({ index: 1 });
    await modal.locator('input[type="number"]').fill("800");
    const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await modal.locator('input[type="date"]').fill(futureDate);
    await modal.getByRole("button", { name: /save/i }).click();

    await expect(modal).toBeHidden({ timeout: 15_000 });

    const { data: notifications } = await admin
      .from("notifications")
      .select("id, type, account_id")
      .eq("account_id", accountA.id)
      .eq("type", "payment_due")
      .order("created_at", { ascending: false })
      .limit(1);

    const found = Array.isArray(notifications) && notifications.length > 0;
    if (found) {
      await admin.from("notifications").delete().eq("id", notifications[0].id);
    }

    expect(found).toBe(true);
  });
});
