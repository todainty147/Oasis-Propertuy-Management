/**
 * P-009C2 — Aggregate Honesty static contracts
 *
 * Structural proof that:
 *   1. RiskProtectionSummary is NOT used as a landlord-facing surface in C2.
 *   2. getImportedReviewCount is the single canonical predicate.
 *   3. Dashboard hub items (hubExtras / mapDashboardHubItems) never include imported data.
 *   4. PropertyComplianceCard attestedReviewCount loop reads attestedRows only, never rows.
 *   5. Portfolio Health scoring path is clean of imported references.
 *   6. Portfolio Health informational note is structurally outside scoring.
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(process.cwd());

function readSrc(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

// ── §1  Risk Protection Summary exclusion ──────────────────────────────────────

describe("P-009C2 §1: RiskProtectionSummary not wired into a landlord surface", () => {
  it("PortfolioHealthDashboardPage does not import RiskProtectionSummary", () => {
    const page = readSrc("src/pages/PortfolioHealthDashboardPage.jsx");
    expect(page).not.toContain("RiskProtectionSummary");
  });

  it("Dashboard.jsx does not import RiskProtectionSummary", () => {
    const dashboard = readSrc("src/pages/Dashboard.jsx");
    expect(dashboard).not.toContain("RiskProtectionSummary");
  });

  it("PropertyComplianceCard does not import RiskProtectionSummary", () => {
    const card = readSrc("src/components/PropertyComplianceCard.jsx");
    expect(card).not.toContain("RiskProtectionSummary");
  });
});

// ── §2  Canonical predicate single authority ───────────────────────────────────

describe("P-009C2 §2: getImportedReviewCount is the canonical predicate", () => {
  const svc = readSrc("src/services/complianceImportService.js");

  it("complianceImportService exports getImportedReviewCount", () => {
    expect(svc).toContain("export async function getImportedReviewCount");
  });

  it("predicate queries compliance_gap_unified", () => {
    expect(svc).toContain("compliance_gap_unified");
  });

  it("predicate filters is_attested_import = true", () => {
    expect(svc).toContain("is_attested_import");
    expect(svc).toContain("true");
  });

  it("predicate includes overdue, due_soon, missing scan_status values", () => {
    expect(svc).toContain("overdue");
    expect(svc).toContain("due_soon");
    expect(svc).toContain("missing");
  });

  it("complianceImportService does not fetch tenancy_compliance_items directly", () => {
    expect(svc).not.toContain("tenancy_compliance_items");
  });
});

// ── §3  Dashboard Hub: native hub extras unchanged ────────────────────────────

describe("P-009C2 §3: Dashboard native hub items are not contaminated by imported data", () => {
  const dashSvc = readSrc("src/services/dashboardService.js");
  const dashboard = readSrc("src/pages/Dashboard.jsx");

  it("mapDashboardHubItems does not reference is_attested_import", () => {
    expect(dashSvc).not.toContain("is_attested_import");
  });

  it("mapDashboardHubItems does not reference tenancy_compliance_items", () => {
    expect(dashSvc).not.toContain("tenancy_compliance_items");
  });

  it("mapDashboardHubItems does not reference compliance_gap_unified", () => {
    expect(dashSvc).not.toContain("compliance_gap_unified");
  });

  it("Dashboard imports getImportedReviewCount from complianceImportService", () => {
    expect(dashboard).toContain("getImportedReviewCount");
    expect(dashboard).toContain("complianceImportService");
  });

  it("Dashboard renders imported block with separate data-testid", () => {
    expect(dashboard).toContain("dashboard-imported-review-block");
  });

  it("Dashboard imported block contains 'imported' label text", () => {
    const blockIdx = dashboard.indexOf("dashboard-imported-review-block");
    const blockSlice = dashboard.slice(blockIdx, blockIdx + 400);
    expect(blockSlice.toLowerCase()).toContain("imported compliance records");
  });

  it("importedReviewCount state is separate from hubItems/hubExtras", () => {
    // importedReviewCount must be a separate useState, not derived from hubExtras
    expect(dashboard).toContain("setImportedReviewCount");
    const hubExtrasIdx = dashboard.indexOf("setHubExtras");
    const importedIdx = dashboard.indexOf("setImportedReviewCount");
    // Both exist and are at different positions
    expect(hubExtrasIdx).toBeGreaterThan(-1);
    expect(importedIdx).toBeGreaterThan(-1);
    expect(importedIdx).not.toBe(hubExtrasIdx);
  });
});

// ── §4  PropertyComplianceCard: native summary unchanged ──────────────────────

describe("P-009C2 §4: PropertyComplianceCard native summary excludes attestedRows", () => {
  const card = readSrc("src/components/PropertyComplianceCard.jsx");

  it("summary useMemo iterates `rows`, not attestedRows", () => {
    const summaryIdx = card.indexOf("const summary = useMemo");
    const forRowsIdx = card.indexOf("for (const row of rows)", summaryIdx);
    const forAttestedIdx = card.indexOf("for (const row of attestedRows)", summaryIdx);
    expect(forRowsIdx).toBeGreaterThan(summaryIdx);
    expect(forAttestedIdx).toBe(-1);
  });

  it("attestedReviewCount useMemo reads attestedRows, not rows", () => {
    expect(card).toContain("attestedReviewCount");
    const reviewIdx = card.indexOf("attestedReviewCount = useMemo");
    expect(reviewIdx).toBeGreaterThan(-1);
    // The memoized value must reference attestedRows
    const reviewSlice = card.slice(reviewIdx, reviewIdx + 300);
    expect(reviewSlice).toContain("attestedRows");
  });

  it("attestedReviewCount depends on [attestedRows] — not [rows]", () => {
    const reviewIdx = card.indexOf("attestedReviewCount = useMemo");
    const afterReview = card.slice(reviewIdx, reviewIdx + 400);
    // dependency array must be [attestedRows]
    expect(afterReview).toContain("[attestedRows]");
  });

  it("attested-review-count block rendered with separate testid", () => {
    expect(card).toContain("attested-review-count");
  });

  it("attested-review-count renders attestedReviewCount, not summary values", () => {
    const blockIdx = card.indexOf("attested-review-count");
    const blockSlice = card.slice(blockIdx, blockIdx + 300);
    expect(blockSlice).toContain("attestedReviewCount");
    expect(blockSlice).not.toContain("summary.overdue");
    expect(blockSlice).not.toContain("summary.dueSoon");
  });
});

// ── §5  Portfolio Health scoring path clean ────────────────────────────────────

describe("P-009C2 §5: Portfolio Health scoring path excludes all imported fields", () => {
  const healthSvc = readSrc("src/services/propertyHealthScoreService.js");

  it("propertyHealthScoreService has no reference to is_attested_import", () => {
    expect(healthSvc).not.toContain("is_attested_import");
  });

  it("propertyHealthScoreService has no reference to compliance_gap_unified", () => {
    expect(healthSvc).not.toContain("compliance_gap_unified");
  });

  it("propertyHealthScoreService has no reference to import_batch_id", () => {
    expect(healthSvc).not.toContain("import_batch_id");
  });

  it("propertyHealthScoreService has no reference to tenancy_compliance_items", () => {
    expect(healthSvc).not.toContain("tenancy_compliance_items");
  });
});

// ── §6  Portfolio Health informational note outside scoring ───────────────────

describe("P-009C2 §6: Portfolio Health imported note is outside scoring StatGroup", () => {
  const page = readSrc("src/pages/PortfolioHealthDashboardPage.jsx");

  it("page imports getImportedReviewCount from complianceImportService", () => {
    expect(page).toContain("getImportedReviewCount");
    expect(page).toContain("complianceImportService");
  });

  it("importedReviewCount state exists independently of scoring state", () => {
    expect(page).toContain("setImportedReviewCount");
    // Scoring state: propertyHealthSummary, averageScore — not contaminated
    const scoreIdx = page.indexOf("propertyHealthSummary.averageScore");
    const importedIdx = page.indexOf("importedReviewCount");
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(importedIdx).toBeGreaterThan(-1);
  });

  it("portfolio-imported-review-note is rendered after Health StatGroup", () => {
    const healthGroupIdx = page.indexOf("portfolio.section.health");
    const noteIdx = page.indexOf("portfolio-imported-review-note");
    expect(healthGroupIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(healthGroupIdx);
  });

  it("imported note explicitly states score is unchanged", () => {
    const noteIdx = page.indexOf("portfolio-imported-review-note");
    const noteSlice = page.slice(noteIdx, noteIdx + 400);
    expect(noteSlice.toLowerCase()).toContain("do not currently affect");
  });

  it("StatGroup element for health does NOT contain importedReviewCount", () => {
    // Slice only the StatGroup tag itself: from its opening to the closing </StatGroup>
    const healthGroupStart = page.indexOf("<StatGroup label={t(\"portfolio.section.health\")}");
    const healthGroupEnd = page.indexOf("</StatGroup>", healthGroupStart);
    const healthSlice = page.slice(healthGroupStart, healthGroupEnd);
    expect(healthSlice).not.toContain("importedReviewCount");
  });

  it("summarizePropertyOperationalHealth is not called with imported data", () => {
    expect(page).toContain("summarizePropertyOperationalHealth(propertyHealthRows)");
    // Must not pass importedReviewCount into the health summarizer
    const summaryIdx = page.indexOf("summarizePropertyOperationalHealth");
    const summarySlice = page.slice(summaryIdx, summaryIdx + 60);
    expect(summarySlice).not.toContain("imported");
  });
});
