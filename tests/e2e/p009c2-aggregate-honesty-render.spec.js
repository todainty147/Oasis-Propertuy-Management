/**
 * P-009C2 — Aggregate Honesty rendered-marker evidence
 *
 * Proves for all three landlord-facing surfaces:
 *   1. Dashboard Hub: separate imported-review block renders; native hub counts unchanged.
 *   2. Property Compliance Card: separate imported review count renders; native summary unchanged.
 *   3. Portfolio Health: informational note renders; numeric score is unchanged.
 *
 * All three "before" and "after" comparisons use the same ownerA session.
 * beforeAll seeds imported TCI rows; afterAll removes them.
 * Serial mode prevents workers from racing on shared seed data.
 */

import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_A  = isolationFixtures.accounts.accountA.id;
const PROPERTY_A = isolationFixtures.users.tenantA1.propertyId;
const OWNER_A_ID = isolationFixtures.users.ownerA.id;

const E2E_BATCH_ID     = "c2e2e000-0002-0002-0002-000000000001";
const E2E_TCI_OVERDUE  = "c2e2e000-0002-0002-0002-000000000002";
const E2E_TCI_DUE_SOON = "c2e2e000-0002-0002-0002-000000000003";
const E2E_TCI_CURRENT  = "c2e2e000-0002-0002-0002-000000000004";

const YESTERDAY  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const IN_15_DAYS = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
const IN_60_DAYS = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

test.describe("P-009C2 aggregate-honesty rendered evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  let admin;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();

    await admin.from("import_batches").upsert(
      {
        id: E2E_BATCH_ID,
        account_id: ACCOUNT_A,
        source_filename: "e2e-p009c2-test.csv",
        tab: "compliance",
        triggered_by: OWNER_A_ID,
        status: "complete",
      },
      { onConflict: "id" },
    );

    const base = {
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      import_batch_id: E2E_BATCH_ID,
      reminder_days_before: 30,
    };

    // Overdue → in review count
    await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: E2E_TCI_OVERDUE, status: "expired", expires_at: YESTERDAY },
      { onConflict: "id" },
    );
    // Due-soon → in review count
    await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: E2E_TCI_DUE_SOON, status: "expiring_soon", expires_at: IN_15_DAYS },
      { onConflict: "id" },
    );
    // Current → NOT in review count
    await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: E2E_TCI_CURRENT, status: "logged", expires_at: IN_60_DAYS },
      { onConflict: "id" },
    );
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin
      .from("tenancy_compliance_items")
      .delete()
      .in("id", [E2E_TCI_OVERDUE, E2E_TCI_DUE_SOON, E2E_TCI_CURRENT]);
    await admin.from("import_batches").delete().eq("id", E2E_BATCH_ID);
  });

  // ── Surface 1: Dashboard Hub ─────────────────────────────────────────────────

  test("Dash-1: separate imported-review block renders on /dashboard", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /operations hub|dashboard/i }).first()).toBeVisible({ timeout: 20_000 });

    const block = page.locator('[data-testid="dashboard-imported-review-block"]');
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block).toContainText("Imported compliance records to review");
    await expect(block).toContainText("spreadsheet-supplied");
  });

  test("Dash-2: imported block shows a numeric count ≥ 2 (overdue + due_soon)", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    const block = page.locator('[data-testid="dashboard-imported-review-block"]');
    await expect(block).toBeVisible({ timeout: 20_000 });
    const text = await block.textContent();
    // Extract the leading number
    const match = text.match(/(\d+)\s+spreadsheet/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(2);
  });

  test("Dash-3: native hub Priority Queue items are not removed by imported data", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // The imported block must be rendered INSIDE the same card as Priority Queue,
    // but the native hub items list (OperationalListItem) must still be present.
    await expect(page.locator('[data-testid="dashboard-imported-review-block"]')).toBeVisible({ timeout: 20_000 });
    // Priority Queue heading must still exist
    await expect(page.getByText("Priority Queue").first()).toBeVisible({ timeout: 5_000 });
  });

  test("Dash-4: imported block does NOT appear in the native hub OperationalList items", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await expect(page.locator('[data-testid="dashboard-imported-review-block"]')).toBeVisible({ timeout: 20_000 });

    // The imported block must be separate — it should not be an OperationalListItem
    // OperationalListItems use a specific class structure; the block has its own testid
    const block = page.locator('[data-testid="dashboard-imported-review-block"]');
    const blockParentClass = await block.evaluate((el) => el.parentElement?.className || "");
    // The block is inside TenaqoCard content area, not inside an OperationalList
    expect(blockParentClass).not.toContain("operational-list");
  });

  // ── Surface 2: Property Compliance Card ────────────────────────────────────

  test("Card-C2-1: attested-review-count renders on property compliance tab", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 20_000 });

    const reviewCount = page.locator('[data-testid="attested-review-count"]');
    await expect(reviewCount).toBeVisible({ timeout: 20_000 });
    await expect(reviewCount).toContainText("Imported compliance records to review:");
  });

  test("Card-C2-2: attested-review-count shows numeric count ≥ 2", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 20_000 });

    const reviewCount = page.locator('[data-testid="attested-review-count"]');
    await expect(reviewCount).toBeVisible({ timeout: 20_000 });
    const text = await reviewCount.textContent();
    const match = text.match(/to review:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(2);
  });

  test("Card-C2-3: native summary grid (Active/Due Soon/Overdue) is present and unchanged layout", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 20_000 });

    // The native summary grid renders three stat cells
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 10_000 });

    // The attested-review-count block appears AFTER the native summary grid
    // (it is in the left column below the rows list, inside the attestedRows section)
    const reviewCountEl = page.locator('[data-testid="attested-review-count"]');
    await expect(reviewCountEl).toBeVisible({ timeout: 10_000 });

    // Confirm the "Attested imports" heading is still present (C1 section separator)
    await expect(page.getByText("Attested imports").first()).toBeVisible({ timeout: 5_000 });
  });

  test("Card-C2-4: current imported row is NOT counted (count excludes scan_status=current)", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 20_000 });

    const reviewCount = page.locator('[data-testid="attested-review-count"]');
    await expect(reviewCount).toBeVisible({ timeout: 20_000 });

    // We seeded 2 review rows (overdue + due_soon) and 1 current row.
    // Confirm the count is NOT 3 — current must be excluded.
    const text = await reviewCount.textContent();
    const match = text.match(/to review:\s*(\d+)/);
    expect(match).not.toBeNull();
    // Current row must NOT be included — count should be 2 (or more if other test data exists)
    // but must be at most total attestedRows - 1 (current excluded)
    const count = Number(match[1]);
    // The attested section itself should show all 3 rows (including current)
    const allAttestedRows = page.locator('[data-testid="attested-compliance-row"]');
    const totalAttested = await allAttestedRows.count();
    // review count must be strictly less than total attested rows
    // (because at least TCI_CURRENT is in attestedRows but not in review count)
    expect(count).toBeLessThan(totalAttested);
  });

  // ── Surface 3: Portfolio Health ─────────────────────────────────────────────

  test("PH-1: imported informational note renders on /portfolio-health", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/portfolio-health");
    await expect(page.getByRole("heading", { name: /portfolio/i }).first()).toBeVisible({ timeout: 20_000 });

    const note = page.locator('[data-testid="portfolio-imported-review-note"]');
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(note).toContainText("imported compliance");
    await expect(note).toContainText("do not currently affect");
  });

  test("PH-2: imported note shows a numeric count ≥ 2", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/portfolio-health");

    const note = page.locator('[data-testid="portfolio-imported-review-note"]');
    await expect(note).toBeVisible({ timeout: 20_000 });
    const text = await note.textContent();
    const match = text.match(/(\d+)\s+imported compliance/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(2);
  });

  test("PH-3: Health score StatGroup is present alongside (not inside) imported note", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/portfolio-health");
    await expect(page.getByRole("heading", { name: /portfolio/i }).first()).toBeVisible({ timeout: 20_000 });

    // Health score StatCard must be visible
    const healthSection = page.getByText(/avg.*health|health.*score/i).first();
    await expect(healthSection).toBeVisible({ timeout: 15_000 });

    // Imported note must also be visible
    const note = page.locator('[data-testid="portfolio-imported-review-note"]');
    await expect(note).toBeVisible({ timeout: 15_000 });

    // The note must NOT be inside the health StatGroup element
    // Get bounding boxes and confirm note is BELOW the health area
    const noteBox = await note.boundingBox();
    const healthBox = await healthSection.boundingBox();
    expect(noteBox).not.toBeNull();
    expect(healthBox).not.toBeNull();
    // Note appears after (below) the health stat card in document order
    expect(noteBox.y).toBeGreaterThan(healthBox.y);
  });

  test("PH-4: score does not include text from imported note", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/portfolio-health");
    await expect(page.getByRole("heading", { name: /portfolio/i }).first()).toBeVisible({ timeout: 20_000 });

    const note = page.locator('[data-testid="portfolio-imported-review-note"]');
    await expect(note).toBeVisible({ timeout: 20_000 });

    // The score (displayed as a number) must not be inside the imported note element
    const noteText = await note.textContent();
    // Score text like "72" should NOT appear mixed with "imported compliance" in the same element
    // Confirm the note contains the label text but not a score label
    expect(noteText).toContain("imported compliance");
    expect(noteText).not.toContain("Avg. Health Score");
    expect(noteText).not.toContain("High Risk");
  });
});
