import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

test("tenant sees the restricted surface and does not get manager-only property performance", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);

  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Your tenancy space" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to your tenant portal" })).toBeVisible();
  await expect(page.getByText("Quick links")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Lease", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Repairs", exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Invitations" })).toHaveCount(0);

  await page.getByRole("main").getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/tenant\/payments(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
  await expect(page.getByTestId("tenant-payment-options-card")).toBeVisible();

  await page.goto("/tenant/home?horizon=week");
  await page.getByRole("main").getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/\/tenant\/documents(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Documents available" })).toBeVisible();

  await page.goto("/tenant/home?horizon=week");
  await page.getByRole("main").getByRole("link", { name: "Repairs", exact: true }).click();
  await expect(page).toHaveURL(/\/tenant\/maintenance(?:\?.*)?$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);

  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);

  await page.getByRole("complementary").getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/\/tenant\/payments(?:\?.*)?$/);
  await page.getByRole("complementary").getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/tenant\/profile(?:\?.*)?$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Profile" })).toBeVisible();

  await signInAs(page, seededUsers.tenantA1);
  await page.goto("/properties");
  await expect(page).toHaveURL(/\/tenant\/property(?:\?.*)?$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "My home", exact: true })).toBeVisible();
  await expect(page.getByText("Add your first property")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /11 Starlight Avenue/i })).toBeVisible();

  await page.goto(`/properties/${seededEntityIds.propertyA}`);
  await expect(page).toHaveURL(/\/tenant\/property(?:\?.*)?$/);
  await expect(page.getByText("Property performance")).toHaveCount(0);
  await expect(page.getByText("This is a tenant-safe view.")).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "tenant property details");
});

test("tenant dashboard actions remain usable on mobile width", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tenant/home?horizon=week");

  await expect(page.getByRole("heading", { name: "Welcome to your tenant portal" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Payments", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Repairs", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Documents", exact: true })).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/\/tenant\/documents(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Documents available" })).toBeVisible();
});
