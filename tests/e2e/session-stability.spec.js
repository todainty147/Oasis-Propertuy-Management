import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

const PROPERTY_A_ID = seededEntityIds.propertyA;
const ACCOUNT_A_ID = isolationFixtures.accounts.accountA.id;

test.describe("Session stability — token refresh does not remount the shell", () => {
  test("maintenance form state survives a Supabase token refresh", async ({ page }) => {
    const admin = getIntegrationAdminClient();
    const stamp = Date.now();
    const testTitle = `E2E token-refresh stability ${stamp}`;

    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}?tab=maintenance`);

    await expect(
      page.getByRole("heading", { name: "11 Starlight Avenue" }),
    ).toBeVisible({ timeout: 20_000 });

    const titleInput = page.locator("#maintenance-request-title");
    await expect(titleInput).toBeVisible({ timeout: 10_000 });

    await titleInput.fill(testTitle);

    const descriptionInput = page.locator("#maintenance-request-description");
    await descriptionInput.fill("This entry must survive a session token refresh");

    const prioritySelect = page.locator("#maintenance-request-priority");
    await prioritySelect.selectOption("urgent");

    await page.evaluate(() => {
      window.__loadingFlashDetected = false;
      const observer = new MutationObserver(() => {
        const text = (document.body.innerText || "").trim();
        if (text === "Loading…" || text === "Loading...") {
          window.__loadingFlashDetected = true;
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      window.__loadingFlashObserver = observer;
    });

    const refreshResult = await page.evaluate(async () => {
      if (!window.__supabase_test) return { ok: false, reason: "no_test_handle" };
      const { error } = await window.__supabase_test.auth.refreshSession();
      return error ? { ok: false, reason: error.message } : { ok: true };
    });
    expect(refreshResult.ok, `refreshSession failed: ${refreshResult.reason}`).toBe(true);

    await page.waitForTimeout(1500);

    const flashDetected = await page.evaluate(() => {
      window.__loadingFlashObserver?.disconnect();
      return window.__loadingFlashDetected;
    });
    expect(flashDetected, "shell remounted with Loading... flash after token refresh").toBe(false);

    await expect(titleInput).toHaveValue(testTitle);
    await expect(descriptionInput).toHaveValue(
      "This entry must survive a session token refresh",
    );
    await expect(prioritySelect).toHaveValue("urgent");

    await expect(
      page.getByRole("heading", { name: "11 Starlight Avenue" }),
    ).toBeVisible();

    try {
      const formWrapper = page
        .locator("div")
        .filter({ has: page.locator("#maintenance-request-title") });
      await formWrapper.getByRole("button", { name: "Add", exact: true }).click();

      await expect(titleInput).toHaveValue("", { timeout: 15_000 });
      await expect(page.getByText(testTitle)).toBeVisible({ timeout: 10_000 });
    } finally {
      await admin
        .from("maintenance_requests")
        .delete()
        .eq("account_id", ACCOUNT_A_ID)
        .ilike("title", `%token-refresh stability ${stamp}%`);
    }
  });

  test("multiple rapid token refreshes do not destabilize the shell", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(
      page.getByRole("heading", { name: "Properties", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("11 Starlight Avenue")).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      window.__loadingFlashCount = 0;
      const observer = new MutationObserver(() => {
        const text = (document.body.innerText || "").trim();
        if (text === "Loading…" || text === "Loading...") {
          window.__loadingFlashCount += 1;
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      window.__loadingFlashObserver = observer;
    });

    const burstResult = await page.evaluate(async () => {
      if (!window.__supabase_test) return { ok: false, reason: "no_test_handle" };
      const results = [];
      for (let i = 0; i < 3; i++) {
        const { error } = await window.__supabase_test.auth.refreshSession();
        results.push(error ? error.message : "ok");
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: results.every((r) => r === "ok"), results };
    });
    expect(burstResult.ok, `burst refresh failed: ${JSON.stringify(burstResult.results)}`).toBe(true);

    await page.waitForTimeout(2000);

    const flashCount = await page.evaluate(() => {
      window.__loadingFlashObserver?.disconnect();
      return window.__loadingFlashCount;
    });
    expect(flashCount, `detected ${flashCount} Loading... flashes during burst refresh`).toBe(0);

    await expect(
      page.getByRole("heading", { name: "Properties", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("11 Starlight Avenue")).toBeVisible();
  });
});
