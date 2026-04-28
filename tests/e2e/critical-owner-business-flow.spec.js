import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner-created property and tenant appear in operational and finance views", async ({ page }) => {
  const admin = getIntegrationAdminClient();
  const { error: planError } = await admin
    .from("accounts")
    .update({ subscription_plan: "pro", subscription_status: "active", billing_locked_at: null })
    .eq("id", isolationFixtures.accounts.accountA.id);
  expect(planError).toBeNull();

  await signInAs(page, seededUsers.ownerA);

  const stamp = Date.now();
  const address = `E2E Release House ${stamp}`;
  const city = "Bristol";
  const size = "82 m2";
  const rent = "1875";
  const tenantName = `E2E Tenant ${stamp}`;
  const tenantEmail = `e2e.tenant.${stamp}@oasis.test`;
  const tenantPhone = "+447700900555";

  await page.goto("/properties");
  await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();

  const addPropertyButton = page.getByRole("button", { name: "Add property" });
  await expect(addPropertyButton).toBeEnabled();
  await addPropertyButton.click();

  const propertyModal = page.locator(".fixed").filter({ hasText: "Add property" });
  await expect(propertyModal.getByRole("heading", { name: "Add property" })).toBeVisible();
  await propertyModal.getByRole("textbox", { name: "Address", exact: true }).fill(address);
  await propertyModal.getByRole("textbox", { name: "City", exact: true }).fill(city);
  await propertyModal.getByRole("textbox", { name: /Size/i }).fill(size);
  await propertyModal.locator('input[type="number"]').fill(rent);
  await propertyModal.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Add property" })).toBeHidden();
  await page.goto(`/properties?q=${encodeURIComponent(address)}`);
  await expect(page.getByRole("link", { name: new RegExp(address, "i") })).toBeVisible();
  await expect(page.getByText(city)).toBeVisible();
  await expect(page.getByText("None").first()).toBeVisible();

  await page.goto("/tenants");
  await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add tenant" }).click();

  const tenantModal = page.locator(".fixed").filter({ hasText: "Add tenant" });
  await expect(tenantModal.getByRole("heading", { name: "Add tenant" })).toBeVisible();
  await tenantModal.getByLabel("Full name").fill(tenantName);
  await tenantModal.getByLabel("Email").fill(tenantEmail);
  await tenantModal.getByLabel("Phone").fill(tenantPhone);
  await tenantModal.getByLabel("Assigned property").selectOption({ label: `${address}, ${city}` });
  await tenantModal.getByRole("button", { name: "Save" }).click();

  await expect(tenantModal).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/tenants\?/);
  await expect(page.getByRole("link", { name: new RegExp(tenantName, "i") })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(tenantEmail)).toBeVisible();
  await expect(page.getByText(`${address}`)).toBeVisible();

  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
  await expect(page.getByText("Finance by property")).toBeVisible();
  await expect(page.getByText("No financial data.")).not.toBeVisible();
});
