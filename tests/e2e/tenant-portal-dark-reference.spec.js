import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { seededUsers, signInAs } from "./helpers/auth.js";

const screenshotDir = path.resolve(process.cwd(), "tmp/marketing-reference");

test.use({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 1,
});

test("captures the tenant portal dark-mode reference state", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });

  await page.addInitScript(() => {
    window.localStorage.setItem("oasis_theme_pref", "dark");
    window.localStorage.setItem("oasis_lang", "en");
  });

  await signInAs(page, seededUsers.tenantA1);
  await page.goto("/tenant/home");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Your tenancy space" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to your tenant portal" })).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotDir, "tenant-portal-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
});
