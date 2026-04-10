import { expect, test } from "@playwright/test";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

test("tenant sees the restricted surface and does not get manager-only property performance", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);

  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Invitations" })).toHaveCount(0);

  await page.getByRole("link", { name: "Finance" }).click();
  await expect(page).toHaveURL(/\/tenant\/payments$/);

  await page.goto(`/properties/${seededEntityIds.propertyA}`);
  await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible();
  await expect(page.getByText("Property performance")).toHaveCount(0);
  await expect(page.getByText("Custom property fields")).toBeVisible();
});
