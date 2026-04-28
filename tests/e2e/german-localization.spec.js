import { expect, test } from "@playwright/test";
import { seededUsers, signInAs } from "./helpers/auth.js";

test.describe("German localization", () => {
  test("public auth pages can switch to German and persist the locale", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => window.localStorage.removeItem("oasis_lang"));
    await page.reload();

    await page.getByLabel("Language").selectOption("de");

    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveAttribute("placeholder", "E-Mail");
    await expect(page.locator('input[type="password"]')).toHaveAttribute("placeholder", "Passwort");
    await expect(page.getByRole("link", { name: "Vermieterkonto erstellen" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("oasis_lang"))).toBe("de");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByLabel("Sprache")).toHaveValue("de");
  });

  test("authenticated landlord shell exposes German navigation labels", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);

    await page.getByLabel("Language").first().selectOption("de");

    await expect(page.getByLabel("Sprache").first()).toHaveValue("de");
    await expect(page.getByRole("link", { name: "Immobilien", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mieter", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Finanzen", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Portfolio-Zustand", exact: true })).toBeVisible();
  });
});
