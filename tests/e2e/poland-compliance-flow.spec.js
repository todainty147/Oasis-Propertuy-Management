// tests/e2e/poland-compliance-flow.spec.js
//
// E2E tests for the Poland Compliance page (/compliance/poland).
//
// Strategy:
//   - Sets account A to Growth plan via admin so POLAND_COMPLIANCE entitlement is active.
//   - Route-mocks all compliance_checklist_items and new RPC calls so the test is
//     independent of whether poland_compliance_foundation.sql has been applied to
//     the local Supabase.  All existing table/RPC calls (properties, tenants,
//     leases, auth) use the real local harness as usual.
//   - Restores the original plan in afterEach to avoid polluting other test files.

import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_A  = isolationFixtures.accounts.accountA.id;
const PROPERTY_A = "44444444-4444-4444-4444-444444444441"; // from isolationFixtures tenantA1.propertyId

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

// ── Shared data (stable UUIDs for mock responses) ──────────────────────
const MOCK_PROPERTY_ID = PROPERTY_A;
const MOCK_TENANT_ID   = "44444444-4444-4444-4444-444444444481";
const MOCK_LEASE_ID    = "55555555-5555-5555-5555-555555555521";

function makeChecklistItem(key, overrides = {}) {
  return {
    id:                   `cci-${key}-uuid`,
    account_id:           ACCOUNT_A,
    property_id:          MOCK_PROPERTY_ID,
    tenant_id:            MOCK_TENANT_ID,
    lease_id:             MOCK_LEASE_ID,
    market:               "pl",
    checklist_type:       "najem_okazjonalny",
    item_key:             key,
    title:                titleForKey(key),
    description:          null,
    status:               "pending",
    due_date:             key.includes("deadline") ? "2026-05-15" : null,
    completed_at:         null,
    completed_by:         null,
    evidence_document_id: null,
    metadata:             {},
    created_at:           new Date().toISOString(),
    updated_at:           new Date().toISOString(),
    ...overrides,
  };
}

function titleForKey(key) {
  const titles = {
    lease_agreement:         "Umowa najmu okazjonalnego",
    notarial_declaration:    "Oświadczenie notarialne najemcy",
    alternative_address_decl:"Oświadczenie o adresie zastępczym najemcy",
    owner_consent:           "Zgoda właściciela nieruchomości zastępczej",
    tax_office_notification: "Zgłoszenie do urzędu skarbowego",
    tax_office_deadline:     "Termin zgłoszenia do US (14 dni od zawarcia umowy)",
    tax_office_proof:        "Dowód złożenia zgłoszenia do urzędu skarbowego",
    handover_protocol:       "Protokół zdawczo-odbiorczy",
    deposit_confirmation:    "Potwierdzenie wpłaty kaucji",
    meter_readings:          "Odczyty liczników",
  };
  return titles[key] || key;
}

const MOCK_CHECKLIST_ITEMS = [
  "lease_agreement", "notarial_declaration", "alternative_address_decl",
  "owner_consent", "tax_office_notification", "tax_office_deadline",
  "tax_office_proof", "handover_protocol", "deposit_confirmation", "meter_readings",
].map(makeChecklistItem);

// ── Helpers ───────────────────────────────────────────────────────────────

async function setAccountPlan(admin, plan) {
  await admin
    .from("accounts")
    .update({ subscription_plan: plan, subscription_status: "active" })
    .eq("id", ACCOUNT_A);
}

// Installs route mocks for all Poland-compliance-specific API calls.
// Properties/tenants/leases use the real DB; checklist calls are mocked.
async function installPlMocks(page, checklistItems = MOCK_CHECKLIST_ITEMS) {
  // Mock compliance_checklist_items table reads
  await page.route("**/rest/v1/compliance_checklist_items*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(checklistItems),
      });
    } else if (route.request().method() === "PATCH") {
      // Return the patched item (we don't need exact shape for E2E assertions)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ ...checklistItems[0], status: "complete" }]),
      });
    } else {
      await route.continue();
    }
  });

  // Mock setup RPC
  await page.route("**/rpc/setup_najem_okazjonalny_checklist", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ created: 10, skipped: 0, total: 10 }),
    });
  });

  // Mock PL command center helper (graceful no-op)
  await page.route("**/rpc/pl_compliance_checklist_command_items", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock notify RPC
  await page.route("**/rpc/notify_pl_compliance_deadlines", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notified: 0 }),
    });
  });
}

async function selectMainPropertyAndTenant(page) {
  const selects = page.getByRole("main").locator("select");
  const propSelect = selects.nth(0);
  const tenantSelect = selects.nth(1);
  await propSelect.selectOption({ index: 1 });
  await expect(tenantSelect).not.toBeDisabled({ timeout: 5_000 });
  await tenantSelect.selectOption({ index: 1 });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Poland Compliance page — navigation and access control", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("Poland Compliance page loads for Growth plan owner with PL country_code", async ({ page }) => {
    await setAccountPlan(admin, "growth");
    await installPlMocks(page);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page).not.toHaveURL(/\/login/);

    // Page title should be visible
    await expect(
      page.getByRole("heading", { name: /Poland Compliance|Zgodność z prawem/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("disclaimer banner is visible on page load", async ({ page }) => {
    await setAccountPlan(admin, "growth");
    await installPlMocks(page);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");

    // Disclaimer text contains safe wording
    const disclaimer = page.locator("text=/helps track|pomaga śledzić/i").first();
    await expect(disclaimer).toBeVisible({ timeout: 10_000 });
  });

  test("Starter plan account sees upgrade/feature access prompt at /compliance/poland", async ({ page }) => {
    await setAccountPlan(admin, "starter");
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");

    // The EntitledRoute guard renders FeatureAccessCard for insufficient plan
    await expect(
      page.getByText(/upgrade|plan|growth|requires/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Tenant cannot access /compliance/poland — redirected", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);

    await page.goto("/compliance/poland");

    // Tenant session redirects to tenant area or dashboard
    await expect(page).not.toHaveURL(/\/compliance\/poland(?:\?.*)?$/);
  });
});

test.describe("Poland Compliance page — filter UI", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
    await setAccountPlan(admin, "growth");
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("property and tenant selectors are visible", async ({ page }) => {
    await installPlMocks(page, []);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    // Both selectors should be present
    const mainSelects = page.getByRole("main").locator("select");
    const propSelect = mainSelects.nth(0);
    const leaseSelect = mainSelects.nth(2); // third select is lease type
    await expect(propSelect).toBeVisible();
    await expect(leaseSelect).toBeVisible();
  });

  test("shows 'no selection' prompt when no property is chosen", async ({ page }) => {
    await installPlMocks(page, []);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    // Before selecting property+tenant, should show the no-selection hint
    await expect(
      page.getByText(/Select a property and tenant|Wybierz nieruchomość i najemcę/i),
    ).toBeVisible();
  });

  test("lease type defaults to Najem Okazjonalny", async ({ page }) => {
    await installPlMocks(page, []);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    const leaseTypeSelect = page.getByRole("main").locator("select").nth(2);
    await expect(leaseTypeSelect).toHaveValue("najem_okazjonalny");
  });
});

test.describe("Poland Compliance page — checklist setup flow", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
    await setAccountPlan(admin, "growth");
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("shows 'Set up checklist' button when no checklist items exist", async ({ page }) => {
    await installPlMocks(page, []); // empty checklist
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // 'Set up checklist' button should appear
    await expect(
      page.getByRole("button", { name: /Set up checklist|Utwórz listę/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows 10 checklist items after setup", async ({ page }) => {
    // Return empty initially, then 10 items after setup call
    let callCount = 0;
    await page.route("**/rest/v1/compliance_checklist_items*", async (route) => {
      if (route.request().method() === "GET") {
        callCount++;
        const items = callCount <= 1 ? [] : MOCK_CHECKLIST_ITEMS;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(items),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/rpc/setup_najem_okazjonalny_checklist", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ created: 10, skipped: 0, total: 10 }),
      });
    });

    await page.route("**/rpc/pl_compliance_checklist_command_items", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.route("**/rpc/notify_pl_compliance_deadlines", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notified: 0 }) });
    });

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // Click setup button
    const setupBtn = page.getByRole("button", { name: /Set up checklist|Utwórz listę/i });
    await expect(setupBtn).toBeVisible({ timeout: 8_000 });
    await setupBtn.click();

    // Checklist title should appear
    await expect(
      page.getByText(/Najem Okazjonalny checklist|Lista kontrolna/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("poland-summary-total").getByText("10")).toBeVisible({ timeout: 5_000 });
  });

  test("checklist items show correct titles", async ({ page }) => {
    await installPlMocks(page, MOCK_CHECKLIST_ITEMS);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // Key checklist items should be visible
    await expect(page.getByText("Umowa najmu okazjonalnego").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Oświadczenie notarialne najemcy").first()).toBeVisible();
    await expect(page.getByText("Protokół zdawczo-odbiorczy").first()).toBeVisible();
  });
});

test.describe("Poland Compliance page — status transitions", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
    await setAccountPlan(admin, "growth");
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("'Mark complete' button is visible for pending items", async ({ page }) => {
    await installPlMocks(page, MOCK_CHECKLIST_ITEMS);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // At least one 'Mark complete' button should be visible
    const markCompleteBtn = page.getByRole("button", { name: /Mark complete|Wykonane/i }).first();
    await expect(markCompleteBtn).toBeVisible({ timeout: 10_000 });
  });

  test("'Not applicable' button is visible for pending items", async ({ page }) => {
    await installPlMocks(page, MOCK_CHECKLIST_ITEMS);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    const naBtn = page.getByRole("button", { name: /Not applicable|Nie dotyczy/i }).first();
    await expect(naBtn).toBeVisible({ timeout: 10_000 });
  });

  test("overdue item shows overdue badge", async ({ page }) => {
    const overdueItems = MOCK_CHECKLIST_ITEMS.map((item) =>
      item.item_key === "tax_office_deadline"
        ? { ...item, due_date: "2000-01-01" } // clearly overdue
        : item,
    );
    await installPlMocks(page, overdueItems);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // Overdue badge should appear
    await expect(
      page.getByText(/Overdue|Zaległe/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("completed items show 'Undo' / 'Cofnij' button instead of 'Mark complete'", async ({ page }) => {
    const allComplete = MOCK_CHECKLIST_ITEMS.map((item) => ({
      ...item,
      status:       "complete",
      completed_at: new Date().toISOString(),
    }));
    await installPlMocks(page, allComplete);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    // 'Undo'/'Cofnij' buttons for completed items
    const undoBtn = page.getByRole("button", { name: /Undo|Cofnij/i }).first();
    await expect(undoBtn).toBeVisible({ timeout: 10_000 });

    // 'Mark complete' should NOT be visible (all already complete)
    await expect(
      page.getByRole("button", { name: /Mark complete|Wykonane/i }).first(),
    ).not.toBeVisible();
  });
});

test.describe("Poland Compliance page — summary bar", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
    await setAccountPlan(admin, "growth");
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("summary bar shows correct counts for mixed-status items", async ({ page }) => {
    const mixedItems = MOCK_CHECKLIST_ITEMS.map((item, idx) => ({
      ...item,
      status: idx < 3 ? "complete" : idx < 5 ? "not_applicable" : "pending",
    }));
    await installPlMocks(page, mixedItems);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    await expect(page.getByTestId("poland-summary-total").getByText("10")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("poland-summary-complete").getByText("3")).toBeVisible();
  });
});

test.describe("Poland Compliance page — mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
    await setAccountPlan(admin, "growth");
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("page renders without horizontal overflow on mobile", async ({ page }) => {
    await installPlMocks(page, []);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    const scrollWidth  = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth  = await page.evaluate(() => document.body.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
  });

  test("disclaimer is readable on mobile viewport", async ({ page }) => {
    await installPlMocks(page, []);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");

    await expect(
      page.getByText(/helps track|pomaga śledzić/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("checklist items are readable on mobile viewport", async ({ page }) => {
    await installPlMocks(page, MOCK_CHECKLIST_ITEMS);
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/compliance/poland");
    await expect(page.getByRole("heading", { name: /Poland Compliance|Zgodność/i })).toBeVisible({ timeout: 10_000 });

    await selectMainPropertyAndTenant(page);

    await expect(page.getByText("Umowa najmu okazjonalnego").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Poland Compliance — sidebar nav visibility", () => {
  let admin;
  let originalPlan;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", ACCOUNT_A)
      .single();
    originalPlan = data?.subscription_plan || "starter";
  });

  test.afterAll(async () => {
    if (admin) await setAccountPlan(admin, originalPlan);
  });

  test("Poland Compliance nav item visible for PL market Growth account", async ({ page }) => {
    await setAccountPlan(admin, "growth");
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });

    // Nav link to /compliance/poland should be visible (PL country_code account)
    const navItem = page.locator('a[href="/compliance/poland"]');
    await expect(navItem).toBeVisible({ timeout: 5_000 });
  });

  test("UK market account does NOT see Poland Compliance nav item", async ({ page }) => {
    // Temporarily set UK country_code
    await admin.from("accounts").update({ country_code: "GB" }).eq("id", ACCOUNT_A);
    await setAccountPlan(admin, "growth");

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/dashboard");
      await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });

      const navItem = page.locator('a[href="/compliance/poland"]');
      await expect(navItem).not.toBeVisible();
    } finally {
      // Restore PL country_code
      await admin.from("accounts").update({ country_code: "PL" }).eq("id", ACCOUNT_A);
    }
  });

  test("existing compliance nav items (Tax Tools, Rent Shield) remain visible for Growth account", async ({ page }) => {
    await setAccountPlan(admin, "growth");
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });

    // Existing compliance items must still be present (regression guard)
    await expect(page.locator('a[href="/compliance/tax-tools"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /Rent Shield/i })).toBeVisible();
  });

  test("Renters' Rights nav item is still visible for Growth account (UK compliance not removed)", async ({ page }) => {
    await setAccountPlan(admin, "growth");
    await signInAs(page, seededUsers.ownerA);

    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });

    // Renters' Rights must not be removed by Poland Compliance additions
    await expect(
      page.getByRole("link", { name: /Renters' Rights|Prawa najemcy/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
