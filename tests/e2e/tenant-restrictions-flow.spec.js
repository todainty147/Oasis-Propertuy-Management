import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

test("tenant sees the restricted surface and does not get manager-only property performance", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);

  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Your home overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tenant timeline" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Invitations" })).toHaveCount(0);

  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

  await page.getByRole("link", { name: "Finance" }).click();
  await expect(page).toHaveURL(/\/tenant\/payments$/);

  await page.goto("/properties");
  await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.getByText("Add your first property")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /11 Starlight Avenue/i })).toBeVisible();

  await page.goto(`/properties/${seededEntityIds.propertyA}`);
  await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible();
  await expect(page.getByText("Property performance")).toHaveCount(0);
  await expect(page.getByText("Custom property fields")).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "tenant property details");
});
