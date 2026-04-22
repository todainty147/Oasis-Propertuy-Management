import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

test("tenant sees the restricted surface and does not get manager-only property performance", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);

  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);
  await expect(page.getByText("Tenant portal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your home overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tenant timeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent progress history" })).toBeVisible();
  await expect(page.getByText("Leaking tap")).toHaveCount(2);

  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Invitations" })).toHaveCount(0);

  await page.getByTestId("tenant-dashboard-open-payments").click();
  await expect(page).toHaveURL(/\/tenant\/payments(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
  await expect(page.getByTestId("tenant-payment-options-card")).toBeVisible();

  await page.goto("/tenant/home?horizon=week");
  await page.getByTestId("tenant-dashboard-open-documents").click();
  await expect(page).toHaveURL(/\/tenant\/documents(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Documents available" })).toBeVisible();

  await page.goto("/tenant/home?horizon=week");
  await page.getByTestId("tenant-dashboard-open-requests").click();
  await expect(page).toHaveURL(new RegExp(`/tenant/property/${seededEntityIds.propertyA}$`));
  await expect(page.getByText("Custom property fields")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);

  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);

  await page.getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/\/tenant\/payments(?:\?.*)?$/);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/tenant\/profile(?:\?.*)?$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Profile" })).toBeVisible();

  await page.goto("/properties");
  await expect(page).toHaveURL(/\/tenant\/property(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.getByText("Add your first property")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /11 Starlight Avenue/i })).toBeVisible();

  await page.goto(`/properties/${seededEntityIds.propertyA}`);
  await expect(page).toHaveURL(new RegExp(`/tenant/property/${seededEntityIds.propertyA}$`));
  await expect(page.getByText("Property performance")).toHaveCount(0);
  await expect(page.getByText("Custom property fields")).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "tenant property details");
});

test("tenant dashboard actions remain usable on mobile width", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tenant/home?horizon=week");

  await expect(page.getByRole("heading", { name: "Your home overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent progress history" })).toBeVisible();
  await expect(page.getByTestId("tenant-dashboard-open-payments")).toBeVisible();
  await expect(page.getByTestId("tenant-dashboard-open-requests")).toBeVisible();
  await expect(page.getByTestId("tenant-dashboard-open-documents")).toBeVisible();

  await page.getByTestId("tenant-dashboard-open-documents").click();
  await expect(page).toHaveURL(/\/tenant\/documents(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Documents available" })).toBeVisible();
});
