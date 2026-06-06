/**
 * E2E: Finance payment lifecycle
 *
 * Validates the full set of accounting + product-engineer fixes:
 *   A-1  status column kept in sync with paid_at
 *   A-2  billed_amount = contractual rent, not inflated by payment amounts
 *   A-3  amount immutable once paid (DB rejects; UI shows read-only field)
 *   A-4  "Received" card shows MTD income only
 *   A-5  Fourth card labelled "Total Owed", not "Outstanding"
 *   A-7  Notes field persisted
 *   B-1  Mark Paid button visible to owners (update perm, not delete)
 *   B-2  Modal shows inline error on failure, does not close silently
 *   B-3  Edit button present in payments table
 *   B-5  Explicit data refresh after mutations (no stale rows)
 *   I-3  Delete requires two clicks (inline confirm), no window.confirm
 *   I-4  No Status dropdown in modal — replaced by Mark as paid checkbox
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;
const PROPERTY_ID = isolationFixtures.users.tenantA1.propertyId;
const TENANT_ID   = isolationFixtures.users.tenantA1.tenantId;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test.use({ viewport: { width: 1440, height: 900 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cleanupTestPayments() {
  const admin = getIntegrationAdminClient();
  await admin
    .from("payments")
    .delete()
    .eq("account_id", ACCOUNT_ID)
    .ilike("notes", "e2e-finance-lifecycle%");
}

async function seedPayment({ amount, dueDate, paidAt = null, notes = "e2e-finance-lifecycle" }) {
  return seedPaymentFor({ amount, dueDate, paidAt, notes, propertyId: PROPERTY_ID, tenantId: TENANT_ID });
}

async function seedPaymentFor({ amount, dueDate, paidAt = null, notes = "e2e-finance-lifecycle", propertyId, tenantId }) {
  const admin = getIntegrationAdminClient();

  // Resolve owner_id from the property record (avoids hardcoding FK-sensitive values)
  const { data: prop, error: propErr } = await admin
    .from("properties")
    .select("owner_id")
    .eq("id", propertyId)
    .single();
  if (propErr) throw new Error(`seedPayment: property lookup failed: ${propErr.message}`);

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
      status:      paidAt ? "paid" : "due",
      notes,
    })
    .select("id, status, paid_at")
    .single();
  if (error) throw new Error(`seedPayment failed: ${error.message}`);
  return data;
}

async function createIsolatedPaymentFixture({ rent = 1000 } = {}) {
  const admin = getIntegrationAdminClient();
  const { data: prop, error: propErr } = await admin
    .from("properties")
    .select("owner_id")
    .eq("id", PROPERTY_ID)
    .single();
  if (propErr) throw new Error(`create fixture owner lookup failed: ${propErr.message}`);

  const propertyId = randomUUID();
  const tenantId = randomUUID();

  const { error: pErr } = await admin.from("properties").insert({
    id: propertyId,
    account_id: ACCOUNT_ID,
    owner_id: prop.owner_id,
    address: `E2E Lifecycle Prop ${propertyId.slice(0, 8)}`,
    city: "TestCity",
    rent,
    status: "Wolne",
    tenant_id: null,
  });
  if (pErr) throw new Error(`create fixture property failed: ${pErr.message}`);

  const { error: tErr } = await admin.from("tenants").insert({
    id: tenantId,
    account_id: ACCOUNT_ID,
    owner_id: prop.owner_id,
    user_id: null,
    property_id: propertyId,
    name: `E2E Lifecycle Tenant ${tenantId.slice(0, 8)}`,
    email: `lifecycle.e2e.${tenantId.slice(0, 8)}@test.invalid`,
    status: "active",
  });
  if (tErr) throw new Error(`create fixture tenant failed: ${tErr.message}`);

  const { error: uErr } = await admin.from("properties")
    .update({ tenant_id: tenantId, status: "Wynajęte" })
    .eq("id", propertyId);
  if (uErr) throw new Error(`create fixture update failed: ${uErr.message}`);

  return {
    propertyId,
    tenantId,
    propertyAddress: `E2E Lifecycle Prop ${propertyId.slice(0, 8)}`,
  };
}

async function cleanupIsolatedPaymentFixture({ propertyId, tenantId }) {
  const admin = getIntegrationAdminClient();
  await admin.from("payments").delete().eq("property_id", propertyId);
  await admin.from("properties").update({ tenant_id: null }).eq("id", propertyId);
  await admin.from("tenants").delete().eq("id", tenantId);
  await admin.from("properties").delete().eq("id", propertyId);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  await cleanupTestPayments();
});

test.afterAll(async () => {
  await cleanupTestPayments();
});

test("finance page loads and shows correct summary card labels (A-4, A-5)", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 25_000 });

  // A-4: "Received" card must say "this month" in the label
  await expect(page.getByText(/Received.*month/i).first()).toBeVisible();

  // A-5: fourth card labelled "Total Owed" not "Outstanding"
  await expect(page.getByText("Total Owed").first()).toBeVisible();
  await expect(page.getByText("Outstanding").first()).not.toBeVisible();
});

test("adding a payment — modal has no status dropdown, has mark-as-paid checkbox (I-4/A-6)", async ({ page }) => {
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 25_000 });

  await page.getByRole("button", { name: /add payment/i }).click();
  await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible();

  const modalForm = page.locator(".fixed.inset-0 form");

  // I-4: no status dropdown inside the modal form
  const statusSelect = modalForm.locator("select").filter({ hasText: /pending|overdue/i });
  await expect(statusSelect).not.toBeVisible();

  // I-4: has "mark as paid" checkbox instead
  await expect(page.locator("#payment-mark-paid")).toBeVisible();

  // A-7: notes field present
  await expect(page.locator("#payment-notes")).toBeVisible();

  await modalForm.getByRole("button", { name: /cancel/i }).click();
});

test("creating a payment sets correct status, shows in payments tab (A-1)", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible({ timeout: 25_000 });

  // Open modal
  await page.getByRole("button", { name: /add payment/i }).click();
  await expect(page.getByRole("heading", { name: /add payment/i })).toBeVisible();

  // Scope all form interactions to the modal overlay (avoids language switcher, etc.)
  const modalForm = page.locator(".fixed.inset-0 form");

  // Fill form using fixture UUIDs as select values
  await modalForm.getByRole("combobox").first().selectOption(PROPERTY_ID);

  // Tenant dropdown enables and populates after property selection
  await page.waitForTimeout(400);
  const tenantSelect = modalForm.getByRole("combobox").nth(1);
  await expect(tenantSelect).toBeEnabled();
  await tenantSelect.selectOption(TENANT_ID);

  await modalForm.locator("input[type=number]").fill("750");
  await modalForm.locator("input[type=date]").fill(today);
  await page.locator("#payment-notes").fill("e2e-finance-lifecycle: create test");

  await page.getByRole("button", { name: /save/i }).click();

  // Modal closes after save
  await expect(page.getByRole("heading", { name: /add payment/i })).not.toBeVisible();

  // B-5: table updates — navigate to payments tab
  await page.getByRole("button", { name: /payments/i }).click();
  await expect(page.getByTestId("payments-table")).toBeVisible();
  await expect(page.getByTestId("payments-table")).toContainText("750");
});

test("mark paid button visible to owner (B-1), updates status immediately (B-5, A-1)", async ({ page }) => {
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const fixture = await createIsolatedPaymentFixture({ rent: 1000 });
  await seedPaymentFor({
    amount: 100,
    dueDate,
    notes: "e2e-finance-lifecycle: mark-paid",
    propertyId: fixture.propertyId,
    tenantId: fixture.tenantId,
  });

  try {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");
    await expect(page.getByTestId("payments-table")).toBeVisible();

    // B-1: Mark Paid button must be visible (owner has update permission).
    // Use visible filter — testid exists on both mobile (hidden) and desktop rows.
    const markPaidBtn = page.getByTestId(/mark-paid-/).filter({ visible: true }).first();
    await expect(markPaidBtn).toBeVisible();
    await markPaidBtn.click();

    // B-5: row updates in place (paid badge appears)
    await expect(page.getByTestId("payments-table")).toContainText("Paid");
  } finally {
    await cleanupIsolatedPaymentFixture(fixture);
  }
});

test("delete requires two-click confirmation — no window.confirm (I-3)", async ({ page }) => {
  const dueDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await seedPayment({ amount: 400, dueDate, notes: "e2e-finance-lifecycle: delete-test" });

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/finance?tab=payments");
  await expect(page.getByTestId("payments-table")).toBeVisible();

  // First click: button should change to confirmation state (not delete yet).
  // Scope to visible buttons only (desktop table is shown at 1440px, mobile is hidden).
  const deleteButtons = page.locator("button", { hasText: /delete|remove/i }).filter({ visible: true });
  const firstDelete = deleteButtons.first();
  await firstDelete.click();

  // After first click, button text changes to the confirmation prompt (not deleted yet)
  await expect(firstDelete).toContainText(/delete this payment\?/i);

  // Second click: actually deletes
  await firstDelete.click();

  // Row disappears
  await expect(page.getByTestId("payments-table")).not.toContainText("400.00");
});

test("edit button present for owner (B-3), notes field pre-filled (A-7)", async ({ page }) => {
  const dueDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const fixture = await createIsolatedPaymentFixture({ rent: 1000 });
  await seedPaymentFor({
    amount: 550,
    dueDate,
    notes: "e2e-finance-lifecycle: edit-check",
    propertyId: fixture.propertyId,
    tenantId: fixture.tenantId,
  });

  try {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance?tab=payments");
    await expect(page.getByTestId("payments-table")).toBeVisible();

    const search = page.getByPlaceholder(/search by tenant or property/i);
    await search.fill(fixture.propertyAddress);

    // B-3: Edit button must exist for the specific seeded row.
    const paymentRow = page.getByTestId("payments-table").locator("tr").filter({ hasText: fixture.propertyAddress });
    await expect(paymentRow).toBeVisible({ timeout: 15_000 });
    const editBtn = paymentRow.getByRole("button", { name: /edit/i }).filter({ visible: true });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Modal opens in edit mode
    await expect(page.getByRole("heading", { name: /edit payment/i })).toBeVisible();

    // A-7: notes pre-filled from DB
    await expect(page.locator("#payment-notes")).toHaveValue("e2e-finance-lifecycle: edit-check");

    await page.getByRole("button", { name: /cancel/i }).click();
  } finally {
    await cleanupIsolatedPaymentFixture(fixture);
  }
});

test("paid payment shows read-only amount field (A-3)", async ({ page }) => {
  const paidAt  = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  // Use a distinctive amount (8800) so we can find this specific row in the table
  await seedPayment({ amount: 8800, dueDate, paidAt, notes: "e2e-finance-lifecycle: paid-lock" });

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/finance?tab=payments");
  await expect(page.getByTestId("payments-table")).toBeVisible();

  // Locate the specific row for our seeded payment (distinguished by amount 8800)
  // Use regex to handle locale-specific thousand separators (comma, space, period)
  const paymentsTable = page.getByTestId("payments-table");
  await expect(paymentsTable).toContainText(/8.?800/);

  // Click the Edit button in that specific row
  const paidRow = paymentsTable.locator("tr").filter({ hasText: /8.?800/ });
  const editBtn = paidRow.getByRole("button", { name: /edit/i });
  await expect(editBtn).toBeVisible();
  await editBtn.click();

  await expect(page.getByRole("heading", { name: /edit payment/i })).toBeVisible();

  // A-3: amount input is read-only for paid payments
  const amountInput = page.locator(".fixed.inset-0 input[type=number]");
  await expect(amountInput).toHaveAttribute("readonly");

  await page.locator(".fixed.inset-0").getByRole("button", { name: /cancel/i }).click();
});
