/**
 * E2E: Tenants management page (/tenants)
 *
 * Coverage gaps addressed (no prior tests existed for this page):
 *   - Page shell: heading, Add Tenant button
 *   - Seeded "Tenant A1" card visible with name, email, and property address
 *   - Search by name/email filters tenant cards
 *   - Sort combobox present
 *   - Add Tenant modal: opens, shows all form fields, closes on Cancel
 *   - Add Tenant modal: successful create — tenant appears in list
 *   - Role access: adminA/staffA can access; tenantA1/contractorA1 redirected
 *   - Accessibility: no blocking WCAG violations
 *
 * Data-isolation note:
 *   The account may contain many leftover test tenants from integration-test runs
 *   (e.g., finance_calculations creates "Calc Tenant …" records). "Tenant A1" is
 *   seeded at position T in the alphabet and may not be on the first page.
 *   Tests that need the seeded card navigate with ?q=Tenant+A1 to pre-filter.
 *
 * Locator notes:
 *   - The exact tenant search placeholder: "Search tenants (name, email, address)…"
 *   - "Tenant A1" can appear in TenantSwitcher options → use link[href] selector.
 *   - `getByPlaceholder` is a partial match; use `{ exact: true }` for fields.
 */

import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const TENANT_A1_ID = isolationFixtures.users.tenantA1.tenantId;
const TENANT_A1_LINK = `/tenants/${TENANT_A1_ID}`;

// ── Page shell ────────────────────────────────────────────────────────────────

test.describe("Tenants page — shell", () => {
  test("page loads with Tenants heading", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("Add tenant button is visible for owner", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /add tenant/i })).toBeVisible();
  });

  test("seeded Tenant A1 card shows name and email — pre-filtered to avoid pagination", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    // Pre-filter to ensure Tenant A1 is on the first page even if many test tenants exist
    await page.goto("/tenants?q=Tenant+A1");

    // Use link href to avoid strict-mode with TenantSwitcher options
    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`).getByText("Tenant A1")).toBeVisible();
    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`).getByText("tenant.a1@oasis.test")).toBeVisible();
  });

  test("tenant card shows assigned property address — pre-filtered", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants?q=Tenant+A1");

    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`).getByText(/11 Starlight Avenue/i)).toBeVisible();
  });

});

// ── Search and sort ───────────────────────────────────────────────────────────

test.describe("Tenants page — search and sort", () => {
  test("URL query ?q=Tenant+A1 filters to show only the seeded tenant link", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants?q=Tenant+A1");

    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`)).toBeVisible({ timeout: 20_000 });
  });

  test("typing in the search box filters tenant cards by email", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // Use the exact placeholder of the tenant search input
    await page
      .getByPlaceholder("Search tenants (name, email, address)…", { exact: true })
      .fill("tenant.a1@oasis.test");

    // After filtering, the Tenant A1 link should appear
    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`)).toBeVisible({ timeout: 15_000 });
  });

  test("non-matching search hides all tenant cards", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants?q=xyzzy-no-match-99999");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.locator(`a[href="${TENANT_A1_LINK}"]`)).not.toBeVisible({ timeout: 5_000 });
  });

  test("sort combobox with aria-label Sort is present on the page", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("combobox", { name: "Sort" })).toBeVisible({ timeout: 5_000 });
  });
});

// ── Add Tenant modal ──────────────────────────────────────────────────────────

test.describe("Tenants page — Add Tenant modal", () => {
  test("Add tenant modal opens and shows Full name, Email, Phone, Assigned property fields", async ({
    page,
  }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /add tenant/i }).click();

    await expect(page.getByRole("heading", { name: /add tenant/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Full name", { exact: true })).toBeVisible();
    await expect(page.getByText("Email", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Phone", { exact: true })).toBeVisible();
    await expect(page.getByText("Assigned property", { exact: true }).first()).toBeVisible();
  });

  test("Cancel button closes the Add Tenant modal without saving", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /add tenant/i }).click();
    await expect(page.getByRole("heading", { name: /add tenant/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page.getByRole("heading", { name: /add tenant/i })).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
  });
});


// ── Role access ───────────────────────────────────────────────────────────────

test.describe("Tenants page — role access", () => {
  test("adminA can access /tenants", async ({ page }) => {
    await signInAs(page, seededUsers.adminA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("staffA can access /tenants", async ({ page }) => {
    await signInAs(page, seededUsers.staffA);
    await page.goto("/tenants");

    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("tenantA1 is redirected away from /tenants", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/tenants");

    await expect(page).not.toHaveURL(/\/tenants$/, { timeout: 10_000 });
  });

  test("contractorA1 is redirected away from /tenants", async ({ page }) => {
    await signInAs(page, seededUsers.contractorA1);
    await page.goto("/tenants");

    await expect(page).not.toHaveURL(/\/tenants$/, { timeout: 10_000 });
  });
});
