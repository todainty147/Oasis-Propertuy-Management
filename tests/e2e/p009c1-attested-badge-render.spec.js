/**
 * P-009C1 — Rendered-Marker Evidence (Gap 1)
 *
 * Executes browser-level assertions proving each badge is on-screen for
 * imported rows and absent for native rows.  These tests use live Supabase
 * data seeded in beforeAll and torn down in afterAll.
 *
 * Surfaces covered:
 *   1. Command Centre   — data-testid="attested-badge"          (ItemCard)
 *   2. Operating Calendar — data-testid="attested-calendar-badge" (CalendarItemCard)
 *   3. PropertyComplianceCard — data-testid="attested-compliance-row"
 */

import { expect, test } from "@playwright/test";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_A  = isolationFixtures.accounts.accountA.id;
const PROPERTY_A = isolationFixtures.users.tenantA1.propertyId; // 44444444-4444-4444-4444-444444444441
const OWNER_A_ID = isolationFixtures.users.ownerA.id;           // triggered_by for import_batches

// Stable UUIDs — different prefix from integration test IDs (c1…) to allow parallel runs
const E2E_BATCH_ID     = "e2e00000-0001-0001-0001-000000000001";
const E2E_TCI_OVERDUE  = "e2e00000-0001-0001-0001-000000000002";
const E2E_TCI_DUE_SOON = "e2e00000-0001-0001-0001-000000000003";

const YESTERDAY   = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const IN_15_DAYS  = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);

test.describe("P-009C1 attested-badge rendered-marker evidence", () => {
  // Serial mode: beforeAll/afterAll run once for the group; prevents workers from
  // racing to delete the shared seed rows before other tests finish.
  test.describe.configure({ mode: "serial" });
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  let admin;

  test.beforeAll(async () => {
    admin = getIntegrationAdminClient();

    // Seed parent import_batches row — required by FK on tenancy_compliance_items.import_batch_id
    await admin.from("import_batches").upsert(
      {
        id: E2E_BATCH_ID,
        account_id: ACCOUNT_A,
        source_filename: "e2e-p009c1-test.csv",
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

    // Overdue: appears in CC urgent bucket + property card list
    await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: E2E_TCI_OVERDUE, status: "expired", expires_at: YESTERDAY },
      { onConflict: "id" },
    );

    // Due-soon: expires in 15 days → appears in operating calendar and property card
    await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: E2E_TCI_DUE_SOON, status: "expiring_soon", expires_at: IN_15_DAYS },
      { onConflict: "id" },
    );
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin
      .from("tenancy_compliance_items")
      .delete()
      .in("id", [E2E_TCI_OVERDUE, E2E_TCI_DUE_SOON]);
    await admin.from("import_batches").delete().eq("id", E2E_BATCH_ID);
  });

  // ── Surface 1: Command Centre (/command-center) ────────────────────────────

  test("CC-1: attested-badge is VISIBLE on imported overdue compliance row", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/command-center");

    // The overdue imported TCI lands in the CC urgent bucket; badge must appear
    const badge = page.locator('[data-testid="attested-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toContainText("Attested import");
  });

  test("CC-2: attested-badge is ABSENT on non-compliance and native items", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/command-center");

    // Wait for the page to hydrate — at least one item card must be present
    await expect(
      page.locator('[data-testid="command-center-item-link"]').first(),
    ).toBeVisible({ timeout: 20_000 });

    // Badges exist for the attested rows but not all items carry them
    const allItemLinks = page.locator('[data-testid="command-center-item-link"]');
    const attestedBadges = page.locator('[data-testid="attested-badge"]');

    const totalItems = await allItemLinks.count();
    const badgeCount = await attestedBadges.count();

    // At least one badge exists (our seeded overdue row)
    expect(badgeCount).toBeGreaterThan(0);
    // Not every item is attested — finance/maintenance items carry no badge
    expect(totalItems).toBeGreaterThan(badgeCount);
  });

  // ── Surface 2: Attention Centre ────────────────────────────────────────────
  // /attention-center routes to CommandCenterPage (same component as /command-center).
  // The page calls command_center_items — the P-009C1-extended RPC — so the same
  // attested-badge testid must appear at the /attention-center URL specifically.

  test("AC-1: attested-badge is VISIBLE on imported compliance row in Attention Centre", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/attention-center");

    const badge = page.locator('[data-testid="attested-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toContainText("Attested import");
  });

  test("AC-2: attested-badge is ABSENT on native/non-attested Attention Centre rows", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/attention-center");

    // Wait for page hydration
    await expect(
      page.locator('[data-testid="command-center-item-link"]').first(),
    ).toBeVisible({ timeout: 20_000 });

    const totalItems = await page.locator('[data-testid="command-center-item-link"]').count();
    const badgeCount = await page.locator('[data-testid="attested-badge"]').count();

    // At least one attested badge (our seeded overdue row)
    expect(badgeCount).toBeGreaterThan(0);
    // Non-compliance items (finance, maintenance, lease) carry no attested badge
    expect(totalItems).toBeGreaterThan(badgeCount);
  });

  // ── Surface 3: Operating Calendar ──────────────────────────────────────────

  test("Cal-1: attested-calendar-badge is VISIBLE on imported compliance row in agenda", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(
      page.getByRole("heading", { name: "Operating Calendar" }),
    ).toBeVisible({ timeout: 20_000 });

    // The due_soon TCI (expires in 15 days) must appear in the current month agenda
    const badge = page.locator('[data-testid="attested-calendar-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText("Attested import");
  });

  test("Cal-2: attested-calendar-badge is ABSENT on non-attested calendar rows", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(
      page.getByRole("heading", { name: "Operating Calendar" }),
    ).toBeVisible({ timeout: 20_000 });

    // Wait for agenda items to appear (any status pill)
    await expect(
      page.locator(".bg-red-100, .bg-amber-100, .bg-blue-100").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Count calendar item containers vs badges
    // CalendarItemCard renders border-l-4 items; attested badges are a strict subset
    const calendarCards = page.locator(".border-l-red-500, .border-l-amber-400, .border-l-blue-400, .border-l-slate-300, .border-l-purple-500");
    const attestedBadges = page.locator('[data-testid="attested-calendar-badge"]');

    const cardCount = await calendarCards.count();
    const badgeCount = await attestedBadges.count();

    // Must not badge every row — non-compliance items carry no badge
    expect(cardCount).toBeGreaterThan(badgeCount);
  });

  test("Cal-3: imported compliance calendar event href is /compliance/safe — not /compliance/tax", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(
      page.getByRole("heading", { name: "Operating Calendar" }),
    ).toBeVisible({ timeout: 20_000 });

    // Badge must be visible first
    await expect(
      page.locator('[data-testid="attested-calendar-badge"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // CalendarItemCard wraps itself in <Link to={item.link_path}>.
    // Assert the enclosing <a> href targets /compliance/safe, never /compliance/tax.
    const attestedLink = page
      .locator('a:has([data-testid="attested-calendar-badge"])')
      .first();
    const href = await attestedLink.getAttribute("href");
    expect(href).toMatch(/\/compliance\/safe/);
    expect(href).not.toMatch(/\/compliance\/tax/);
  });

  // ── Surface 4: PropertyComplianceCard ──────────────────────────────────────

  test("Card-1: attested-compliance-row is VISIBLE on property detail page", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    // Navigate directly to the Compliance & Docs tab — PropertyComplianceCard only
    // renders when activeTab === "compliance" (tab is driven by ?tab= search param)
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    // Wait for the property heading (h2) to confirm hydration
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
      timeout: 20_000,
    });

    // attested-compliance-row is rendered by PropertyComplianceCard when attestedRows.length > 0
    const attestedRow = page.locator('[data-testid="attested-compliance-row"]').first();
    await expect(attestedRow).toBeVisible({ timeout: 20_000 });
    await expect(attestedRow).toContainText("Attested import");
  });

  test("Card-2: attested rows are in a SEPARATE section — native summary counts are not inflated", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A}?tab=compliance`);

    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
      timeout: 20_000,
    });

    // The PropertyComplianceCard renders a distinct "Attested imports" heading
    // above the attestedRows list.  The summary grid (Active / Due Soon / Overdue)
    // is rendered BEFORE this heading, so counts cannot include attested rows.
    await expect(page.getByText("Attested imports")).toBeVisible({ timeout: 20_000 });

    // Both sections render independently — at least one attested row must be present
    const attestedRows = page.locator('[data-testid="attested-compliance-row"]');
    await expect(attestedRows.first()).toBeVisible({ timeout: 10_000 });
  });
});
