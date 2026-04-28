import { expect, test } from "@playwright/test";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("owner-configured payment setup appears in the standalone tenant portal", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/finance");

  const settingsCard = page.getByTestId("payment-collection-settings-card");
  const readinessCard = page.getByTestId("payment-collection-readiness-card");
  const previewCard = page.getByTestId("payment-collection-preview-card");
  await expect(settingsCard).toBeVisible();
  await expect(readinessCard).toBeVisible();
  await expect(previewCard).toBeVisible();

  await page.getByLabel("Collection method").selectOption("external_portal");
  await page.getByRole("checkbox", { name: "Bank transfer" }).check();
  await page.getByRole("checkbox", { name: "Card via external portal" }).check();
  await page.getByLabel("External payment portal URL").fill("https://payments.example.test/pay");
  await page.getByLabel("Tenant instructions").fill("Use your tenancy reference and follow the payment link for card payments.");
  await page.getByLabel("Billing / support email").fill("billing@example.test");
  await page.getByLabel("Autopay availability").selectOption("external");
  await page.getByLabel("Autopay instructions").fill("Contact the landlord team to set up a standing order outside OASIS.");
  await page.getByRole("button", { name: "Save payment setup" }).click();

  await expect(page.getByText("Tenant payment settings saved.")).toBeVisible();
  await expect(readinessCard).toContainText("Payment setup is ready for the tenant portal");
  await expect(previewCard).toContainText("Use the external payment portal");
  await expect(previewCard).toContainText("billing@example.test");

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.tenantA1);

  await page.goto("/tenant/payments");
  await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
  await expect(page.getByText("Use the external payment portal")).toBeVisible();
  await expect(page.getByText("Bank transfer")).toBeVisible();
  await expect(page.getByText("Card via external portal")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open payment portal" })).toHaveAttribute("href", "https://payments.example.test/pay");
  await expect(page.getByText("Autopay is available outside OASIS")).toBeVisible();
  await expect(page.getByText("Contact the landlord team to set up a standing order outside OASIS.")).toBeVisible();
  await expect(page.getByText("Need help with payment? Contact billing@example.test.")).toBeVisible();
});
