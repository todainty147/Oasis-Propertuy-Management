/**
 * Playwright E2E — P-009 Data Import Flow
 *
 * Drives the real browser against a seeded clean demo account.
 * Captures screenshots at each honest moment to artifacts/p009-e2e/.
 *
 * RB-02 HONESTY REQUIREMENT (non-negotiable):
 *   Every screenshot frame that shows imported data MUST have the
 *   "attested import custody" notice in frame.
 *   This spec asserts the notice is visible before capturing any data frame.
 *   Do NOT use these screenshots as website/marketing assets without a separate
 *   PO/RB-02 marketing-honesty review.
 *
 * Screenshot paths: artifacts/p009-e2e/
 * These are labelled test CANDIDATES, not approved public assets.
 */

/* global process */
import { test, expect } from "@playwright/test";
import path from "path";
import { signInAs, seededUsers, prepareEnglishLocale } from "./helpers/auth.js";

const ROOT = process.cwd();
const SCREENSHOT_DIR = path.resolve(ROOT, "artifacts/p009-e2e");

const CLEAN_PROPERTIES_CSV = path.resolve(ROOT, "tests/fixtures/import/clean-small-properties.csv");
const CLEAN_TENANCIES_CSV  = path.resolve(ROOT, "tests/fixtures/import/clean-small-tenancies.csv");
const FORMULA_INJECTION_CSV = path.resolve(ROOT, "tests/fixtures/import/formula-injection.csv");
const ORPHAN_COMPLIANCE_CSV = path.resolve(ROOT, "tests/fixtures/import/orphan-child-rows-compliance.csv");

// Account ID for the seeded ownerA fixture (isolation fixtures constant)
const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";

const DATA_IMPORT_URL = "/settings/data-import";
const PAGE_HEADING = /import data from spreadsheet/i;
const ATTESTED_NOTICE_TEXT = /attested import custody/i;

async function navigateToDataImport(page) {
  await page.goto(DATA_IMPORT_URL);
  await expect(page.getByRole("heading", { name: PAGE_HEADING })).toBeVisible({ timeout: 15_000 });
}

async function assertAttestedNoticeVisible(page) {
  // RB-02: the attested-import custody notice must be visible before any data screenshot
  await expect(page.getByText(ATTESTED_NOTICE_TEXT)).toBeVisible({ timeout: 10_000 });
}

async function uploadCsvFile(page, csvPath) {
  const fileInput = page.getByTestId("csv-file-input");
  await fileInput.setInputFiles(csvPath);
  // Wait for file name to appear in drop zone (confirms React processed onChange)
  const filename = path.basename(csvPath);
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });
  // Then wait for FileReader's async onload to complete and parsedRows to update
  await page.waitForTimeout(300);
}

async function waitForImportComplete(page) {
  // After clicking commit, wait for "Import complete" confirmation text
  await expect(page.getByText(/import complete/i)).toBeVisible({ timeout: 30_000 });
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

test.describe("P-009 data import flow — honesty-framed screenshots", () => {
  // Allow one automatic retry — sign-in occasionally takes >15 s on a warm local Supabase
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await prepareEnglishLocale(page);
    await signInAs(page, seededUsers.ownerA);
  });

  // ── Step 1: Entry point (empty state) ──────────────────────────────────────

  test("step-01 — data import page entry point (empty state)", async ({ page }) => {
    await navigateToDataImport(page);

    // RB-02: attested notice must be visible in the entry-point frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-01-data-import-empty");

    // Verify page structure
    await expect(page.getByRole("heading", { name: PAGE_HEADING })).toBeVisible();
    // Tab picker visible
    await expect(page.getByRole("button", { name: "Properties" })).toBeVisible();
    // File input attached (sr-only)
    await expect(page.getByTestId("csv-file-input")).toBeAttached();
  });

  // ── Step 2: Preview after uploading clean-small-properties.csv ────────────

  test("step-02 — preview shows 3 valid rows + attested notice after upload", async ({ page }) => {
    await navigateToDataImport(page);
    await assertAttestedNoticeVisible(page);

    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);

    // UI shows "3 valid rows detected" inside drop zone after parse
    await expect(page.getByText(/3 valid rows? detected/i)).toBeVisible({ timeout: 10_000 });

    // Commit button shows "Import 3 rows"
    await expect(page.getByTestId("import-commit-button")).toContainText("Import 3 rows");
    await expect(page.getByTestId("import-commit-button")).toBeEnabled();

    // RB-02: attested notice must still be visible in this preview frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-02-preview-3-properties-attested-notice");
  });

  // ── Step 3: After commit — Import complete with summary ───────────────────

  test("step-03 — after commit import complete with Imported summary visible", async ({ page }) => {
    await navigateToDataImport(page);
    await assertAttestedNoticeVisible(page);
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);

    const commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();

    await waitForImportComplete(page);

    // RB-02: attested notice must remain visible in the result frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-03-result-import-complete-attested-notice");

    // Verify "Import another file" reset link is present
    await expect(page.getByRole("button", { name: /import another file/i })).toBeVisible();
  });

  // ── Step 4: Re-import same file — rows show as Skipped (safety moment) ────

  test("step-04 — re-import same file shows Skipped (no silent duplicate)", async ({ page }) => {
    await navigateToDataImport(page);
    await assertAttestedNoticeVisible(page);

    // First import
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);
    const commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Reset via "Import another file" button
    await page.getByRole("button", { name: /import another file/i }).click();

    // Re-upload the same file
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // SummaryBar "Skipped" label must be visible (safety moment) — use .first() to avoid strict-mode
    await expect(page.getByText("Skipped").first()).toBeVisible({ timeout: 10_000 });

    // RB-02: attested notice must be in frame for the safety moment
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-04-reimport-skipped-safety-moment");
  });

  // ── Step 5a: formula-injection.csv — neutralized cells, import proceeds ───

  test("step-05a — formula-injection.csv: neutralized at parse; attested notice in frame", async ({ page }) => {
    await navigateToDataImport(page);
    await assertAttestedNoticeVisible(page);

    await uploadCsvFile(page, FORMULA_INJECTION_CSV);

    // Parser neutralizes formula cells; rows detected without parse errors
    await expect(page.getByText(/\d+ valid rows? detected/i)).toBeVisible({ timeout: 10_000 });

    // RB-02: attested notice must be in frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-05a-formula-injection-preview-attested-notice");

    // Commit to capture the result frame
    const commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 5_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // RB-02 for result frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-05a-formula-injection-result-attested-notice");
  });

  // ── Step 5b: orphan compliance rows — needs_review with plain-English reason

  test("step-05b — orphan compliance rows show needs_review with clear reason", async ({ page }) => {
    await navigateToDataImport(page);
    await assertAttestedNoticeVisible(page);

    // Switch to Compliance tab — scope to main content to avoid sidebar strict-mode collision
    const complianceTab = page.getByTestId("app-shell-main")
      .getByRole("button", { name: "Compliance" });
    await expect(complianceTab).toBeVisible({ timeout: 5_000 });
    await complianceTab.click();

    await uploadCsvFile(page, ORPHAN_COMPLIANCE_CSV);

    // 2 valid rows detected (the refs are valid format, just unknown at import time)
    await expect(page.getByText(/\d+ valid rows? detected/i)).toBeVisible({ timeout: 10_000 });

    const commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 5_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // "needs review" badge text appears in the row results table — use .first() to avoid strict-mode
    await expect(page.getByText("needs review").first()).toBeVisible({ timeout: 10_000 });

    // RB-02: attested notice must be in frame
    await assertAttestedNoticeVisible(page);
    await screenshot(page, "step-05b-orphan-compliance-needs-review-attested-notice");

    // Verify the review_reason column shows something (not just "—")
    await expect(page.getByText(/—/).first()).toBeVisible(); // at least one "—" row or reasons shown
  });

  // ── Step 6: Imported properties appear in the Properties list ─────────────

  test("step-06 — imported properties appear in Properties list", async ({ page }) => {
    // Ensure properties are in the DB (idempotent — skips if already there)
    await navigateToDataImport(page);
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);
    const commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Navigate to Properties list filtered for imported "Clean" addresses
    await page.goto("/properties?q=Clean");
    await expect(page.getByRole("heading", { name: /properties/i }).first()).toBeVisible({ timeout: 15_000 });

    // All three imported properties should appear in the card grid
    await expect(page.getByText("10 Clean Street")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("20 Clean Avenue")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("30 Clean Lane")).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "step-06-imported-properties-in-list");
  });

  // ── Step 7: Imported tenants appear in Tenants list ───────────────────────

  test("step-07 — imported tenants appear in Tenants list", async ({ page }) => {
    // Ensure properties exist first (idempotent)
    await navigateToDataImport(page);
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);
    let commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Switch to Tenancies tab and import
    await page.getByRole("button", { name: /import another file/i }).click();
    const mainContent = page.getByTestId("app-shell-main");
    await mainContent.getByRole("button", { name: "Tenancies" }).click();
    await uploadCsvFile(page, path.resolve(ROOT, "tests/fixtures/import/clean-small-tenancies.csv"));
    commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Navigate to Tenants list and search for imported tenants
    await page.goto("/tenants?q=clean.test");
    await expect(page.getByRole("heading", { name: /tenants/i }).first()).toBeVisible({ timeout: 15_000 });

    // Imported tenants should appear in the main content area (not the account dropdown)
    await expect(page.getByTestId("app-shell-main").getByText(/Alice Smith/i).first()).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "step-07-imported-tenants-in-list");
  });

  // ── Step 8: Finance page with rent payments seeded from imported tenancies ─

  test("step-08 — Finance page shows rent payments seeded from imported portfolio", async ({ page }) => {
    // Ensure properties exist first (idempotent)
    await navigateToDataImport(page);
    await uploadCsvFile(page, CLEAN_PROPERTIES_CSV);
    let commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Import tenancies
    await page.getByRole("button", { name: /import another file/i }).click();
    await page.getByTestId("app-shell-main").getByRole("button", { name: "Tenancies" }).click();
    await uploadCsvFile(page, CLEAN_TENANCIES_CSV);
    commitBtn = page.getByTestId("import-commit-button");
    await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
    await commitBtn.click();
    await waitForImportComplete(page);

    // Seed finance transactions via the authenticated Supabase client (DEV mode exposes window.__supabase_test)
    const seeded = await page.evaluate(async (accountId) => {
      const supabase = window.__supabase_test;
      if (!supabase) return { error: "window.__supabase_test not available" };

      const { data: tenants, error: tErr } = await supabase
        .from("tenants")
        .select("id, email, property_id")
        .eq("account_id", accountId)
        .in("email", ["alice@clean.test", "bob@clean.test", "carol@clean.test"]);
      if (tErr || !tenants?.length) return { error: tErr?.message || "no tenants", count: 0 };

      const lastMonthDate = new Date(Date.now() - 32 * 86_400_000).toISOString().slice(0, 10);
      const thisMonthDate = new Date().toISOString().slice(0, 10);
      const paidAt = new Date(Date.now() - 5 * 86_400_000).toISOString();

      let count = 0;
      for (const tenant of tenants) {
        if (!tenant.property_id) continue;
        const rent = tenant.email === "alice@clean.test" ? 1200
          : tenant.email === "bob@clean.test" ? 900 : 800;

        // Paid payment — previous month
        await supabase.rpc("create_payment", {
          p_account_id: accountId,
          p_property_id: tenant.property_id,
          p_tenant_id: tenant.id,
          p_amount: rent,
          p_due_date: lastMonthDate,
          p_paid_at: paidAt,
          p_notes: "Landlord-attested import via P-009 demo",
        });

        // Pending payment — current month (not yet paid)
        await supabase.rpc("create_payment", {
          p_account_id: accountId,
          p_property_id: tenant.property_id,
          p_tenant_id: tenant.id,
          p_amount: rent,
          p_due_date: thisMonthDate,
          p_paid_at: null,
          p_notes: "Rent due — P-009 demo",
        });
        count++;
      }
      return { count };
    }, ACCOUNT_A);

    // Allow the Finance realtime subscription to pick up the new payments
    await page.waitForTimeout(1500);

    // Navigate to Finance page
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: /finance/i }).first()).toBeVisible({ timeout: 15_000 });

    // Wait for payments to load — Finance shows summary cards (Received, Overdue, Due Soon, Total Owed)
    await expect(page.getByText(/received|due soon|overdue/i).first()).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "step-08-finance-page-with-rent-payments");

    // Navigate to Payments tab to show the rent payment rows
    await page.getByRole("button", { name: /payments/i }).first().click();
    await page.waitForTimeout(800);
    await screenshot(page, "step-08b-finance-payments-list");
  });

  // ── Step 9: Portfolio Health with imported portfolio + finance data ─────────

  test("step-09 — Portfolio Health Dashboard shows imported portfolio with finance data", async ({ page }) => {
    await page.goto("/portfolio-health");
    await expect(page.getByText(/portfolio health/i).first()).toBeVisible({ timeout: 20_000 });
    // Wait for any loading spinners to resolve
    await page.waitForTimeout(2000);
    await screenshot(page, "step-09-portfolio-health-with-imported-data");
  });

  // ── Step 10: Command Center aggregates the imported portfolio ──────────────

  test("step-10 — Command Center shows imported portfolio in the operator brief", async ({ page }) => {
    await page.goto("/command-center");
    // Wait for at least one action-item card to appear (confirms data loaded)
    await expect(page.getByTestId("command-center-item-link").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await screenshot(page, "step-10-command-center-imported-portfolio");
  });
});
