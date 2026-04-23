import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

async function expectLandlordTenantAccess(page, email) {
  await signInAs(page, email);

  await expect(page.getByRole("link", { name: "Properties" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();

  await page.getByRole("link", { name: "Tenants" }).click();
  await expect(page).toHaveURL(/\/tenants(?:\?.*)?$/);
  await expect(page.locator("main h2").filter({ hasText: /^Tenants$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tenant A1/i })).toBeVisible();

  await page.getByRole("link", { name: "Properties" }).click();
  await expect(page).toHaveURL(/\/properties(?:\?.*)?$/);
  await expect(page.getByText("11 Starlight Avenue")).toBeVisible();
}

[
  ["owner", seededUsers.ownerA],
  ["admin", seededUsers.adminA],
  ["staff", seededUsers.staffA],
].forEach(([roleLabel, email]) => {
  test(`${roleLabel} can read tenants from the landlord sidebar`, async ({ page }) => {
    await expectLandlordTenantAccess(page, email);
  });
});

test("root support can switch into a landlord account and read tenants", async ({ page }) => {
  await signInAs(page, seededUsers.rootOwner);

  const accountSwitcher = page.getByLabel("Account").first();
  await expect(accountSwitcher).toBeVisible();
  await accountSwitcher.selectOption(isolationFixtures.accounts.accountA.id);

  await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
  await page.getByRole("link", { name: "Tenants" }).click();
  await expect(page).toHaveURL(/\/tenants(?:\?.*)?$/);
  await expect(page.getByRole("link", { name: /Tenant A1/i })).toBeVisible();
});

test("tenant navigation stays tenant-scoped and never exposes the tenant directory", async ({ page }) => {
  await signInAs(page, seededUsers.tenantA1);

  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);
  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My home" })).toBeVisible();

  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/tenant\/home(?:\?.*)?$/);

  await page.getByRole("link", { name: "My home" }).click();
  await expect(page).toHaveURL(/\/tenant\/property(?:\?.*)?$/);
  await expect(page.getByText("11 Starlight Avenue")).toBeVisible();
});

test("contractor navigation stays on the contractor portal and blocks landlord directories", async ({ page }) => {
  await signInAs(page, seededUsers.contractorA1);

  await expect(page).toHaveURL(/\/contractor(?:\?.*)?$/);
  await expect(page.getByRole("link", { name: "Contractor Portal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tenants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Properties" })).toHaveCount(0);

  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/contractor(?:\?.*)?$/);

  await page.goto("/properties");
  await expect(page).toHaveURL(/\/contractor(?:\?.*)?$/);
});
