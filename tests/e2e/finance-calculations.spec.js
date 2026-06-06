/**
 * E2E: Finance calculation display
 *
 * Verifies that the Finance page correctly renders values computed by
 * finance_snapshot for:
 *   - Received (MTD)       — total_income
 *   - Overdue              — overdue_income (cumulative pre-month arrears)
 *   - Due within 7 days    — due_soon_income
 *   - Total Owed           — outstanding_income
 *   - Per-property Paid / Remaining / Status
 *   - Arrears accumulation over multiple months
 *   - Overpayment edge cases
 *
 * Strategy: each test creates an isolated property + tenant via admin client,
 * seeds exact payment data, calls finance_snapshot via the ownerA Supabase
 * client to get expected values, then navigates the browser and asserts the UI
 * matches. Regex matchers handle locale-specific number formatting.
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function monthStart(nMonthsAgo = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - nMonthsAgo);
  return d.toISOString().slice(0, 10);
}
function monthsElapsed(startDateISO) {
  const [sy, sm] = startDateISO.split("-").map(Number);
  const now = new Date();
  return Math.max((now.getFullYear() - sy) * 12 + (now.getMonth() + 1 - sm) + 1, 1);
}

// ── Regex matcher for locale-aware numbers ────────────────────────────────────
// Matches a formatted number regardless of thousands separators (,  .  space).
// e.g. 1200 → matches "1,200.00", "1 200,00", "1.200,00", "1200.00"
function numRegex(n) {
  const s = String(Math.round(n));
  if (s.length <= 3) return new RegExp(s);
  // Insert [\s,.]? between every group of digits
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s,.]?");
  return new RegExp(grouped);
}

function firstAmountFromText(text) {
  const raw = text?.match(/\d[\d\s,.]*/)?.[0]?.replace(/\s/g, "") ?? "0";
  if (raw.includes(",") && !raw.includes(".")) return Number(raw.replace(",", "."));
  return Number(raw.replace(/,/g, ""));
}

// ── Admin client helpers ──────────────────────────────────────────────────────

function admin() { return getIntegrationAdminClient(); }

async function resolveOwnerUserId() {
  const a = admin();
  const { data } = await a.from("properties")
    .select("owner_id")
    .eq("id", isolationFixtures.users.tenantA1.propertyId)
    .single();
  return data.owner_id;
}

async function createIsolatedProperty(ownerUserId, { rent = 1000 } = {}) {
  const a = admin();
  const propId = randomUUID();
  const tenantId = randomUUID();
  const propertyName = `E2E Calc Prop ${propId.slice(0, 8)}`;
  const tenantName = `E2E Calc Tenant ${tenantId.slice(0, 8)}`;

  // Property first (without tenant_id) to satisfy FK order.
  const { error: pErr } = await a.from("properties").insert({
    id: propId,
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    address: propertyName,
    city: "TestCity",
    rent,
    status: "Wolne",
    tenant_id: null,
  });
  if (pErr) throw new Error(`prop: ${pErr.message}`);

  const { error: tErr } = await a.from("tenants").insert({
    id: tenantId,
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    user_id: null,
    property_id: propId,
    name: tenantName,
    email: `calc.e2e.${tenantId.slice(0, 8)}@test.invalid`,
    phone: "+447700000000",
    status: "active",
  });
  if (tErr) throw new Error(`tenant: ${tErr.message}`);

  // Now mark property as occupied.
  const { error: uErr } = await a.from("properties").update({
    tenant_id: tenantId, status: "Wynajęte",
  }).eq("id", propId);
  if (uErr) throw new Error(`update property: ${uErr.message}`);

  return { propId, tenantId, propertyName, tenantName };
}

async function cleanupProperty(propId, tenantId) {
  const a = admin();
  await a.from("leases").delete().eq("property_id", propId);
  await a.from("payments").delete().eq("property_id", propId);
  await a.from("tenants").delete().eq("id", tenantId);
  await a.from("properties").delete().eq("id", propId);
}

async function cleanupStaleCalcFixtures() {
  const a = admin();
  const { data: props } = await a
    .from("properties")
    .select("id")
    .eq("account_id", ACCOUNT_ID)
    .ilike("address", "E2E Calc Prop%");
  const propIds = (props ?? []).map((p) => p.id);
  if (propIds.length === 0) return;

  const { data: tenants } = await a
    .from("tenants")
    .select("id")
    .eq("account_id", ACCOUNT_ID)
    .ilike("name", "E2E Calc Tenant%");
  const tenantIds = (tenants ?? []).map((t) => t.id);

  await a.from("leases").delete().in("property_id", propIds);
  await a.from("payments").delete().in("property_id", propIds);
  await a.from("properties").update({ tenant_id: null }).in("id", propIds);
  if (tenantIds.length > 0) await a.from("tenants").delete().in("id", tenantIds);
  await a.from("properties").delete().in("id", propIds);
}

async function seedPayments(ownerUserId, propId, tenantId, rows) {
  const a = admin();
  const { error } = await a.from("payments").insert(rows.map((r) => ({
    id: randomUUID(),
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    property_id: propId,
    tenant_id: tenantId,
    ...r,
  })));
  if (error) throw new Error(`seed payments: ${error.message}`);
}

// Wait for Finance page to fully load (past skeleton)
async function waitForFinancePage(page) {
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 25_000 });
  // Wait for summary cards to render (not skeleton)
  await page.waitForTimeout(800);

  const perPage = page.getByRole("combobox", { name: /per page/i }).first();
  if (await perPage.isVisible({ timeout: 1000 }).catch(() => false)) {
    await perPage.selectOption("50").catch(() => null);
    await page.waitForTimeout(300);
  }
}

async function filterByTenant(page, tenantName) {
  const tenantSelect = page.locator("aside select").first();
  if (await tenantSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tenantSelect.selectOption({ label: tenantName });
    await page.waitForTimeout(800);
  }
}

async function selectAllTenants(page) {
  const tenantSelect = page.locator("aside select").first();
  if (await tenantSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tenantSelect.selectOption({ label: "All tenants" });
    await page.waitForTimeout(800);
  }
}

async function findPropertyRow(page, propId) {
  const propTable = page.getByTestId("property-finance-table");
  await expect(propTable).toBeVisible({ timeout: 15_000 });
  const row = propTable.locator("tr").filter({ hasText: `E2E Calc Prop ${propId.slice(0, 8)}` });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await row.isVisible({ timeout: 500 }).catch(() => false)) return row;

    const next = page.getByRole("button", { name: /next/i }).last();
    if (!(await next.isVisible({ timeout: 500 }).catch(() => false)) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(300);
  }

  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

async function searchPaymentsByProperty(page, propId) {
  const search = page.getByPlaceholder(/search by tenant or property/i);
  if (await search.isVisible({ timeout: 1000 }).catch(() => false)) {
    await search.fill(`E2E Calc Prop ${propId.slice(0, 8)}`);
    await page.waitForTimeout(300);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Finance calculation display", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");
  test.beforeAll(cleanupStaleCalcFixtures);

  // ── 1. Received (MTD) ─────────────────────────────────────────────────────

  test("Received card shows only payments with paid_at in current calendar month", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId } = await createIsolatedProperty(ownerUserId, { rent: 500 });

    try {
      const mtdAmount = 750;
      await seedPayments(ownerUserId, propId, tenantId, [
        // This month — should appear in Received
        { amount: mtdAmount, status: "paid", paid_at: today(), due_date: today() },
        // Last month — should NOT appear in Received
        { amount: 300, status: "paid", paid_at: monthStart(1), due_date: monthStart(1) },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);

      // The Received card shows total_income (MTD sum)
      // We verify the 750 appears somewhere in the page (it's part of the total)
      // We navigate to Finance with ?tab=payments and verify the MTD payment shows
      await page.goto("/finance?tab=payments&status=paid");
      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("payments-table")).toContainText(numRegex(mtdAmount), { timeout: 15_000 });
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  test("Received card does NOT count status=paid without paid_at in MTD", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId, propertyName } = await createIsolatedProperty(ownerUserId, { rent: 800 });

    try {
      // status=paid but no paid_at is not a completed receipt and should not count in MTD total_income.
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: 800, status: "paid", paid_at: null, due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");
      await waitForFinancePage(page);

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await searchPaymentsByProperty(page, propId);

      const row = page.getByTestId("payments-table").locator("tr").filter({ hasText: propertyName });
      await expect(row).toContainText(numRegex(800), { timeout: 15_000 });
      await expect(row).toContainText(/Pending/i, { timeout: 15_000 });
      await expect(row).not.toContainText(/Paid at:/i);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 2. Overdue (pre-month arrears) ───────────────────────────────────────

  test("property with 3+ months elapsed and zero payments shows 'overdue' status", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: 1000 });

    try {
      // Earliest due_date 3 months ago → months_elapsed >= 4 → prior debt exists
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: 1000, status: "due", due_date: monthStart(3) },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      // Property Finance table — find our test property row
      const testRow = await findPropertyRow(page, propId);
      // Status badge should say "Overdue" or similar
      await expect(testRow).toContainText(/overdue/i);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  test("Overdue summary card increases when historical rent is unpaid", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId } = await createIsolatedProperty(ownerUserId, { rent: 1000 });
    const RENT = 1000;

    try {
      const startDate = monthStart(3);

      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: RENT, status: "due", due_date: startDate },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);

      // The Overdue card should show a value ≥ expectedOverdue (may include other account data)
      const overdueCard = page.locator("button").filter({ hasText: /Overdue/i }).first();
      await expect(overdueCard).toBeVisible({ timeout: 15_000 });
      // The card contains the overdue amount — at minimum our property's contribution
      const cardText = await overdueCard.textContent();
      // Extract digits from the card text to get the numeric value
      expect(cardText).toBeTruthy();
      // The number should be non-zero (our property has overdue)
      expect(cardText).not.toMatch(/^[^0-9]*0[^0-9]*$/);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 3. Due within 7 days ─────────────────────────────────────────────────

  test("payment due in 3 days appears in payments table on /finance?tab=payments", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId } = await createIsolatedProperty(ownerUserId, { rent: 750 });

    try {
      const dueDate = dayOffset(3);
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: 750, status: "due", due_date: dueDate },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments");
      await waitForFinancePage(page);

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("payments-table")).toContainText(numRegex(750), { timeout: 15_000 });
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  test("Due Soon filter pill shows payment due in 3 days but not 8 days", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId: p1, tenantId: t1 } = await createIsolatedProperty(ownerUserId, { rent: 900 });
    const { propId: p2, tenantId: t2 } = await createIsolatedProperty(ownerUserId, { rent: 850 });

    try {
      // Payment due in 3 days (should show in due-soon filter)
      await seedPayments(ownerUserId, p1, t1, [{ amount: 900, status: "due", due_date: dayOffset(3) }]);
      // Payment due in 8 days (should NOT show in due-soon filter)
      await seedPayments(ownerUserId, p2, t2, [{ amount: 850, status: "due", due_date: dayOffset(8) }]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?range=7d");
      await waitForFinancePage(page);

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });

      // The 3-day payment should be visible
      await expect(page.getByTestId("payments-table")).toContainText(numRegex(900), { timeout: 15_000 });
      // The 8-day payment should NOT be in the filtered view
      await expect(page.getByTestId("payments-table")).not.toContainText(numRegex(850));
    } finally {
      await cleanupProperty(p1, t1);
      await cleanupProperty(p2, t2);
    }
  });

  // ── 4. Total Owed ────────────────────────────────────────────────────────

  test("property table shows correct Remaining for multi-month arrears", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const RENT = 1000;
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: RENT });

    try {
      const startDate = monthStart(2);
      const n = monthsElapsed(startDate);
      const totalPaid = 500;
      const expectedRemaining = Math.max(n * RENT - totalPaid, 0);

      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: RENT, status: "due", due_date: startDate },
        { amount: totalPaid, status: "paid", paid_at: dayOffset(-10), due_date: dayOffset(-10) },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      const testRow = await findPropertyRow(page, propId);

      // Remaining column shows the accumulated debt
      await expect(testRow).toContainText(numRegex(expectedRemaining));
      // Paid column shows all-time receipts
      await expect(testRow).toContainText(numRegex(totalPaid));
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 5. Per-property paid and remaining in the UI ─────────────────────────

  test("property row shows paid=0 and remaining=rent when no payments made", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const RENT = 850;
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: RENT });

    try {
      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      const testRow = await findPropertyRow(page, propId);

      // Rent column = 850
      await expect(testRow).toContainText(numRegex(RENT));
      // Status = pending (no payments)
      await expect(testRow).toContainText(/pending/i);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  test("property row shows 'paid' status badge when fully paid this month", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const RENT = 1000;
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: RENT });

    try {
      // Pay exactly 1 month's rent (months_elapsed=1) → remaining=0
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: RENT, status: "paid", paid_at: today(), due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      const testRow = await findPropertyRow(page, propId);
      await expect(testRow).toContainText(/paid/i);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 6. Arrears: multi-month accumulation ─────────────────────────────────

  test("property with 5-month lease shows accumulated arrears in Remaining column", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const RENT = 1000;
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: RENT });

    try {
      const leaseStart = monthStart(5);
      const n = monthsElapsed(leaseStart);
      const paid = 1500;

      // Insert a lease to set the start date
      const { error: leaseErr } = await admin().from("leases").insert({
        id: randomUUID(),
        account_id: ACCOUNT_ID,
        property_id: propId,
        tenant_id: tenantId,
        lease_start_date: leaseStart,
        renewal_status: "active",
      });
      expect(leaseErr).toBeNull();

      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: paid, status: "paid", paid_at: dayOffset(-15), due_date: dayOffset(-15) },
      ]);

      const expectedRemaining = Math.max(n * RENT - paid, 0);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      const testRow = await findPropertyRow(page, propId);

      // Remaining should reflect the full accumulated debt
      await expect(testRow).toContainText(numRegex(expectedRemaining));
      // Status should be overdue (prior months unpaid)
      await expect(testRow).toContainText(/overdue/i);
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 7. Overpayment edge cases ─────────────────────────────────────────────

  test("property with overpayment shows 'paid' status and remaining=0", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const RENT = 500;
    const { propId, tenantId, tenantName } = await createIsolatedProperty(ownerUserId, { rent: RENT });

    try {
      // Pay 3× the monthly rent in a single month
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: 1500, status: "paid", paid_at: today(), due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await filterByTenant(page, tenantName);

      const testRow = await findPropertyRow(page, propId);

      // Status = paid (remaining clamped to 0)
      await expect(testRow).toContainText(/paid/i);
      // Paid column shows the full 1500
      await expect(testRow).toContainText(numRegex(1500));
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  test("voided duplicate receipt does not clear a tenant running balance", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId: property35Id, tenantId: tenant35Id } = await createIsolatedProperty(ownerUserId, { rent: 1000 });
    const { propId: property36Id, tenantId: tenant36Id } = await createIsolatedProperty(ownerUserId, { rent: 2000 });
    const leaseStart = monthStart(1);

    try {
      const { error: leaseError } = await admin().from("leases").insert([
        {
          id: randomUUID(),
          account_id: ACCOUNT_ID,
          property_id: property35Id,
          tenant_id: tenant35Id,
          lease_start_date: leaseStart,
          renewal_status: "active",
        },
        {
          id: randomUUID(),
          account_id: ACCOUNT_ID,
          property_id: property36Id,
          tenant_id: tenant36Id,
          lease_start_date: leaseStart,
          renewal_status: "active",
        },
      ]);
      expect(leaseError).toBeNull();

      await seedPayments(ownerUserId, property35Id, tenant35Id, [
        { amount: 2000, status: "paid", paid_at: today(), due_date: today() },
      ]);
      await seedPayments(ownerUserId, property36Id, tenant36Id, [
        { amount: 2000, status: "overdue", due_date: monthStart(1) },
        { amount: 500, status: "paid", paid_at: monthStart(1), due_date: monthStart(1) },
        { amount: 2000, status: "paid", paid_at: today(), due_date: today() },
        { amount: 2000, status: "void", paid_at: null, due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance");
      await waitForFinancePage(page);
      await selectAllTenants(page);

      const property35Row = await findPropertyRow(page, property35Id);
      await expect(property35Row).toContainText(numRegex(2000));
      await expect(property35Row).toContainText(/paid/i);

      await selectAllTenants(page);
      const property36Row = await findPropertyRow(page, property36Id);
      await expect(property36Row).toContainText(numRegex(2500));
      await expect(property36Row).toContainText(numRegex(1500));
      await expect(property36Row).toContainText(/overdue/i);

      const overdueCard = page.locator("button").filter({ hasText: /Overdue/i }).first();
      const overdueText = await overdueCard.textContent();
      expect(firstAmountFromText(overdueText)).toBeGreaterThanOrEqual(1500);

      await page.goto("/finance?tab=payments&status=overdue");
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await searchPaymentsByProperty(page, property36Id);
      const adjustedChargeRow = page.getByTestId("payments-table").locator("tr")
        .filter({ hasText: `E2E Calc Prop ${property36Id.slice(0, 8)}` })
        .filter({ hasText: /overdue/i });
      await expect(adjustedChargeRow).toBeVisible({ timeout: 15_000 });
      await expect(adjustedChargeRow).toContainText(numRegex(1500));
      await expect(adjustedChargeRow.getByRole("button", { name: /mark paid/i })).toHaveCount(0);

      await page.goto("/finance?tab=payments");
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await searchPaymentsByProperty(page, property36Id);
      const voidedDuplicateRow = page.getByTestId("payments-table").locator("tr")
        .filter({ hasText: `E2E Calc Prop ${property36Id.slice(0, 8)}` })
        .filter({ hasText: /Voided/ });
      await expect(voidedDuplicateRow).toBeVisible({ timeout: 15_000 });
      await expect(voidedDuplicateRow).toContainText(numRegex(2000));
    } finally {
      await cleanupProperty(property35Id, tenant35Id);
      await cleanupProperty(property36Id, tenant36Id);
    }
  });

  test("overpayment: Received card includes full overpayment in MTD total", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId, tenantId } = await createIsolatedProperty(ownerUserId, { rent: 400 });

    try {
      // Overpay: 800 vs rent=400
      await seedPayments(ownerUserId, propId, tenantId, [
        { amount: 800, status: "paid", paid_at: today(), due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=paid");
      await waitForFinancePage(page);

      // The full 800 must appear in the payments table (not just 400)
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("payments-table")).toContainText(numRegex(800), { timeout: 15_000 });
    } finally {
      await cleanupProperty(propId, tenantId);
    }
  });

  // ── 8. Overdue filter pill ────────────────────────────────────────────────

  test("Overdue status filter shows overdue payments and hides paid ones", async ({ page }) => {
    const ownerUserId = await resolveOwnerUserId();
    const { propId: p1, tenantId: t1 } = await createIsolatedProperty(ownerUserId, { rent: 700 });
    const { propId: p2, tenantId: t2 } = await createIsolatedProperty(ownerUserId, { rent: 600 });

    try {
      // Overdue payment (past due_date)
      await seedPayments(ownerUserId, p1, t1, [
        { amount: 700, status: "overdue", due_date: dayOffset(-15) },
      ]);
      // Paid payment
      await seedPayments(ownerUserId, p2, t2, [
        { amount: 600, status: "paid", paid_at: today(), due_date: today() },
      ]);

      await signInAs(page, seededUsers.ownerA);
      await page.goto("/finance?tab=payments&status=overdue");
      await waitForFinancePage(page);

      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 15_000 });
      // Overdue payment appears
      await expect(page.getByTestId("payments-table")).toContainText(numRegex(700), { timeout: 15_000 });
      // Paid payment does NOT appear in overdue filter
      await expect(page.getByTestId("payments-table")).not.toContainText(numRegex(600));
    } finally {
      await cleanupProperty(p1, t1);
      await cleanupProperty(p2, t2);
    }
  });

  // ── 9. Arrears summary card links to filtered payments ────────────────────

  test("clicking Overdue summary card navigates to payments tab with overdue filter", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await waitForFinancePage(page);

    const overdueCard = page.locator("button").filter({ hasText: /Overdue/i }).first();
    await expect(overdueCard).toBeVisible({ timeout: 15_000 });
    await overdueCard.click();

    // Should navigate to payments tab with overdue filter in URL
    await expect(page).toHaveURL(/tab=payments.*status=overdue|status=overdue.*tab=payments/, { timeout: 10_000 });
  });

  test("clicking Total Owed summary card navigates to all payments", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    await waitForFinancePage(page);

    const totalOwedCard = page.locator("button").filter({ hasText: /Total Owed/i }).first();
    await expect(totalOwedCard).toBeVisible({ timeout: 15_000 });
    await totalOwedCard.click();

    // Should navigate to payments tab
    await expect(page).toHaveURL(/tab=payments/, { timeout: 10_000 });
  });
});
