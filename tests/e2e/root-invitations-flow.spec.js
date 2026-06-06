import { expect, test } from "@playwright/test";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test("root can open the invitations admin view and see scoped SaaS accounts", async ({ page }) => {
  await signInAs(page, seededUsers.rootOwner);

  await page.goto("/invitations");
  await expect(page).toHaveURL(/\/invitations$/);
  await expect(page.getByRole("heading", { name: "User invitations" })).toBeVisible();
  await expect(page.getByText("SaaS accounts (root)")).toBeVisible();
  await expect(
    page.locator("div.rounded-lg.border.border-slate-200").filter({ hasText: "Starlight Properties" }).first(),
  ).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, "root invitations admin");
});
