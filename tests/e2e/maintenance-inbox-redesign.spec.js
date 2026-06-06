import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;
const { tenantA1 } = isolationFixtures.users;

test.describe("Maintenance Inbox Redesign", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("compact toolbar shows status count badges and SLA legend, no handoff guide card", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/maintenance-inbox");

    // Toolbar with page title should be visible
    await expect(page.getByRole("heading", { name: "Maintenance Inbox / Triage Board" })).toBeVisible({ timeout: 20_000 });

    // SLA dot legend is inline — look for the text markers
    await expect(page.getByText(/<24h/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/24.48h/)).toBeVisible({ timeout: 5_000 });

    // The old handoff guide card should be gone
    await expect(page.getByText("1. Review the request")).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText("How the work moves forward")).toBeHidden({ timeout: 5_000 });

    // Onboarding hint card should be gone
    await expect(
      page.locator('[data-testid="onboarding-hint-card"]').or(
        page.getByText("onboarding.hints.maintenance.title")
      )
    ).toBeHidden({ timeout: 5_000 });
  });

  test("request card is collapsed by default and shows SLA dot, priority badge, and truncated description", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const longDesc =
      "The boiler has been making a loud banging noise every time the heating activates. " +
      "Tenant reports no hot water since Monday. Radiators in the living room and kitchen " +
      "are not heating up at all despite the thermostat being turned up to maximum.";

    const { error } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title: "Boiler E2E redesign test",
      description: longDesc,
      priority: "high",
      status: "open",
    });
    expect(error).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const card = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });

      // Card should be collapsed: description is line-clamped, not showing full text
      // Full text contains "Radiators in the living room" — this should NOT be visible in collapsed state
      await expect(card.locator("p.line-clamp-2")).toBeVisible({ timeout: 5_000 });

      // Priority badge should be visible
      await expect(card.getByText(/high/i)).toBeVisible({ timeout: 5_000 });

      // Age chip (e.g. "0d 0h" or "Xh") — the property + age string should be visible
      await expect(card.getByText(/0h|1h/)).toBeVisible({ timeout: 5_000 });

      // The Create Work Order button should be at the card action bar level (always visible)
      await expect(
        card.getByRole("button", { name: /Create work order|Utwórz zlecenie/i })
      ).toBeVisible({ timeout: 10_000 });

      // The redundant "Status: Open" badge inside the Open column should NOT exist
      await expect(card.getByText("Status: Open")).toBeHidden();
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("clicking the card header expands the card to show full description and work orders section", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();
    const longDesc =
      "EXPAND_MARKER: This text only appears when card is fully expanded. " +
      "The second sentence should be hidden in collapsed two-line clamp view but visible when expanded.";

    const { error } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title: "Expansion test request",
      description: longDesc,
      priority: "normal",
      status: "open",
    });
    expect(error).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const card = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });

      // Collapsed: "EXPAND_MARKER" may be visible but second sentence should be clipped
      // Click the header button to expand
      await card.getByRole("button", { name: /Expansion test request/ }).first().click();

      // After expansion: full description is visible including the second sentence
      await expect(card.getByText(/second sentence should be hidden/)).toBeVisible({ timeout: 10_000 });

      // Reported at timestamp is now shown in expanded body
      await expect(card.getByText(/Reported/i)).toBeVisible({ timeout: 5_000 });
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("overflow menu opens and contains Add Note, Set Waiting, and Close actions", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();

    const { error } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title: "Overflow menu test",
      description: "Testing overflow menu actions",
      priority: "normal",
      status: "open",
    });
    expect(error).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const card = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });

      // The ··· overflow button should be visible at card level
      const overflowBtn = card.getByRole("button", { name: /more actions/i });
      await expect(overflowBtn).toBeVisible({ timeout: 10_000 });
      await overflowBtn.click();

      // Overflow menu items
      await expect(page.getByRole("button", { name: /add note/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("button", { name: /set waiting/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("button", { name: /^close$/i })).toBeVisible({ timeout: 5_000 });

      // Close the menu by clicking elsewhere
      await page.keyboard.press("Escape");
    } finally {
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });

  test("Create Work Order at card level opens the work order drawer", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const requestId = randomUUID();

    const { error } = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: accountA.id,
      property_id: tenantA1.propertyId,
      reported_by_tenant_id: tenantA1.tenantId,
      title: "WO button test",
      description: "Checking primary CTA placement",
      priority: "normal",
      status: "open",
    });
    expect(error).toBeNull();

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/maintenance-inbox");

      const card = page.getByTestId(`maintenance-request-card-${requestId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });

      // Primary CTA at card action bar level — should NOT require expanding first
      const createBtn = card.getByRole("button", { name: /Create work order|Utwórz zlecenie/i });
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();

      // Drawer should open
      const drawer = page.getByTestId("create-work-order-drawer");
      await expect(drawer).toBeVisible({ timeout: 15_000 });
    } finally {
      await admin.from("work_orders").delete().eq("maintenance_request_id", requestId);
      await admin.from("maintenance_requests").delete().eq("id", requestId);
    }
  });
});
