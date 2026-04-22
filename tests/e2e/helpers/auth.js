/* global process */
import { expect } from "@playwright/test";
import { isolationFixtures } from "../../fixtures/isolationFixtures.js";

const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "OasisTest123!";

export const seededUsers = {
  ownerA: isolationFixtures.users.ownerA.email,
  rootOwner: isolationFixtures.users.rootOwner.email,
  tenantA1: isolationFixtures.users.tenantA1.email,
};

export const seededEntityIds = {
  propertyA: isolationFixtures.users.tenantA1.propertyId,
};

export async function prepareEnglishLocale(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("oasis_lang", "en");
  });
}

export async function signInAs(page, email) {
  await prepareEnglishLocale(page);
  await page.goto("/login");

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("main")).toBeVisible();
}
