import { expect, test } from "@playwright/test";
import { prepareEnglishLocale, seededUsers, signInAs } from "./helpers/auth.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";

test.skip(!isIntegrationHarnessConfigured(), "Data privacy E2E requires local Supabase integration env.");

test("public data deletion page is accessible without login", async ({ page }) => {
  await prepareEnglishLocale(page);
  await page.goto("/privacy/delete-account");

  await expect(page.getByRole("heading", { name: /delete your oasis account/i })).toBeVisible();
  await expect(page.getByText(/some records may need to be retained or minimised/i)).toBeVisible();
  await expect(page.getByText(/we do not promise immediate deletion of all operational records/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /open in-app deletion path/i })).toHaveAttribute(
    "href",
    "/settings/data-privacy?request=user_account_deletion",
  );
});

test("alternate public data-deletion URL serves the app-store review page", async ({ page }) => {
  await prepareEnglishLocale(page);
  await page.goto("/data-deletion");

  await expect(page.getByRole("heading", { name: /delete your oasis account/i })).toBeVisible();
  await expect(page.getByText(/Privacy support: privacy@oasisrental\.app/i)).toBeVisible();
});

test("signed-in owner can open Data & Privacy and sees guarded deletion form", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/settings/data-privacy");

  await expect(page.getByRole("heading", { name: "Data & Privacy" })).toBeVisible();
  await expect(page.getByText(/some records may need to be retained/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /submit request/i })).toBeDisabled();

  const requestType = page.getByLabel(/request type/i);
  await requestType.selectOption("workspace_closure");
  await expect(requestType).toHaveValue("workspace_closure");
  await page.getByLabel(/type delete to confirm/i).fill("DELETE");
  await page.getByLabel(/I understand OASIS may retain/i).check();
  await expect(page.getByRole("button", { name: /submit request/i })).toBeEnabled();
});
