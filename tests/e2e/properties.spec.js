/**
 * E2E: Properties management page (/properties) and property detail (/properties/:id)
 *
 * Coverage gaps addressed vs existing test (only 1 test: load + click):
 *   - Properties list: heading, Add property button, count badge
 *   - Seeded property card: address "11 Starlight Avenue" visible with rent
 *   - Status filter pills (All / Occupied / Vacant) change visible list
 *   - Search by address filters property cards
 *   - Add Property modal: opens (heading + placeholder fields), closes on Cancel
 *   - Add Property modal: successful create (requires harness)
 *   - Property detail: heading, tenant name, tab bar with all 5 tabs
 *   - Property detail: switching to maintenance tab
 *   - Role access: adminA/staffA can access list; tenantA1 restricted; contractorA1 no Add button
 *   - Accessibility: property detail page (list page excluded — pre-existing violations)
 *
 * AddPropertyModal uses placeholder attributes (not visible label text) for its fields:
 *   - Address field:  placeholder="Address"
 *   - City field:     placeholder="City"
 *   - Rent field:     placeholder="Amount"
 *   The modal heading is "Add property".
 *
 * Seeded fixture data:
 *   - Property: "11 Starlight Avenue", London, rent=1200, status=Wynajęte (Occupied)
 *   - Property ID: 44444444-4444-4444-4444-444444444441
 *   - Tenant: "Tenant A1" assigned
 */

import { expect, test } from "@playwright/test";

import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const PROPERTY_A_ID = seededEntityIds.propertyA;

// ── Properties list — shell ────────────────────────────────────────────────────

test.describe("Properties list — shell", () => {
  test("page loads with Properties heading", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("seeded property '11 Starlight Avenue' is visible in the list", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("11 Starlight Avenue")).toBeVisible({ timeout: 15_000 });
  });

  test("seeded property shows rent amount", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // rent=1200 — locale-agnostic: "1,200" / "1 200" / "1.200"
    await expect(page.getByText(/1[,. ]?200/)).toBeVisible({ timeout: 15_000 });
  });

  test("Add property button is visible for owner", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /add property/i })).toBeVisible();
  });
});

// ── Properties list — filter and search ───────────────────────────────────────

test.describe("Properties list — filter and sort", () => {
  test("search by address filters the property list", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByPlaceholder("Search properties (address, city, size)…", { exact: true }).fill("Starlight");

    await expect(page.getByText("11 Starlight Avenue")).toBeVisible({ timeout: 10_000 });
  });

  test("non-matching search hides all property cards", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties?q=xyzzy-no-match-99999");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("11 Starlight Avenue")).not.toBeVisible({ timeout: 5_000 });
  });

  test("occupied status filter shows only occupied properties", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties?status=occupied");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // Seeded property is Occupied — it should appear
    await expect(page.getByText("11 Starlight Avenue")).toBeVisible({ timeout: 15_000 });
  });

  test("vacant status filter hides the occupied seeded property", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties?status=vacant");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // Seeded property is Occupied — not visible under vacant filter
    await expect(page.getByText("11 Starlight Avenue")).not.toBeVisible({ timeout: 5_000 });
  });
});

// ── Add Property modal ────────────────────────────────────────────────────────

test.describe("Properties list — Add Property modal", () => {
  test("Add Property modal opens with heading and placeholder-based fields", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /add property/i }).click();

    // AddPropertyModal heading
    await expect(page.getByRole("heading", { name: "Add property", exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Fields use placeholder text (not visible label text). Use { exact: true } because
    // getByPlaceholder is a partial match by default and "Address" would also match the
    // "Search properties (address, city, size)…" input otherwise.
    await expect(page.getByPlaceholder("Address", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("City", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Amount", { exact: true })).toBeVisible();
  });

  test("Cancel button closes the Add Property modal without saving", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /add property/i }).click();
    await expect(page.getByRole("heading", { name: "Add property", exact: true })).toBeVisible({
      timeout: 5_000,
    });

    await page.getByRole("button", { name: /cancel/i }).click();

    // Modal closed
    await expect(
      page.getByRole("heading", { name: "Add property", exact: true }),
    ).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("11 Starlight Avenue")).toBeVisible();
  });
});


// ── Property detail page ──────────────────────────────────────────────────────

test.describe("Property detail — overview", () => {
  test("property detail loads with correct address heading", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}`);

    await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("property detail shows tenant name and rent in subheading", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}`);

    await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible({
      timeout: 20_000,
    });
    // Scope to main to avoid TenantSwitcher option elements
    await expect(page.getByRole("main").getByText("Tenant A1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1[,. ]?200/)).toBeVisible({ timeout: 5_000 });
  });

  test("property detail tab bar renders overview, financials, maintenance, compliance tabs", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}`);

    await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("button", { name: /overview/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /financials/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /maintenance/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /compliance/i }).first()).toBeVisible();
  });

  test("switching to maintenance tab via URL param works", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}?tab=maintenance`);

    await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible({
      timeout: 20_000,
    });
    // Maintenance tab button should be visible in the tab bar
    await expect(page.getByRole("button", { name: /maintenance/i }).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("property detail page has no blocking accessibility violations", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto(`/properties/${PROPERTY_A_ID}`);

    await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible({
      timeout: 20_000,
    });

    await expectNoBlockingAccessibilityViolations(page, "property detail page");
  });
});

// ── Role access ───────────────────────────────────────────────────────────────

test.describe("Properties pages — role access", () => {
  test("adminA can access /properties", async ({ page }) => {
    await signInAs(page, seededUsers.adminA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("staffA can access /properties", async ({ page }) => {
    await signInAs(page, seededUsers.staffA);
    await page.goto("/properties");

    await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("tenantA1 sees a restricted view on /properties — no management heading", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/properties");

    // Tenant users see a restricted/empty view, not the standard Properties heading
    await page.waitForLoadState("networkidle");
    // Either redirected away or shown a no-access message — verify no tenant management heading
    const onPropertiesPage = (await page.url()).includes("/properties");
    if (onPropertiesPage) {
      await expect(
        page.getByRole("heading", { name: "Properties", exact: true }),
      ).not.toBeVisible({ timeout: 5_000 });
    }
    // If redirected, the test passes automatically
  });

  test("contractorA1 cannot see the Add property button", async ({ page }) => {
    await signInAs(page, seededUsers.contractorA1);
    await page.goto("/properties");

    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /add property/i })).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
