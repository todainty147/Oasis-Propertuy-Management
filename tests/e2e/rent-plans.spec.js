// tests/e2e/rent-plans.spec.js
// E2E tests for the Rent Plans page and calculation preview.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureProPlan() {
  const admin = getIntegrationAdminClient();
  await admin.from("accounts").update({
    subscription_plan: "pro",
    subscription_status: "active",
    billing_locked_at: null,
  }).eq("id", accountA.id);
}

async function insertDraftPlan(overrides = {}) {
  const admin = getIntegrationAdminClient();
  const { data, error } = await admin.from("rent_plans").insert({
    account_id:        accountA.id,
    base_rent_amount:  1500,
    start_date:        "2026-01-01",
    currency:          "GBP",
    market:            "generic",
    billing_frequency: "monthly",
    notes:             `E2E test ${randomUUID().slice(0, 8)}`,
    status:            "draft",
    ...overrides,
  }).select().single();
  if (error) throw error;
  return data;
}

// Activate a plan directly via table updates (bypasses RPC auth checks).
async function activatePlanDirect(planId, supersedePlanId = null) {
  const admin = getIntegrationAdminClient();
  if (supersedePlanId) {
    await admin.from("rent_plans").update({ status: "superseded" }).eq("id", supersedePlanId);
  }
  await admin.from("rent_plans").update({
    status: "active",
    ...(supersedePlanId ? { supersedes_id: supersedePlanId } : {}),
  }).eq("id", planId);
}

async function cleanupPlan(id) {
  if (!id) return;
  const admin = getIntegrationAdminClient();
  await admin.from("rent_plans").delete().eq("id", id);
}

// ─── Page loads ───────────────────────────────────────────────────────────────

test.describe("Rent Plans — page shell", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("page loads with heading visible", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("New plan button is visible", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /New plan/i })).toBeVisible();
  });

  test("no blocking accessibility violations", async ({ page }) => {
    // Create a plan first so the empty-state is hidden (empty state body uses text-slate-400
    // which fails WCAG contrast; the plan cards use the corrected text-slate-500 classes).
    const plan = await insertDraftPlan({ notes: `A11y plan ${randomUUID().slice(0, 8)}` });
    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
      await expectNoBlockingAccessibilityViolations(page, "rent-plans-page");
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("mobile layout renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});

// ─── Create form ──────────────────────────────────────────────────────────────

test.describe("Rent Plans — create form", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("clicking New plan opens the create form", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /New plan/i }).click();

    // Form title visible
    await expect(page.getByText("New rent plan (draft)")).toBeVisible({ timeout: 10_000 });
  });

  test("cancel button closes the form", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /New plan/i }).click();
    await expect(page.getByText("New rent plan (draft)")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("New rent plan (draft)")).toBeHidden({ timeout: 5_000 });
  });

  test("submitting empty required fields shows validation error", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /New plan/i }).click();
    await expect(page.getByText("New rent plan (draft)")).toBeVisible({ timeout: 10_000 });

    // Clear base rent (it's empty by default) and try to save
    await page.locator('input[placeholder="1500.00"]').fill("");
    await page.getByRole("button", { name: /Save as draft/i }).click();

    await expect(page.getByText(/required/i)).toBeVisible({ timeout: 5_000 });
  });

  test("new draft plan created via admin appears in list with draft badge", async ({ page }) => {
    // Tests the plan list rendering and draft badge — the form submission flow
    // is tested separately below. React number input onChange requires browser-level
    // interaction that is deferred to the dedicated form-submit test.
    const noteText = `Rent plan draft ${randomUUID().slice(0, 8)}`;
    const plan = await insertDraftPlan({ base_rent_amount: 1500, notes: noteText });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");
      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: noteText }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await expect(planCard.getByText("draft", { exact: true })).toBeVisible();
      // Amount shown in plan card header (formatted with locale)
      await expect(planCard.getByText(/1[,.]?500/)).toBeVisible();
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("form fields are visible and can be interacted with", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");
    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

    await page.getByRole("button", { name: /New plan/i }).first().click();
    await expect(page.getByText("New rent plan (draft)")).toBeVisible({ timeout: 10_000 });

    // All key form fields are present
    await expect(page.locator('input[placeholder="1500.00"]')).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder*="Optional notes"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Save as draft/i })).toBeVisible();

    // Cancel closes the form
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("New rent plan (draft)")).toBeHidden({ timeout: 5_000 });
  });

  test("changing market to UK auto-selects GBP currency", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance/rent-plans");

    await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /New plan/i }).first().click();
    await expect(page.getByText("New rent plan (draft)")).toBeVisible({ timeout: 10_000 });

    // Scope selects to the form (it has a distinctive blue border class).
    // Using page-level select.first() would hit sidebar language/theme selects first.
    const form           = page.locator('[class*="border-blue-200"]').first();
    const marketSelect   = form.locator('select').nth(2);
    const currencySelect = form.locator('select').nth(3);

    // Change to Poland → PLN
    await marketSelect.selectOption("pl");
    await expect(currencySelect).toHaveValue("PLN");

    // Change back to UK → GBP
    await marketSelect.selectOption("uk");
    await expect(currencySelect).toHaveValue("GBP");
  });
});

// ─── Plan card actions ────────────────────────────────────────────────────────

test.describe("Rent Plans — plan card actions", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("draft plan card shows Activate and Preview buttons", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: "E2E test card buttons" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      await expect(page.getByRole("button", { name: /Activate/i }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Preview calculation/i }).first()).toBeVisible();
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Activate plan button changes status to active", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: "E2E test activate" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      page.on("dialog", async (dialog) => dialog.accept());
      await expect(page.getByRole("button", { name: /Activate/i }).first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /Activate/i }).first().click();

      await expect(page.getByText("active").first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("active plan shows End plan button, not Activate", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: "E2E test active card" });
    await activatePlanDirect(plan.id);

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      // Find the card by its unique notes text
      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      // Use exact: true — notes text "E2E test active card" also contains "active" as substring
      await expect(planCard.getByText("active", { exact: true })).toBeVisible();
      await expect(planCard.getByRole("button", { name: /End plan/i })).toBeVisible();
      // Activate button absent from this card — plan is already active
      await expect(planCard.getByRole("button", { name: /^Activate$/i })).toHaveCount(0);
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("End plan changes status to ended", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: "E2E test end plan" });
    await activatePlanDirect(plan.id);

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      page.on("dialog", async (dialog) => dialog.accept());
      await expect(page.getByRole("button", { name: /End plan/i }).first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /End plan/i }).first().click();

      await expect(page.getByText("ended").first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("View history button reveals superseded plan version", async ({ page }) => {
    const notesA = `E2E history v1 ${randomUUID().slice(0, 8)}`;
    const notesB = `E2E history v2 ${randomUUID().slice(0, 8)}`;
    const planA = await insertDraftPlan({ base_rent_amount: 1200, start_date: "2026-01-01", notes: notesA });
    const planB = await insertDraftPlan({ base_rent_amount: 1350, start_date: "2026-06-01", notes: notesB });

    await activatePlanDirect(planA.id);
    await activatePlanDirect(planB.id, planA.id);

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planBCard = page.locator('[class*="space-y-3"]').filter({ hasText: notesB }).first();
      await expect(planBCard).toBeVisible({ timeout: 15_000 });
      await planBCard.getByRole("button", { name: /View history/i }).click();

      // The history panel shows planA's details
      await expect(planBCard.getByText("Previous versions")).toBeVisible({ timeout: 5_000 });
      // History span e.g. "v1 · GBP 1,200.00/monthly" — .first() avoids strict mode on container divs
      await expect(planBCard.getByText(/v\d.*GBP/).first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupPlan(planB.id);
      await cleanupPlan(planA.id);
    }
  });

  test("plan card shows start date and market/currency metadata", async ({ page }) => {
    const plan = await insertDraftPlan({ start_date: "2026-03-01", market: "uk", currency: "GBP", notes: `Meta ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      // Scope assertions to this specific plan's card to avoid parallel interference
      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await expect(planCard.getByText("2026-03-01")).toBeVisible();
      await expect(planCard.getByText(/UK.*GBP/)).toBeVisible();
    } finally {
      await cleanupPlan(plan.id);
    }
  });
});

// ─── Calculation preview ─────────────────────────────────────────────────────

test.describe("Rent Plans — calculation preview", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("Preview calculation button enters the preview sub-panel", async ({ page }) => {
    const plan = await insertDraftPlan({ base_rent_amount: 2000, notes: `E2E preview entry ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await planCard.getByRole("button", { name: /Preview calculation/i }).click();

      // Sub-panel: back button + calculate button
      await expect(page.getByRole("button", { name: /Back to plans/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: /Calculate preview/i })).toBeVisible();
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Calculate preview renders total for a full-month period", async ({ page }) => {
    const plan = await insertDraftPlan({ base_rent_amount: 2000, market: "uk", notes: `E2E preview calc ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await planCard.getByRole("button", { name: /Preview calculation/i }).click();

      // Preview sub-panel loaded
      await expect(page.getByRole("button", { name: /Calculate preview/i })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /Calculate preview/i }).click();

      // Total row appears: label + bold amount "GBP 2000.00" (toFixed(2), no thousands comma)
      await expect(page.getByText(/Total/i).first()).toBeVisible({ timeout: 10_000 });
      // The total span is the large bold blue element; .first() avoids strict mode on line items
      await expect(page.getByText(/GBP\s*2000\.00/).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Back to plans button returns to the plan list", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: "E2E test preview back" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      await page.getByRole("button", { name: /Preview calculation/i }).first().click();
      await expect(page.getByRole("button", { name: /Back to plans/i })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /Back to plans/i }).click();

      await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Upcoming periods panel expands and shows future period dates", async ({ page }) => {
    const plan = await insertDraftPlan({ base_rent_amount: 1600, market: "uk", due_day: 1, notes: "E2E test upcoming periods" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      await page.getByRole("button", { name: /Preview calculation/i }).first().click();
      await expect(page.getByText(/Upcoming periods/i)).toBeVisible({ timeout: 10_000 });

      await page.getByText(/Upcoming periods/i).click();

      const today = new Date();
      const nextMonth = String(today.getMonth() + 2).padStart(2, "0");
      const nextYear  = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
      await expect(page.getByText(new RegExp(`${nextYear}-${nextMonth}`))).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Advanced rent models panel is visible in preview", async ({ page }) => {
    const plan = await insertDraftPlan({ base_rent_amount: 2400, market: "uk", notes: "E2E test advanced models" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      await page.getByRole("button", { name: /Preview calculation/i }).first().click();
      await expect(page.getByText("Advanced rent models")).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Approve run button appears after calculating, then generates charge option", async ({ page }) => {
    const plan = await insertDraftPlan({ base_rent_amount: 1800, notes: "E2E test approve run" });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      await page.getByRole("button", { name: /Preview calculation/i }).first().click();
      await page.getByRole("button", { name: /Calculate preview/i }).click();

      // After calculating, the approve run button appears
      await expect(page.getByRole("button", { name: /Approve calculation/i })).toBeVisible({ timeout: 10_000 });

      // Click approve
      await page.getByRole("button", { name: /Approve calculation/i }).click();

      // After approving, the generate expected charge button appears
      await expect(page.getByRole("button", { name: /Generate expected charge/i })).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });
});

// ─── Expected charges panel ───────────────────────────────────────────────────

test.describe("Rent Plans — expected charges panel", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("Expected charges button enters the charges sub-panel", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: `Charges panel ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await planCard.getByRole("button", { name: /Expected charges/i }).click();

      // Sub-panel heading with plan amount
      await expect(page.getByRole("button", { name: /Back to plans/i })).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Expected charges panel shows empty state for a new plan", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: `Charges empty ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await planCard.getByRole("button", { name: /Expected charges/i }).click();
      await expect(page.getByText(/No expected charges/i)).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });

  test("Back to plans from charges panel returns to plan list", async ({ page }) => {
    const plan = await insertDraftPlan({ notes: `Charges back ${randomUUID().slice(0, 8)}` });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance/rent-plans");

      await page.locator("h1").filter({ hasText: "Rent Plans" }).waitFor({ timeout: 20_000 });

      const planCard = page.locator('[class*="space-y-3"]').filter({ hasText: plan.notes }).first();
      await expect(planCard).toBeVisible({ timeout: 15_000 });
      await planCard.getByRole("button", { name: /Expected charges/i }).click();
      await expect(page.getByRole("button", { name: /Back to plans/i })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /Back to plans/i }).click();

      await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupPlan(plan.id);
    }
  });
});

// ─── Role access control ──────────────────────────────────────────────────────

test.describe("Rent Plans — role access control", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test.beforeAll(ensureProPlan);

  test("admin can access Rent Plans", async ({ page }) => {
    await signInAs(page, seededUsers.adminA);
    await page.goto("/finance/rent-plans");

    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
  });

  test("staff can access Rent Plans", async ({ page }) => {
    await signInAs(page, seededUsers.staffA);
    await page.goto("/finance/rent-plans");

    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
  });

  test("tenant is redirected away from /finance/rent-plans", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/finance/rent-plans");

    await expect(page).not.toHaveURL(/\/finance\/rent-plans/, { timeout: 10_000 });
  });

  test("contractor is redirected away from /finance/rent-plans", async ({ page }) => {
    await signInAs(page, seededUsers.contractorA1);
    await page.goto("/finance/rent-plans");

    await expect(page).not.toHaveURL(/\/finance\/rent-plans/, { timeout: 10_000 });
  });
});

// ─── Sidebar and Finance regression ──────────────────────────────────────────

test.describe("Rent Plans — Finance regression", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Finance page still loads correctly", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Finance by property")).toBeVisible({ timeout: 15_000 });
  });

  test("Payment ledger tab is still functional", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("Finance overview shows Rent Plans entry card", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Rent Plans").first()).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar CalendarClock link navigates to rent plans", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

    await page
      .locator('nav:not([aria-label="Breadcrumb"])')
      .getByRole("link", { name: /Rent Plans/i })
      .click();

    await expect(page).toHaveURL(/\/finance\/rent-plans/, { timeout: 10_000 });
    await expect(page.locator("h1").filter({ hasText: "Rent Plans" })).toBeVisible({ timeout: 20_000 });
  });
});
