/**
 * E-172 Fix G — Finance page: ended-tenancy note browser evidence
 *
 * Proves that Finance.jsx renders the "Tenancy ended / No ongoing balance is
 * being tracked." note (data-testid="finance-tenancy-ended-note") for rows
 * where isTenancyEnded=true, and does NOT render the "Set up finance tracking"
 * CTA for the same row.
 *
 * Setup: creates an isolated property + tenant in accountA, inserts a lease
 * with lease_end_date in the past (2024-06-30) so is_tenancy_ended=true.
 *
 * EXECUTED_E2E_BROWSER
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { prepareEnglishLocale, seededUsers, signInAs } from "./helpers/auth.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;
const SCREENSHOT_DIR = "artifacts/evidence";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("E-172 Fix G: Finance page — ended-tenancy note", () => {
  // Serial mode: all tests share one worker so beforeAll/afterAll run once and
  // parallel sign-in collisions are avoided when run alongside other specs.
  test.describe.configure({ mode: "serial" });
  test.skip(
    !isIntegrationHarnessConfigured(),
    "requires local Supabase harness",
  );

  let isolatedPropId;
  let isolatedTenantId;
  let isolatedLeaseId;

  test.beforeAll(async () => {
    const admin = getIntegrationAdminClient();

    // Resolve ownerA's user_id from existing fixture property
    const { data: propRow, error: propErr } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", isolationFixtures.users.tenantA1.propertyId)
      .single();
    if (propErr) throw new Error(`resolveOwnerId: ${propErr.message}`);
    const ownerUserId = propRow.owner_id;

    isolatedPropId = randomUUID();
    isolatedTenantId = randomUUID();
    isolatedLeaseId = randomUUID();

    const propAddress = `E2E G-Ended Prop ${isolatedPropId.slice(0, 8)}`;

    // 1. Create isolated property as vacant first (check constraint: status="Wynajęte"
    //    requires non-null tenant_id, so insert as "Wolne" and update after tenant is created)
    const { error: createPropErr } = await admin.from("properties").insert({
      id: isolatedPropId,
      account_id: ACCOUNT_ID,
      owner_id: ownerUserId,
      address: propAddress,
      city: "EndedCity",
      rent: 800,
      status: "Wolne",
      tenant_id: null,
    });
    if (createPropErr) throw new Error(`create property: ${createPropErr.message}`);

    // 2. Create isolated tenant
    const { error: createTenantErr } = await admin.from("tenants").insert({
      id: isolatedTenantId,
      account_id: ACCOUNT_ID,
      owner_id: ownerUserId,
      user_id: null,
      property_id: isolatedPropId,
      name: `E2E Ended Tenant ${isolatedTenantId.slice(0, 8)}`,
      email: `e2e.ended.${isolatedTenantId.slice(0, 8)}@test.invalid`,
      status: "active",
    });
    if (createTenantErr) throw new Error(`create tenant: ${createTenantErr.message}`);

    // 3. Link tenant to property and mark as occupied.
    //    status_matches_tenant constraint: "Wynajęte" requires non-null tenant_id;
    //    both must be set in the same update so the constraint is satisfied atomically.
    const { error: linkErr } = await admin
      .from("properties")
      .update({ tenant_id: isolatedTenantId, status: "Wynajęte" })
      .eq("id", isolatedPropId);
    if (linkErr) throw new Error(`link tenant: ${linkErr.message}`);

    // 4. Insert a lease with lease_end_date in the past → is_tenancy_ended = true
    //    renewal_status = 'active' but lease_end_date < CURRENT_DATE means the
    //    NOT EXISTS subquery finds no qualifying row → is_tenancy_ended = true.
    const { error: leaseErr } = await admin.from("leases").insert({
      id: isolatedLeaseId,
      account_id: ACCOUNT_ID,
      property_id: isolatedPropId,
      tenant_id: isolatedTenantId,
      lease_start_date: "2023-07-01",
      lease_end_date: "2024-06-30",
      renewal_status: "active",
    });
    if (leaseErr) throw new Error(`create lease: ${leaseErr.message}`);
  });

  test.afterAll(async () => {
    const admin = getIntegrationAdminClient();
    if (isolatedLeaseId) {
      await admin.from("leases").delete().eq("id", isolatedLeaseId);
    }
    if (isolatedPropId && isolatedTenantId) {
      await admin.from("properties").update({ tenant_id: null }).eq("id", isolatedPropId);
      await admin.from("tenants").delete().eq("id", isolatedTenantId);
      await admin.from("properties").delete().eq("id", isolatedPropId);
    }
  });

  /** Navigate to Finance page and wait for the property-finance section to load.
   *  Also increases the per-page size to 50 so the isolated property row is
   *  visible even if many other test properties have accumulated in accountA.
   */
  async function gotoFinancePage(page) {
    await prepareEnglishLocale(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");
    // Wait for Finance heading to confirm mount
    await expect(
      page.getByRole("heading", { name: "Finance", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    // Wait for property-finance-table to confirm the overview data loaded
    await expect(page.getByTestId("property-finance-table")).toBeVisible({
      timeout: 20_000,
    });
    // Increase the per-page size to 50 so the isolated property is visible even
    // if many test properties have accumulated in accountA (default page size = 10).
    // The PaginationFooter select has aria-label="Per page" (English locale).
    const perPageSelect = page.getByLabel("Per page").first();
    if (await perPageSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await perPageSelect.selectOption("50");
      // Wait for the table to re-render with the new page size
      await page.waitForTimeout(500);
    }
  }

  test("G-E2E-01: finance-tenancy-ended-note is visible for the past-ended tenancy row", async ({ page }) => {
    await gotoFinancePage(page);

    // The desktop table row for our isolated property
    const propRow = page.getByTestId(`finance-prop-row-${isolatedPropId}`);
    await expect(propRow).toBeVisible({ timeout: 15_000 });

    const endedNote = propRow.getByTestId("finance-tenancy-ended-note");
    await expect(endedNote).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/g-e2e-01-ended-note-visible.png`,
      fullPage: true,
    });
  });

  test("G-E2E-02: ended note contains 'Tenancy ended' text", async ({ page }) => {
    await gotoFinancePage(page);

    const propRow = page.getByTestId(`finance-prop-row-${isolatedPropId}`);
    await expect(propRow).toBeVisible({ timeout: 15_000 });

    const endedNote = propRow.getByTestId("finance-tenancy-ended-note");
    await expect(endedNote).toBeVisible({ timeout: 10_000 });
    await expect(endedNote).toContainText("Tenancy ended");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/g-e2e-02-ended-note-text.png`,
      fullPage: true,
    });
  });

  test("G-E2E-03: ended note does NOT contain currency symbol or zero-balance implication", async ({ page }) => {
    await gotoFinancePage(page);

    const propRow = page.getByTestId(`finance-prop-row-${isolatedPropId}`);
    await expect(propRow).toBeVisible({ timeout: 15_000 });

    const endedNote = propRow.getByTestId("finance-tenancy-ended-note");
    await expect(endedNote).toBeVisible({ timeout: 10_000 });

    const noteText = await endedNote.textContent();
    expect(noteText).not.toContain("£");
    expect(noteText).not.toContain("paid");
    expect(noteText).not.toContain("settled");
    expect(noteText).not.toContain("zero");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/g-e2e-03-ended-note-no-currency.png`,
      fullPage: true,
    });
  });

  test("G-E2E-04: ended row does NOT contain 'Set up finance tracking' CTA", async ({ page }) => {
    await gotoFinancePage(page);

    const propRow = page.getByTestId(`finance-prop-row-${isolatedPropId}`);
    await expect(propRow).toBeVisible({ timeout: 15_000 });

    // The CTA button text must not appear anywhere in the row
    const ctaButton = propRow.getByText("Set up finance tracking", { exact: false });
    await expect(ctaButton).not.toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/g-e2e-04-ended-no-cta.png`,
      fullPage: true,
    });
  });

  test("G-E2E-05 (responsive): mobile viewport shows ended note and CTA is absent", async ({ page }) => {
    // Switch to mobile viewport BEFORE sign-in so the page renders at 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await prepareEnglishLocale(page);
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/finance");

    await expect(
      page.getByRole("heading", { name: "Finance", exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    // At mobile width (375px), the desktop table is hidden (hidden md:block).
    // The mobile card view (block md:hidden) is shown instead.
    // Wait for the Finance by Property section heading to load (mobile cards appear)
    await expect(page.getByText(/Finance by Property|By Property/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Increase the per-page size to 50 so the isolated property card is visible
    // even if many test properties have accumulated in accountA.
    const perPageSelect = page.getByLabel("Per page").first();
    if (await perPageSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await perPageSelect.selectOption("50");
      await page.waitForTimeout(500);
    }

    // The mobile card for our isolated property. Mobile cards use the same
    // finance-tenancy-ended-note testid as desktop rows (inside the card).
    const propAddress = `E2E G-Ended Prop ${isolatedPropId.slice(0, 8)}`;
    const mobileCard = page.getByText(propAddress, { exact: false }).first();
    await expect(mobileCard).toBeVisible({ timeout: 15_000 });

    // The ended note testid appears inside the mobile card
    const endedNote = page.getByTestId("finance-tenancy-ended-note").first();
    await expect(endedNote).toBeVisible({ timeout: 10_000 });

    // CTA must not be visible for the ended tenancy property
    await expect(
      page.getByText("Set up finance tracking", { exact: false }).filter({ visible: true }),
    ).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/g-e2e-05-mobile-ended-note.png`,
      fullPage: true,
    });
  });
});
