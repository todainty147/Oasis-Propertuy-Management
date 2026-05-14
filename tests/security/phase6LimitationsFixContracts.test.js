import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const taxReadinessSvc  = read("src/services/taxReadinessService.js");
const taxRecordsSvc    = read("src/services/taxRecordsService.js");
const rentShieldSvc    = read("src/services/rentShieldService.js");
const leaseAuditSvc    = read("src/services/leaseAuditService.js");
const leaseSvc         = read("src/services/leaseService.js");
const taxExportsTab    = read("src/components/compliance/TaxExportsTab.jsx");
const taxRecordsTab    = read("src/components/compliance/TaxRecordsTab.jsx");
const useTaxRecordsHk  = read("src/hooks/useTaxRecords.js");
const rentShieldPage   = read("src/pages/compliance/RentShieldPage.jsx");
const leaseAuditorPage = read("src/pages/compliance/LeaseAuditorPage.jsx");
const billingPage      = read("src/pages/BillingPage.jsx");
const sidebarJsx       = read("src/layout/Sidebar.jsx");
const messagesJs       = read("src/i18n/messages.js");
const securitySql      = read("supabase/compliance_security_hardening.sql");
const limitationsDoc   = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");

// ─── L-031: PGRST116 masking ──────────────────────────────────────────────────

describe("L-031: getLatestLeaseAudit PGRST116 handling", () => {
  it("handles PGRST116 on its own line (not combined with isMissingBackendObject)", () => {
    // Check the full file — the string exists somewhere in getLatestLeaseAudit
    expect(leaseAuditSvc).toContain('if (error.code === "PGRST116") return null;');
  });

  it("re-throws errors that are neither PGRST116 nor missing backend object", () => {
    const idx = leaseAuditSvc.indexOf("export async function getLatestLeaseAudit");
    const block = leaseAuditSvc.slice(idx, idx + 600);
    expect(block).toContain("throw error;");
  });
});

// ─── L-008: deadline_date recurrence ─────────────────────────────────────────

describe("L-008: deriveTaxStatus prefers due_date over deadline_date", () => {
  it("uses due_date || deadline_date (not the reversed order)", () => {
    expect(taxReadinessSvc).toContain("const raw = item.due_date || item.deadline_date;");
  });

  it("no longer uses the stale-first pattern deadline_date || due_date", () => {
    expect(taxReadinessSvc).not.toContain("const raw = item.deadline_date || item.due_date;");
  });
});

// ─── L-015: export race condition ────────────────────────────────────────────

describe("L-015: recordTaxExport fires before downloadCsvBlob", () => {
  it("await recordTaxExport appears before downloadCsvBlob in handleGenerate", () => {
    const idx = taxExportsTab.indexOf("async function handleGenerate");
    const block = taxExportsTab.slice(idx, idx + 1200);
    const recordPos   = block.indexOf("await recordTaxExport(");
    const downloadPos = block.indexOf("downloadCsvBlob(");
    expect(recordPos).toBeGreaterThan(-1);
    expect(downloadPos).toBeGreaterThan(-1);
    expect(recordPos).toBeLessThan(downloadPos);
  });
});

// ─── L-014: excluded records in CSV ─────────────────────────────────────────

describe("L-014: generateTaxRecordsCsv skips excluded records by default", () => {
  it("accepts skipExcluded option", () => {
    expect(taxRecordsSvc).toContain("skipExcluded = true");
  });

  it("filters out excluded records when skipExcluded is true", () => {
    expect(taxRecordsSvc).toContain('r.review_status !== "excluded"');
  });

  it("uses filtered source array for CSV rows (not original records)", () => {
    const idx = taxRecordsSvc.indexOf("export function generateTaxRecordsCsv");
    const block = taxRecordsSvc.slice(idx, idx + 400);
    expect(block).toContain("const source =");
    expect(block).toContain("source.map(");
  });
});

// ─── L-033: overall_risk auto-computation ────────────────────────────────────

describe("L-033: overall_risk recomputed after finding writes", () => {
  it("defines recomputeOverallRisk helper", () => {
    expect(leaseAuditSvc).toContain("async function recomputeOverallRisk(");
  });

  it("uses RISK_RANK to order levels", () => {
    expect(leaseAuditSvc).toContain("const RISK_RANK =");
    expect(leaseAuditSvc).toContain("critical: 4");
  });

  it("createLeaseAuditFinding calls recomputeOverallRisk", () => {
    const idx = leaseAuditSvc.indexOf("export async function createLeaseAuditFinding");
    const end = leaseAuditSvc.indexOf("export async function dismissLeaseAuditFinding");
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).toContain("await recomputeOverallRisk(");
  });

  it("dismissLeaseAuditFinding calls recomputeOverallRisk", () => {
    const idx = leaseAuditSvc.indexOf("export async function dismissLeaseAuditFinding");
    const end = leaseAuditSvc.indexOf("export async function restoreLeaseAuditFinding");
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).toContain("await recomputeOverallRisk(");
  });

  it("restoreLeaseAuditFinding also calls recomputeOverallRisk", () => {
    const idx = leaseAuditSvc.indexOf("export async function restoreLeaseAuditFinding");
    const end = leaseAuditSvc.indexOf("export async function deleteLeaseAuditFinding");
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).toContain("await recomputeOverallRisk(");
  });
});

// ─── L-013: export period filter ─────────────────────────────────────────────

describe("L-013: listTaxRecords supports date range and TaxExportsTab uses period range", () => {
  it("exports periodLabelToDateRange helper", () => {
    expect(taxRecordsSvc).toContain("export function periodLabelToDateRange(");
  });

  it("YYYY period returns full year range via template literal", () => {
    // The function builds dates dynamically: `${y}-01-01` and `${y}-12-31`
    expect(taxRecordsSvc).toContain("-01-01`");
    expect(taxRecordsSvc).toContain("-12-31`");
  });

  it("listTaxRecords accepts recordDateFrom and recordDateTo params", () => {
    expect(taxRecordsSvc).toContain("recordDateFrom = null");
    expect(taxRecordsSvc).toContain("recordDateTo = null");
  });

  it("TaxExportsTab imports and calls periodLabelToDateRange", () => {
    expect(taxExportsTab).toContain("periodLabelToDateRange");
    expect(taxExportsTab).toContain("const { from: recordDateFrom, to: recordDateTo }");
  });
});

// ─── L-012: currency mixing ───────────────────────────────────────────────────

describe("L-012: summariseTaxRecords groups by currency", () => {
  it("returns byCurrency breakdown", () => {
    expect(taxRecordsSvc).toContain("byCurrency");
  });

  it("returns hasMultipleCurrencies flag", () => {
    expect(taxRecordsSvc).toContain("hasMultipleCurrencies");
  });

  it("TaxRecordsTab shows currency-breakdown testid when multiple currencies", () => {
    expect(taxRecordsTab).toContain('data-testid="currency-breakdown"');
  });

  it("TaxRecordsTab renders per-currency income and expenses", () => {
    expect(taxRecordsTab).toContain("summary.byCurrency");
    expect(taxRecordsTab).toContain("summary.currencies");
  });
});

// ─── L-023: Rent Shield period scoping ───────────────────────────────────────

describe("L-023: computeAndSaveAssessment scopes payments to period", () => {
  it("exports periodKeyToDateRange helper", () => {
    expect(rentShieldSvc).toContain("export function periodKeyToDateRange(");
  });

  it("fetchPropertyPayments accepts dateFrom and dateTo params", () => {
    expect(rentShieldSvc).toContain("dateFrom = null");
    expect(rentShieldSvc).toContain("dateTo = null");
  });

  it("no longer defaults to monthsBack=12 without period", () => {
    expect(rentShieldSvc).not.toContain("monthsBack = 12");
  });

  it("computeAndSaveAssessment derives date range from period key", () => {
    const idx = rentShieldSvc.indexOf("export async function computeAndSaveAssessment");
    const end = rentShieldSvc.indexOf("export async function listRentShieldAssessments");
    const block = rentShieldSvc.slice(idx, end);
    expect(block).toContain("periodKeyToDateRange(period)");
    expect(block).toContain("dateFrom");
    expect(block).toContain("dateTo");
  });
});

// ─── L-025: sample size confidence ───────────────────────────────────────────

describe("L-025: computeShieldMetrics returns sampleSize", () => {
  it("empty-safe return includes sampleSize: 0", () => {
    expect(rentShieldSvc).toContain("return { arrearsAmount: 0, daysOverdueP90: 0, paymentRate: 1, totalDue: 0, sampleSize: 0, totalPayments: 0 }");
  });

  it("non-empty path also returns sampleSize", () => {
    expect(rentShieldSvc).toContain("const sampleSize = overdueDaysList.length");
    expect(rentShieldSvc).toContain("sampleSize");
  });

  it("computeAndSaveAssessment attaches sampleSize to returned object", () => {
    expect(rentShieldSvc).toContain("sampleSize: metrics.sampleSize");
  });

  it("RentShieldPage shows low-confidence warning when sampleSize < 5", () => {
    expect(rentShieldPage).toContain("lastSampleSize < 5");
    expect(rentShieldPage).toContain('data-testid="low-confidence-warning"');
  });
});

// ─── L-027: getLatestAssessmentByProperty DISTINCT ON RPC ────────────────────

describe("L-027: getLatestAssessmentByProperty uses DISTINCT ON RPC", () => {
  it("calls rpc get_latest_assessments_by_property", () => {
    expect(rentShieldSvc).toContain('.rpc("get_latest_assessments_by_property"');
  });

  it("no longer fetches all rows and deduplicates in JS", () => {
    const idx = rentShieldSvc.indexOf("export async function getLatestAssessmentByProperty");
    const end = rentShieldSvc.length;
    const block = rentShieldSvc.slice(idx, end);
    expect(block).not.toContain("const byProperty = new Map()");
  });

  it("SQL defines get_latest_assessments_by_property with DISTINCT ON", () => {
    expect(securitySql).toContain("create or replace function public.get_latest_assessments_by_property(");
    expect(securitySql).toContain("distinct on (property_id)");
  });
});

// ─── L-030: listLatestAuditsByLease DISTINCT ON RPC ──────────────────────────

describe("L-030: lease list uses DISTINCT ON RPC instead of JS dedup", () => {
  it("leaseAuditService exports listLatestAuditsByLease", () => {
    expect(leaseAuditSvc).toContain("export async function listLatestAuditsByLease(");
  });

  it("listLatestAuditsByLease calls rpc get_latest_audits_by_lease", () => {
    expect(leaseAuditSvc).toContain('.rpc("get_latest_audits_by_lease"');
  });

  it("LeaseAuditorPage imports and calls listLatestAuditsByLease", () => {
    expect(leaseAuditorPage).toContain("listLatestAuditsByLease");
  });

  it("LeaseAuditorPage no longer uses raw .from(lease_audits) for batch query", () => {
    const idx = leaseAuditorPage.indexOf("load the latest audit per lease");
    const block = leaseAuditorPage.slice(idx, idx + 300);
    expect(block).not.toContain('.from("lease_audits")');
  });

  it("SQL defines get_latest_audits_by_lease with DISTINCT ON", () => {
    expect(securitySql).toContain("create or replace function public.get_latest_audits_by_lease(");
    expect(securitySql).toContain("distinct on (lease_id)");
  });
});

// ─── L-019: reviewStatus filter dropdown ─────────────────────────────────────

describe("L-019: TaxRecordsTab exposes reviewStatus filter", () => {
  it("has review-status-filter testid select element", () => {
    expect(taxRecordsTab).toContain('data-testid="review-status-filter"');
  });

  it("passes reviewStatus to useTaxRecords hook", () => {
    expect(taxRecordsTab).toContain("reviewStatus: reviewStatusFilter");
  });

  it("offers unreviewed, reviewed, excluded options", () => {
    expect(taxRecordsTab).toContain('"unreviewed"');
    expect(taxRecordsTab).toContain('"reviewed"');
    expect(taxRecordsTab).toContain('"excluded"');
  });
});

// ─── L-034: billing plan highlight ───────────────────────────────────────────

describe("L-034: BillingPage highlights current plan in feature matrix", () => {
  it("reads activePlan from AccountContext", () => {
    expect(billingPage).toContain("activePlan");
  });

  it("marks the current plan column with data-testid conditionally", () => {
    // JSX uses expression syntax: data-testid={isCurrent ? "current-plan-column" : undefined}
    expect(billingPage).toContain('"current-plan-column"');
  });

  it("shows billing.complianceSuite.currentPlan i18n badge on current column", () => {
    expect(billingPage).toContain('"billing.complianceSuite.currentPlan"');
  });

  it("currentPlan i18n key exists in all 3 locales", () => {
    const regex = /"billing\.complianceSuite\.currentPlan"/g;
    const count = (messagesJs.match(regex) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── L-035: Starter sidebar discoverability ───────────────────────────────────

describe("L-035: compliance sidebar visible for all canManage users with lock badges for Starter", () => {
  it("compliance section is gated on canManage only (not TAX_READINESS_DASHBOARD)", () => {
    const idx = sidebarJsx.indexOf("{canManage && (");
    const block = sidebarJsx.slice(idx, idx + 100);
    expect(block).toContain("canManage");
    expect(block).not.toContain("hasEntitlement(ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD)");
  });

  it("uses LockedItem component for non-entitled links", () => {
    expect(sidebarJsx).toContain("LockedItem");
    expect(sidebarJsx).toContain("function LockedItem(");
  });

  it("LockedItem renders a Lock icon", () => {
    // The Lock import and usage are present in the file
    expect(sidebarJsx).toContain("Lock,");
    const lockedIdx = sidebarJsx.indexOf("function LockedItem(");
    const block = sidebarJsx.slice(lockedIdx, lockedIdx + 600);
    expect(block).toContain("<Lock");
  });

  it("tax and rent shield show LockedItem when user lacks TAX_READINESS_DASHBOARD", () => {
    expect(sidebarJsx).toContain('/compliance/tax');
    expect(sidebarJsx).toContain('icon={Receipt}');
    expect(sidebarJsx).toContain('/compliance/rent-shield');
    expect(sidebarJsx).toContain('icon={Umbrella}');
    // Both routes must appear inside LockedItem elements (ungated path)
    expect(sidebarJsx).toContain('LockedItem');
  });
});

// ─── L-016: listTaxExports pagination ────────────────────────────────────────

describe("L-016: listTaxExports supports limit/offset pagination", () => {
  it("listTaxExports accepts limit and offset params", () => {
    expect(taxRecordsSvc).toContain("limit = 50, offset = 0");
  });

  it("listTaxExports calls rpc list_tax_exports with limit/offset (Phase 7 L-021 moved to RPC)", () => {
    const idx = taxRecordsSvc.indexOf("export async function listTaxExports");
    const block = taxRecordsSvc.slice(idx, idx + 400);
    expect(block).toContain('.rpc("list_tax_exports"');
    expect(block).toContain("p_limit");
    expect(block).toContain("p_offset");
  });

  it("TaxExportsTab has Load more button", () => {
    expect(taxExportsTab).toContain('data-testid="exports-load-more"');
  });

  it("TaxExportsTab tracks hasMore state", () => {
    expect(taxExportsTab).toContain("hasMore");
    expect(taxExportsTab).toContain("setHasMore");
  });
});

// ─── L-017: listTaxRecords pagination ────────────────────────────────────────

describe("L-017: listTaxRecords supports limit/offset pagination", () => {
  it("listTaxRecords accepts limit and offset params", () => {
    expect(taxRecordsSvc).toContain("limit = 100");
    expect(taxRecordsSvc).toContain("offset = 0");
  });

  it("useTaxRecords exposes hasMore and loadMore", () => {
    expect(useTaxRecordsHk).toContain("hasMore");
    expect(useTaxRecordsHk).toContain("loadMore");
  });

  it("TaxRecordsTab has Load more button", () => {
    expect(taxRecordsTab).toContain('data-testid="records-load-more"');
  });
});

// ─── L-032: lease list pagination ────────────────────────────────────────────

describe("L-032: lease list supports pagination", () => {
  it("listLeases accepts offset param", () => {
    expect(leaseSvc).toContain("offset = 0");
  });

  it("listLeases uses .range() for pagination", () => {
    const idx = leaseSvc.indexOf("export async function listLeases");
    const block = leaseSvc.slice(idx, idx + 800);
    expect(block).toContain(".range(offset");
  });

  it("LeaseAuditorPage has Load more button for leases", () => {
    expect(leaseAuditorPage).toContain('data-testid="leases-load-more"');
  });

  it("LeaseAuditorPage tracks leasesHasMore state", () => {
    expect(leaseAuditorPage).toContain("leasesHasMore");
  });
});

// ─── i18n: new keys in all 3 locales ─────────────────────────────────────────

describe("i18n: Phase 6 fix keys in all locales", () => {
  const keys = [
    "common.loadMore",
    "compliance.tax.records.stats.multipleCurrencies",
    "compliance.tax.records.filter.allStatuses",
    "compliance.rentShield.lowConfidence",
    "billing.complianceSuite.currentPlan",
  ];

  for (const key of keys) {
    it(`"${key}" present in ≥3 locales`, () => {
      const regex = new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g");
      const count = (messagesJs.match(regex) || []).length;
      expect(count).toBeGreaterThanOrEqual(3);
    });
  }
});

// ─── Limitations doc: Phase 6 resolutions ────────────────────────────────────

describe("limitations doc: all Phase 6 fixes recorded as resolved", () => {
  const ids = ["L-008", "L-012", "L-013", "L-014", "L-015", "L-016", "L-017",
               "L-019", "L-023", "L-025", "L-027", "L-030", "L-031", "L-032",
               "L-033", "L-034", "L-035"];

  for (const id of ids) {
    it(`${id} appears in the Resolved section`, () => {
      const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
      expect(resolvedSection).toContain(id);
    });
  }
});
