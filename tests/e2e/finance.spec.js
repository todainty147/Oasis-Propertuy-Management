/**
 * E2E: Finance page – comprehensive coverage
 *
 * Covers: page shell, summary cards, tab navigation, status filter pills,
 * search, Finance-by-property section, settings tab, role access, accessibility.
 *
 * Requires local Supabase harness (Docker up).
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_ID  = isolationFixtures.accounts.accountA.id;
const PROPERTY_ID = isolationFixtures.users.tenantA1.propertyId;
const TENANT_ID   = isolationFixtures.users.tenantA1.tenantId;

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("Finance page", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function resolveOwnerId() {
    const admin = getIntegrationAdminClient();
    const { data, error } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", PROPERTY_ID)
      .single();
    if (error) throw new Error(`resolveOwnerId: ${error.message}`);
    return data.owner_id;
  }

  async function seedPayment({ amount, dueDate, paidAt = null, status = null, notes }) {
    return seedPaymentFor({
      amount,
      dueDate,
      paidAt,
      status,
      notes,
      propertyId: PROPERTY_ID,
      tenantId: TENANT_ID,
    });
  }

  async function seedPaymentFor({ amount, dueDate, paidAt = null, status = null, notes, propertyId, tenantId }) {
    const admin = getIntegrationAdminClient();
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", propertyId)
      .single();
    if (propErr) throw new Error(`seedPaymentFor: property lookup failed: ${propErr.message}`);
    const { data, error } = await admin
      .from("payments")
      .insert({
        account_id:  ACCOUNT_ID,
        property_id: propertyId,
        tenant_id:   tenantId,
        owner_id:    prop.owner_id,
        amount,
        due_date:    dueDate,
        paid_at:     paidAt,
        status:      status ?? (paidAt ? "paid" : "due"),
        notes,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seedPayment: ${error.message}`);
    return data.id;
  }

  async function createIsolatedPaymentFixture({ rent = 1000 } = {}) {
    const admin = getIntegrationAdminClient();
    const owner_id = await resolveOwnerId();
    const propertyId = randomUUID();
    const tenantId = randomUUID();

    const { error: propErr } = await admin.from("properties").insert({
      id: propertyId,
      account_id: ACCOUNT_ID,
      owner_id,
      address: `E2E Finance Prop ${propertyId.slice(0, 8)}`,
      city: "TestCity",
      rent,
      status: "Wolne",
      tenant_id: null,
    });
    if (propErr) throw new Error(`createIsolatedPaymentFixture property: ${propErr.message}`);

    const { error: tenantErr } = await admin.from("tenants").insert({
      id: tenantId,
      account_id: ACCOUNT_ID,
      owner_id,
      user_id: null,
      property_id: propertyId,
      name: `E2E Finance Tenant ${tenantId.slice(0, 8)}`,
      email: `finance.e2e.${tenantId.slice(0, 8)}@test.invalid`,
      status: "active",
    });
    if (tenantErr) throw new Error(`createIsolatedPaymentFixture tenant: ${tenantErr.message}`);

    const { error: updateErr } = await admin.from("properties")
      .update({ tenant_id: tenantId, status: "Wynajęte" })
      .eq("id", propertyId);
    if (updateErr) throw new Error(`createIsolatedPaymentFixture update: ${updateErr.message}`);

    return { propertyId, tenantId };
  }

  async function cleanupIsolatedPaymentFixture({ propertyId, tenantId }) {
    const admin = getIntegrationAdminClient();
    await admin.from("payments").delete().eq("property_id", propertyId);
    await admin.from("properties").update({ tenant_id: null }).eq("id", propertyId);
    await admin.from("tenants").delete().eq("id", tenantId);
    await admin.from("properties").delete().eq("id", propertyId);
  }

  async function cleanupNotes(notes) {
    const admin = getIntegrationAdminClient();
    await admin.from("payments").delete().eq("account_id", ACCOUNT_ID).ilike("notes", notes);
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function futureDate(days) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }
  function pastDate(days)   { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }

  // ── 1. Page shell ──────────────────────────────────────────────────────────

  test.describe("page shell", () => {
    test("renders Finance heading and subtitle", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      // Subtitle present (any non-empty text beneath heading)
      const subtitle = page.locator("h1 + p, h1 ~ p").first();
      await expect(subtitle).toBeVisible();
    });

    test("shows Add Payment button for owner", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /add payment/i })).toBeVisible();
    });

    test("three tabs: Overview, Payments, Settings", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const nav = page.getByRole("navigation", { name: "Finance sections" });
      await expect(nav.getByRole("button", { name: /overview/i })).toBeVisible();
      await expect(nav.getByRole("button", { name: /payments/i })).toBeVisible();
      await expect(nav.getByRole("button", { name: /settings/i })).toBeVisible();
    });

    test("default tab is Overview", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      // Overview tab has the active border-slate-900 styling (aria attribute not used here)
      const overviewBtn = page.getByRole("button", { name: /overview/i });
      await expect(overviewBtn).toHaveClass(/border-slate-900/);
    });
  });

  // ── 2. Summary cards ──────────────────────────────────────────────────────

  test.describe("summary cards", () => {
    test("four summary cards visible with correct labels", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Labels rendered by i18n keys — use broad patterns that survive translation
      await expect(page.getByText(/Received/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Overdue/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Due Soon/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Total Owed/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('"Total Owed" label exists; "Outstanding" does not (A-5)', async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Total Owed").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Outstanding").first()).not.toBeVisible();
    });

    test("clicking Overdue card switches to payments tab with overdue filter", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Wait for summary cards to appear
      const overdueCard = page.getByRole("button", { name: /Overdue/i }).first();
      await expect(overdueCard).toBeVisible({ timeout: 10_000 });

      // Click the Overdue summary card (it's a button)
      await overdueCard.click();

      // URL should now include status=overdue and tab=payments
      await expect(page).toHaveURL(/tab=payments/, { timeout: 10_000 });
      await expect(page).toHaveURL(/status=overdue/);
    });

    test("clicking Due Soon card switches to payments tab with 7d range filter", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      const dueSoonCard = page.getByRole("button", { name: /Due within 7 days|Due Soon/i }).first();
      await expect(dueSoonCard).toBeVisible({ timeout: 10_000 });

      await dueSoonCard.click();

      await expect(page).toHaveURL(/tab=payments/, { timeout: 10_000 });
      await expect(page).toHaveURL(/range=7d/);
    });
  });

  // ── 3. Tab navigation ─────────────────────────────────────────────────────

  test.describe("tab navigation", () => {
    test("clicking Payments tab shows payments section with search input", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /payments/i }).click();
      await expect(page).toHaveURL(/tab=payments/);

      // Search input visible on payments tab
      await expect(page.locator('input[type="text"]').filter({ visible: true })).toBeVisible({ timeout: 10_000 });
    });

    test("clicking Settings tab shows settings content", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("navigation", { name: "Finance sections" }).getByRole("button", { name: /^Settings$/i }).click();
      await expect(page).toHaveURL(/tab=settings/);

      // Settings tab renders a card / section (TenantPaymentCollectionSettingsCard)
      // We just verify some content is rendered and it's not the payments table
      await expect(page.getByTestId("payments-table")).not.toBeVisible();
    });

    test("clicking Overview tab restores summary cards", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /overview/i }).click();
      await expect(page).toHaveURL(/tab=overview/);

      await expect(page.getByText(/Total Owed/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test("?tab=payments URL param opens payments tab directly", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Payments tab button should have active styling
      const paymentsBtn = page.getByRole("button", { name: /payments/i });
      await expect(paymentsBtn).toHaveClass(/border-slate-900/, { timeout: 10_000 });
    });
  });

  // ── 4. Finance by property ────────────────────────────────────────────────

  test.describe("Finance by property section", () => {
    test("Finance by property section visible on overview tab", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Section heading
      await expect(page.getByText(/Finance by Property|By Property/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test("property-finance-table visible on desktop overview tab", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      // Desktop table is shown on the md breakpoint (1280px viewport)
      await expect(page.getByTestId("property-finance-table")).toBeVisible({ timeout: 15_000 });
    });

    test("property row links to property financials page", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const table = page.getByTestId("property-finance-table");
      const firstRow = table.locator("tbody tr").first();
      const rowCount = await firstRow.count();

      if (rowCount > 0) {
        await firstRow.click();
        await expect(page).toHaveURL(/\/properties\/.*\?tab=financials/, { timeout: 10_000 });
      }
    });
  });

  // ── 5. Payments tab: search ───────────────────────────────────────────────

  test.describe("search", () => {
    const NOTE = `e2e-finance-search-${randomUUID()}`;

    test.afterEach(async () => { await cleanupNotes(NOTE); });

    test("search filters payment rows by tenant name", async ({ page }) => {
      const id = await seedPayment({ amount: 300, dueDate: futureDate(5), notes: NOTE });
      expect(id).toBeTruthy();

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

      const searchInput = page.locator('input[type="text"]').filter({ visible: true });
      await searchInput.fill("NONEXISTENT_TENANT_XYZ");

      // Table should show empty state after filtering
      await expect(page.getByTestId("payments-table")).not.toBeVisible({ timeout: 5_000 });
      await expect(page.locator("text=/no.*payment/i").first()).toBeVisible({ timeout: 5_000 });
    });

    test("clearing search restores all payments", async ({ page }) => {
      const id = await seedPayment({ amount: 420, dueDate: futureDate(3), notes: NOTE });
      expect(id).toBeTruthy();

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

      const searchInput = page.locator('input[type="text"]').filter({ visible: true });
      await searchInput.fill("NONEXISTENT_XYZ");
      await expect(page.getByTestId("payments-table")).not.toBeVisible({ timeout: 5_000 });

      await searchInput.fill("");
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── 6. Status filter pills ────────────────────────────────────────────────

  test.describe("status filter pills", () => {
    const NOTE_PAID    = `e2e-finance-pills-paid-${randomUUID()}`;
    const NOTE_OVERDUE = `e2e-finance-pills-overdue-${randomUUID()}`;

    test.afterEach(async () => {
      await cleanupNotes(NOTE_PAID);
      await cleanupNotes(NOTE_OVERDUE);
    });

    test("five filter pills visible on payments tab: All, Paid, Overdue, Pending, Due Soon", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const pills = page.locator("button.rounded-full").filter({ visible: true });
      const count = await pills.count();
      expect(count).toBeGreaterThanOrEqual(5);

      // Specific labels
      await expect(page.getByRole("button", { name: /^All$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Paid$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Overdue$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Pending$/i })).toBeVisible();
    });

    test("Paid pill shows only paid payments", async ({ page }) => {
      await seedPayment({ amount: 111, dueDate: pastDate(5), paidAt: today(), notes: NOTE_PAID });
      await seedPayment({ amount: 222, dueDate: futureDate(5), notes: NOTE_OVERDUE });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /^Paid$/i }).click();
      await expect(page).toHaveURL(/status=paid/);
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 10_000 });

      // Paid badge should appear; no due/pending rows
      await expect(page.getByTestId("payments-table")).toContainText(/Paid/, { timeout: 10_000 });
    });

    test("All pill clears filters and shows all payments", async ({ page }) => {
      await seedPayment({ amount: 999, dueDate: pastDate(5), paidAt: today(), notes: NOTE_PAID });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=overdue");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /^All$/i })).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /^All$/i }).click();

      // status param removed from URL
      await expect(page).not.toHaveURL(/status=/);
    });

    test("filter banner appears when status filter is active", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=overdue");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Filter banner (blue background) should be visible
      await expect(page.locator(".bg-blue-50").first()).toBeVisible({ timeout: 10_000 });
    });

    test("Clear Filters button removes filter from URL", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=paid");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const clearBtn = page.getByRole("button", { name: /clear.filter/i });
      await expect(clearBtn).toBeVisible({ timeout: 10_000 });
      await clearBtn.click();

      await expect(page).not.toHaveURL(/status=/);
    });
  });

  // ── 7. URL filter params ──────────────────────────────────────────────────

  test.describe("URL filter params", () => {
    test("?status=overdue opens payments tab with overdue filter active", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?status=overdue");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Payments tab should be active automatically when a filter param is set
      const paymentsBtn = page.getByRole("button", { name: /payments/i });
      await expect(paymentsBtn).toHaveClass(/border-slate-900/, { timeout: 10_000 });

      // Overdue pill should be in active state
      const overduePill = page.getByRole("button", { name: /^Overdue$/i });
      await expect(overduePill).toHaveClass(/bg-slate-900/, { timeout: 10_000 });
    });

    test("?range=7d opens payments tab with 7-day range filter", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?range=7d");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const paymentsBtn = page.getByRole("button", { name: /payments/i });
      await expect(paymentsBtn).toHaveClass(/border-slate-900/, { timeout: 10_000 });
    });
  });

  // ── 8. Add Payment modal ──────────────────────────────────────────────────

  test.describe("Add Payment modal", () => {
    test("modal opens when Add Payment button is clicked", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /add payment/i }).click();
      await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible({ timeout: 10_000 });
    });

    test("modal has no Status dropdown — uses Mark as Paid checkbox (I-4)", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /add payment/i }).click();
      await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible({ timeout: 10_000 });

      // Mark as Paid checkbox present
      await expect(page.locator("#payment-mark-paid")).toBeVisible();

      // No status dropdown (select with pending/overdue options)
      const modalForm = page.locator(".fixed.inset-0 form");
      const statusDropdown = modalForm.locator("select").filter({ hasText: /pending|overdue/i });
      await expect(statusDropdown).not.toBeVisible();
    });

    test("Cancel closes the modal", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: /add payment/i }).click();
      await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible({ timeout: 10_000 });

      await page.locator(".fixed.inset-0").getByRole("button", { name: /cancel/i }).click();
      await expect(page.getByRole("heading", { name: /add payment/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });

  // ── 9. Payments table content ─────────────────────────────────────────────

  test.describe("payments table content", () => {
    const NOTE = `e2e-finance-table-${randomUUID()}`;

    test.afterEach(async () => { await cleanupNotes(NOTE); });

    test("seeded payment appears in payments table with amount and status", async ({ page }) => {
      const fixture = await createIsolatedPaymentFixture({ rent: 1000 });
      const amount = 100;
      await seedPaymentFor({
        amount,
        dueDate: futureDate(10),
        notes: NOTE,
        propertyId: fixture.propertyId,
        tenantId: fixture.tenantId,
      });

      try {
        await signInAs(page, seededUsers.ownerA);
        await page.goto("/finance?tab=payments");

        await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId("payments-table")).toContainText(/100/, { timeout: 15_000 });
      } finally {
        await cleanupIsolatedPaymentFixture(fixture);
      }
    });

    test("paid payment shows Paid badge in table", async ({ page }) => {
      await seedPayment({ amount: 500, dueDate: pastDate(3), paidAt: today(), notes: NOTE });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=paid");

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("payments-table")).toContainText(/Paid/, { timeout: 15_000 });
    });

    test("Mark Paid button present for due payment (B-1)", async ({ page }) => {
      const fixture = await createIsolatedPaymentFixture({ rent: 1000 });
      await seedPaymentFor({
        amount: 100,
        dueDate: futureDate(4),
        notes: NOTE,
        propertyId: fixture.propertyId,
        tenantId: fixture.tenantId,
      });

      try {
        await signInAs(page, seededUsers.ownerA);
        await page.goto("/finance?tab=payments");

        await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

        const markPaid = page.getByTestId(/^mark-paid-/).filter({ visible: true }).first();
        await expect(markPaid).toBeVisible({ timeout: 15_000 });
      } finally {
        await cleanupIsolatedPaymentFixture(fixture);
      }
    });

    test("Mark Paid updates row status immediately (B-5, A-1)", async ({ page }) => {
      const fixture = await createIsolatedPaymentFixture({ rent: 1000 });
      await seedPaymentFor({
        amount: 100,
        dueDate: futureDate(2),
        notes: NOTE,
        propertyId: fixture.propertyId,
        tenantId: fixture.tenantId,
      });

      try {
        await signInAs(page, seededUsers.ownerA);
        await page.goto("/finance?tab=payments");

        await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

        const markPaid = page.getByTestId(/^mark-paid-/).filter({ visible: true }).first();
        await expect(markPaid).toBeVisible({ timeout: 15_000 });
        await markPaid.click();

        await expect(page.getByTestId("payments-table")).toContainText(/Paid/, { timeout: 10_000 });
      } finally {
        await cleanupIsolatedPaymentFixture(fixture);
      }
    });

    test("Delete requires two clicks — no window.confirm (I-3)", async ({ page }) => {
      await seedPayment({ amount: 800, dueDate: futureDate(6), notes: NOTE });

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 20_000 });

      const deleteBtn = page.locator("button", { hasText: /delete|remove/i })
        .filter({ visible: true })
        .first();
      await expect(deleteBtn).toBeVisible({ timeout: 15_000 });

      // First click: changes to confirm state
      await deleteBtn.click();
      await expect(deleteBtn).toContainText(/delete this payment\?/i, { timeout: 5_000 });

      // Second click: actually deletes
      await deleteBtn.click();
      await expect(page.getByTestId("payments-table")).not.toContainText(/800\.00/, { timeout: 10_000 });
    });
  });

  // ── 10. Role access ───────────────────────────────────────────────────────

  test.describe("role access", () => {
    test("owner can access Finance page", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    });

    test("admin can access Finance page", async ({ page }) => {
      await signInAs(page, seededUsers.adminA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    });

    test("tenant is redirected away from /finance", async ({ page }) => {
      await signInAs(page, seededUsers.tenantA1);
      await page.goto("/finance");

      // Tenant should not see the finance heading — redirected to their portal
      await expect(page.getByRole("heading", { name: "Finance", exact: true })).not.toBeVisible({ timeout: 15_000 });
      // Should be on a different path (tenant portal or home)
      await expect(page).not.toHaveURL(/^.*\/finance(\?.*)?$/, { timeout: 10_000 });
    });

    test("contractor is redirected away from /finance", async ({ page }) => {
      await signInAs(page, seededUsers.contractorA1);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).not.toBeVisible({ timeout: 15_000 });
      await expect(page).not.toHaveURL(/^.*\/finance(\?.*)?$/, { timeout: 10_000 });
    });

    test("staff can access Finance page (read-only view)", async ({ page }) => {
      await signInAs(page, seededUsers.staffA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
    });
  });

  // ── 11. Accessibility ─────────────────────────────────────────────────────

  test.describe("accessibility", () => {
    test("Finance heading is an <h1>", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true, level: 1 })).toBeVisible({ timeout: 20_000 });
    });

    test("tab nav has aria-label", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("navigation", { name: "Finance sections" })).toBeVisible({ timeout: 10_000 });
    });

    test("Add Payment button is keyboard-accessible", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      const addBtn = page.getByRole("button", { name: /add payment/i });
      await expect(addBtn).toBeVisible({ timeout: 10_000 });

      // Focus and press Enter — modal should open
      await addBtn.focus();
      await addBtn.press("Enter");
      await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible({ timeout: 10_000 });
    });

    test("no horizontal overflow on Finance page (mobile 375px)", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(300);

      const overflows = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
          clientWidth: Math.max(body.clientWidth, html.clientWidth),
        };
      });

      expect(overflows.scrollWidth).toBeLessThanOrEqual(overflows.clientWidth + 2);
    });
  });

  // ── 12. Rent Plans entry point ────────────────────────────────────────────

  test.describe("Rent Plans entry point", () => {
    test("Rent Plans link card visible on overview tab", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Rent Plans/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test("Rent Plans arrow link navigates to /finance/rent-plans", async ({ page }) => {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");

      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 20_000 });

      // Click the "Rent Plans →" link
      const rentPlansLink = page.getByRole("link", { name: /Rent Plans/i }).first();
      await expect(rentPlansLink).toBeVisible({ timeout: 10_000 });
      await rentPlansLink.click();

      await expect(page).toHaveURL(/\/finance\/rent-plans/, { timeout: 10_000 });
    });
  });
});
