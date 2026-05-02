import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { prepareEnglishLocale } from "./helpers/auth.js";

async function signInWithPassword(page, email, password, { expectAccountShell = true } = {}) {
  await prepareEnglishLocale(page);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
  if (expectAccountShell) {
    await expect(page.getByRole("main")).toBeVisible();
  }
}

test("invited staff member accepts invite and lands in the scoped account", async ({ page }) => {
  const admin = getIntegrationAdminClient();
  const stamp = Date.now();
  const email = `invited.staff.${stamp}@oasis.test`;
  const temporaryPassword = "OasisTemp123!";
  const acceptedPassword = "OasisAccepted123!";
  const token = `e2e-invite-${randomUUID()}`;
  let userId = null;

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  expect(createUserError).toBeNull();
  userId = createdUser?.user?.id || null;
  expect(userId).toBeTruthy();

  const { error: inviteError } = await admin.from("account_invitations").insert({
    account_id: isolationFixtures.accounts.accountA.id,
    email,
    role: "staff",
    token,
  });
  expect(inviteError).toBeNull();

  try {
    await signInWithPassword(page, email, temporaryPassword, { expectAccountShell: false });
    await page.goto(`/invite?token=${encodeURIComponent(token)}`);

    await expect(page.getByRole("heading", { name: /Join workspace|Join your workspace/ })).toBeVisible();
    await page.getByRole("textbox", { name: "New password", exact: true }).fill(acceptedPassword);
    await page.getByRole("textbox", { name: /Confirm(?: new)? password/ }).fill(acceptedPassword);
    await page.getByRole("button", { name: /Set password and join|Complete setup/ }).click();

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 20_000 });
    await signInWithPassword(page, email, acceptedPassword);

    await expect(page.getByRole("link", { name: "Properties" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
    await page.goto("/tenants");
    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: /Search tenants/i }).fill("Tenant A1");
    await expect(page.getByRole("link", { name: "Tenant A1" })).toBeVisible();
    await expect(page.getByText("SaaS accounts (root)")).toHaveCount(0);
  } finally {
    await admin.from("account_members").delete().eq("user_id", userId);
    await admin.from("account_invitations").delete().eq("token", token);
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
});
