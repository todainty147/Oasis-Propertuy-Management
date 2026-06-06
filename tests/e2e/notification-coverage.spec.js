import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;
const { tenantA1 } = isolationFixtures.users;

test.describe.configure({ mode: "serial" });

async function seedTenantCancellationRequest(admin, workOrderId) {
  const { error } = await admin.from("work_order_audit_log").insert({
    work_order_id: workOrderId,
    account_id: accountA.id,
    actor_user_id: tenantA1.id,
    action: "tenant_cancellation_requested",
    old_value: null,
    new_value: { status: "requested" },
  });
  expect(error).toBeNull();
}

test.describe("Epic 4 – Notification Coverage", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("owner marking a payment paid sends payment_received notification to tenant", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const stamp = `e2e-payment-received-${Date.now()}`;
    const createdAfter = new Date(Date.now() - 1000).toISOString();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await page.getByRole("button", { name: /add payment/i }).click();
      const modal = page.locator(".fixed").filter({ hasText: /add payment/i });
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await modal.locator("select").nth(0).selectOption(tenantA1.propertyId);
      await expect(modal.locator("select").nth(1)).toBeEnabled({ timeout: 5_000 });
      await modal.locator("select").nth(1).selectOption(tenantA1.tenantId);
      await modal.locator('input[type="number"]').fill("950");
      await modal.locator('input[type="date"]').fill(new Date().toISOString().slice(0, 10));
      await modal.locator("#payment-notes").fill(stamp);
      await modal.locator("#payment-mark-paid").check();
      await modal.getByRole("button", { name: /save/i }).click();

      await expect(modal).toBeHidden({ timeout: 15_000 });

      const { data: payments } = await admin
        .from("payments")
        .select("id")
        .eq("account_id", accountA.id)
        .eq("property_id", tenantA1.propertyId)
        .eq("tenant_id", tenantA1.tenantId)
        .gte("created_at", createdAfter)
        .order("created_at", { ascending: false })
        .limit(1);
      const payment = payments?.[0] || null;
      expect(payment?.id).toBeTruthy();

      const { data: notifications } = await admin
        .from("notifications")
        .select("id, type, entity_id, account_id")
        .eq("account_id", accountA.id)
        .eq("entity_id", payment.id)
        .eq("type", "payment_received");

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].type).toBe("payment_received");
    } finally {
      const { data: payments } = await admin
        .from("payments")
        .select("id")
        .eq("account_id", accountA.id)
        .eq("property_id", tenantA1.propertyId)
        .eq("tenant_id", tenantA1.tenantId)
        .gte("created_at", createdAfter);
      const paymentIds = (payments || []).map((row) => row.id);
      if (paymentIds.length > 0) {
        await admin.from("notifications").delete().in("entity_id", paymentIds);
        await admin.from("payments").delete().in("id", paymentIds);
      }
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

    await seedTenantCancellationRequest(admin, workOrderId);

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto(`/properties/${tenantA1.propertyId}?tab=maintenance`);

      const row = page.locator("div").filter({ hasText: title }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      const approveBtn = row.getByRole("button", { name: /approve cancellation/i });
      await expect(approveBtn).toBeVisible({ timeout: 20_000 });
      await approveBtn.click();

      await expect(approveBtn).toBeHidden({ timeout: 15_000 });

      await expect.poll(async () => {
        const { data: notifications } = await admin
          .from("notifications")
          .select("id, type, entity_id")
          .eq("account_id", accountA.id)
          .eq("entity_id", workOrderId)
          .eq("type", "cancellation_approved");
        return notifications?.length || 0;
      }, { timeout: 8_000 }).toBeGreaterThan(0);
    } finally {
      await admin.from("notifications").delete().eq("entity_id", workOrderId);
      await admin.from("notifications").delete().eq("entity_id", requestId);
      await admin.from("work_order_audit_log").delete().eq("work_order_id", workOrderId);
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

    await seedTenantCancellationRequest(admin, workOrderId);

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto(`/properties/${tenantA1.propertyId}?tab=maintenance`);

      const row = page.locator("div").filter({ hasText: title }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      const denyBtn = row.getByRole("button", { name: /^reject$/i });
      await expect(denyBtn).toBeVisible({ timeout: 20_000 });
      await denyBtn.click();

      await expect(denyBtn).toBeHidden({ timeout: 15_000 });

      await expect.poll(async () => {
        const { data: notifications } = await admin
          .from("notifications")
          .select("id, type, entity_id")
          .eq("account_id", accountA.id)
          .eq("entity_id", workOrderId)
          .eq("type", "cancellation_denied");
        return notifications?.length || 0;
      }, { timeout: 8_000 }).toBeGreaterThan(0);
    } finally {
      await admin.from("notifications").delete().eq("entity_id", workOrderId);
      await admin.from("notifications").delete().eq("entity_id", requestId);
      await admin.from("work_order_audit_log").delete().eq("work_order_id", workOrderId);
      await admin.from("work_orders").delete().eq("id", workOrderId);
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("creating a payment notifies tenant of new payment due", async ({ page }) => {
    const admin = getIntegrationAdminClient();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await page.getByRole("button", { name: /add payment/i }).click();

    const modal = page.locator(".fixed").filter({ hasText: /add payment/i });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await modal.locator("select").nth(0).selectOption(tenantA1.propertyId);
    await expect(modal.locator("select").nth(1)).toBeEnabled({ timeout: 5_000 });
    await modal.locator("select").nth(1).selectOption(tenantA1.tenantId);
    await modal.locator('input[type="number"]').fill("800");
    const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await modal.locator('input[type="date"]').fill(futureDate);
    await modal.getByRole("button", { name: /save/i }).click();

    await expect(modal).toBeHidden({ timeout: 15_000 });

    await expect.poll(async () => {
      const { data: notifications } = await admin
        .from("notifications")
        .select("id, type, account_id")
        .eq("account_id", accountA.id)
        .eq("type", "payment_due")
        .order("created_at", { ascending: false })
        .limit(1);
      return notifications?.[0]?.id || null;
    }, { timeout: 8_000 }).not.toBeNull();

    const { data: notifications } = await admin
      .from("notifications")
      .select("id")
      .eq("account_id", accountA.id)
      .eq("type", "payment_due")
      .order("created_at", { ascending: false })
      .limit(1);
    const notificationId = notifications?.[0]?.id || null;
    if (notificationId) {
      await admin.from("notifications").delete().eq("id", notificationId);
    }
  });
});
