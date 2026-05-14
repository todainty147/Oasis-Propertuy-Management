import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { logout, seededUsers, signInAs } from "./helpers/auth.js";

test("maintenance request becomes a contractor-completed linked work order", async ({ page }) => {
  const admin = getIntegrationAdminClient();
  const requestId = randomUUID();
  const title = `E2E maintenance triage ${Date.now()}`;

  const { error: requestError } = await admin.from("maintenance_requests").insert({
    id: requestId,
    account_id: isolationFixtures.accounts.accountA.id,
    property_id: isolationFixtures.users.tenantA1.propertyId,
    reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    title,
    description: "Playwright verifies that a manager can move from issue triage to a linked work order.",
    priority: "high",
    status: "open",
  });
  expect(requestError).toBeNull();

  try {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/maintenance-inbox");

    const requestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
    await expect(requestCard).toBeVisible({ timeout: 30_000 });
    await expect(requestCard).toContainText(title);
    await expect(requestCard).toContainText("No work orders");

    await requestCard.getByRole("button", { name: "Create work order" }).click();

    const drawer = page.getByTestId("create-work-order-drawer");
    await expect(drawer.getByRole("heading", { name: "Create work order" })).toBeVisible();
    await expect(drawer.getByTestId("contractor-recommendation-card")).toBeVisible();
    await expect(drawer).toContainText(title);

    await drawer.locator("select").selectOption({ label: "Contractor A1" });
    await drawer.locator("textarea").fill("Escalated from maintenance inbox E2E flow.");
    await drawer.getByRole("button", { name: "Create work order" }).click();

    await expect(drawer).toBeHidden({ timeout: 20_000 });
    await expect(requestCard).toBeVisible({ timeout: 20_000 });
    await expect(requestCard).toContainText("Status: In progress");
    await expect(requestCard).toContainText("Work order: assigned");

    await page.goto("/maintenance-inbox?woStatus=assigned");
    await expect(page.getByTestId(`maintenance-request-card-${requestId}`)).toBeVisible({ timeout: 20_000 });

    await logout(page);
    await signInAs(page, seededUsers.contractorA1);
    await page.goto("/contractor");

    const contractorJob = page.getByTestId("contractor-work-order-card").filter({ hasText: title }).first();
    await expect(contractorJob).toBeVisible({ timeout: 20_000 });
    await expect(contractorJob).toContainText("Assigned");

    await contractorJob.getByRole("button", { name: "Start work" }).click();
    await expect(contractorJob).toContainText("In progress", { timeout: 20_000 });

    await contractorJob.getByRole("button", { name: "Complete work" }).click();
    await expect(contractorJob).toContainText("Completed", { timeout: 20_000 });

    await logout(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/maintenance-inbox?woStatus=completed");
    const completedRequestCard = page.getByTestId(`maintenance-request-card-${requestId}`);
    await expect(completedRequestCard).toBeVisible({ timeout: 20_000 });
    await expect(completedRequestCard).toContainText("Work order: completed");
  } finally {
    await admin.from("work_orders").delete().eq("maintenance_request_id", requestId);
    await admin.from("maintenance_requests").delete().eq("id", requestId);
  }
});
