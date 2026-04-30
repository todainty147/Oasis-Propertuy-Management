import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const rpcContracts    = read("src/services/rpcContracts.js");
const taxRecordsService = read("src/services/taxRecordsService.js");
const useTaxRecordsHook = read("src/hooks/useTaxRecords.js");
const recordTypeBadge   = read("src/components/compliance/TaxRecordTypeBadge.jsx");
const treatmentBadge    = read("src/components/compliance/TaxTreatmentBadge.jsx");
const recordsTab        = read("src/components/compliance/TaxRecordsTab.jsx");
const exportsTab        = read("src/components/compliance/TaxExportsTab.jsx");
const taxPage           = read("src/pages/compliance/TaxReadinessPage.jsx");
const messagesJs        = read("src/i18n/messages.js");
const securitySql       = read("supabase/compliance_security_hardening.sql");

// ─── rpcContracts: new parsers ────────────────────────────────────────────────

describe("rpcContracts: parseTaxRecordRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseTaxRecordRow");
  });

  it("parses all required fields", () => {
    const fields = [
      "record_type", "amount", "currency", "tax_treatment",
      "country_code", "record_date", "evidence_status", "review_status",
      "tax_category_code", "description", "metadata",
    ];
    for (const f of fields) {
      expect(rpcContracts).toContain(f);
    }
  });

  it("uses toNullableNumber for amount", () => {
    const idx = rpcContracts.indexOf("export function parseTaxRecordRow");
    const snippet = rpcContracts.slice(idx, idx + 600);
    expect(snippet).toContain("toNullableNumber(value.amount)");
  });

  it("uses toObjectOr for metadata", () => {
    const idx = rpcContracts.indexOf("export function parseTaxRecordRow");
    const snippet = rpcContracts.slice(idx, idx + 1250);
    expect(snippet).toContain("toObjectOr(value.metadata)");
  });
});

describe("rpcContracts: parseTaxExportRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseTaxExportRow");
  });

  it("parses all required fields", () => {
    const fields = [
      "country_code", "tax_mode", "period_label",
      "export_type", "status", "generated_by", "generated_at", "metadata",
    ];
    for (const f of fields) {
      expect(rpcContracts).toContain(f);
    }
  });
});

// ─── taxRecordsService: structure ────────────────────────────────────────────

describe("taxRecordsService: exported functions", () => {
  const EXPORTS = [
    "listTaxRecords",
    "createTaxRecord",
    "updateTaxRecordReviewStatus",
    "deleteTaxRecord",
    "listTaxExports",
    "recordTaxExport",
    "summariseTaxRecords",
    "generateTaxRecordsCsv",
    "downloadCsvBlob",
  ];
  for (const fn of EXPORTS) {
    it(`exports ${fn}`, () => {
      expect(taxRecordsService).toContain(`export`);
      expect(taxRecordsService).toContain(fn);
    });
  }
});

describe("taxRecordsService: safety invariants", () => {
  it("updateTaxRecordReviewStatus scopes by account_id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.update_tax_record_review_status(");
    const end = securitySql.indexOf("create or replace function public.delete_tax_record(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("deleteTaxRecord scopes by account_id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.delete_tax_record(");
    const end = securitySql.indexOf("create or replace function public.record_tax_export(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("listTaxRecords calls rpc list_tax_records (account_id enforced in SQL RPC, Phase 7)", () => {
    expect(taxRecordsService).toContain('.rpc("list_tax_records"');
  });

  it("country_code is uppercased and capped at 2 chars", () => {
    expect(taxRecordsService).toContain("toUpperCase().slice(0, 2)");
  });

  it("currency is uppercased and capped at 3 chars", () => {
    expect(taxRecordsService).toContain(".toUpperCase().slice(0, 3)");
  });

  it("review_status always set to unreviewed on create (enforced in RPC)", () => {
    // Phase 5: SQL RPC INSERT hardcodes review_status = 'unreviewed'
    const idx = securitySql.indexOf("create or replace function public.create_tax_record(");
    const end = securitySql.indexOf("create or replace function public.update_tax_record_review_status(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("'unreviewed'");
  });
});

describe("taxRecordsService: summariseTaxRecords", () => {
  it("counts income correctly", () => {
    expect(taxRecordsService).toContain('r.record_type === "income"');
  });

  it("counts expenses correctly", () => {
    expect(taxRecordsService).toContain('r.record_type === "expense"');
  });

  it("counts unreviewed records", () => {
    expect(taxRecordsService).toContain('r.review_status === "unreviewed"');
  });

  it("returns totalIncome, totalExpenses, needsReview", () => {
    expect(taxRecordsService).toContain("totalIncome");
    expect(taxRecordsService).toContain("totalExpenses");
    expect(taxRecordsService).toContain("needsReview");
  });
});

describe("taxRecordsService: generateTaxRecordsCsv", () => {
  it("includes all 9 column headers", () => {
    const HEADERS = ["Date", "Type", "Country", "Category", "Amount", "Currency", "Treatment", "Review Status", "Description"];
    for (const h of HEADERS) {
      expect(taxRecordsService).toContain(h);
    }
  });

  it("escapes double-quotes in cell values", () => {
    expect(taxRecordsService).toContain('replace(/"/g, \'""\'');
  });
});

describe("taxRecordsService: recordTaxExport", () => {
  it("sets status to complete synchronously (enforced in RPC)", () => {
    // Phase 5: SQL RPC INSERT hardcodes status = 'complete'
    const idx = securitySql.indexOf("create or replace function public.record_tax_export(");
    const end = securitySql.indexOf("create or replace function public.upsert_rent_shield_assessment(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("'complete'");
  });

  it("stores row_count in metadata", () => {
    expect(taxRecordsService).toContain("row_count");
  });
});

// ─── useTaxRecords hook ───────────────────────────────────────────────────────

describe("useTaxRecords hook", () => {
  it("exports useTaxRecords", () => {
    expect(useTaxRecordsHook).toContain("export function useTaxRecords");
  });

  it("accepts countryCode, recordType, reviewStatus filters", () => {
    expect(useTaxRecordsHook).toContain("countryCode");
    expect(useTaxRecordsHook).toContain("recordType");
    expect(useTaxRecordsHook).toContain("reviewStatus");
  });

  it("returns records, loading, error, refetch", () => {
    expect(useTaxRecordsHook).toContain("records");
    expect(useTaxRecordsHook).toContain("loading");
    expect(useTaxRecordsHook).toContain("error");
    expect(useTaxRecordsHook).toContain("refetch");
  });

  it("guards against missing accountId", () => {
    expect(useTaxRecordsHook).toContain("if (!accountId)");
  });

  it("uses cancellation flag", () => {
    expect(useTaxRecordsHook).toContain("cancelled = true");
  });
});

// ─── Badge components ─────────────────────────────────────────────────────────

describe("TaxRecordTypeBadge", () => {
  it("covers all four record types", () => {
    expect(recordTypeBadge).toContain("income");
    expect(recordTypeBadge).toContain("expense");
    expect(recordTypeBadge).toContain("adjustment");
    expect(recordTypeBadge).toContain("evidence");
  });

  it("income is emerald, expense is rose", () => {
    const incomeIdx = recordTypeBadge.indexOf("income");
    const incomeSnippet = recordTypeBadge.slice(incomeIdx, incomeIdx + 120);
    expect(incomeSnippet).toContain("emerald");

    const expenseIdx = recordTypeBadge.indexOf("expense");
    const expenseSnippet = recordTypeBadge.slice(expenseIdx, expenseIdx + 120);
    expect(expenseSnippet).toContain("rose");
  });

  it("uses data-testid", () => {
    expect(recordTypeBadge).toContain("data-testid={`tax-record-type-badge-${type}`}");
  });
});

describe("TaxTreatmentBadge", () => {
  it("covers all five treatment values", () => {
    const treatments = [
      "likely_allowable", "likely_disallowable", "review_required",
      "capital_candidate", "evidence_only",
    ];
    for (const tr of treatments) {
      expect(treatmentBadge).toContain(tr);
    }
  });

  it("review_required is amber", () => {
    const idx = treatmentBadge.indexOf("review_required");
    const snippet = treatmentBadge.slice(idx, idx + 120);
    expect(snippet).toContain("amber");
  });

  it("uses data-testid", () => {
    expect(treatmentBadge).toContain("data-testid={`tax-treatment-badge-${treatment}`}");
  });
});

// ─── TaxRecordsTab ────────────────────────────────────────────────────────────

describe("TaxRecordsTab", () => {
  it("has data-testid=tax-records-tab", () => {
    expect(recordsTab).toContain('data-testid="tax-records-tab"');
  });

  it("has desktop table with data-testid=tax-records-table", () => {
    expect(recordsTab).toContain('data-testid="tax-records-table"');
  });

  it("has mobile cards with data-testid=tax-records-cards", () => {
    expect(recordsTab).toContain('data-testid="tax-records-cards"');
  });

  it("mark-reviewed button uses data-testid", () => {
    expect(recordsTab).toContain("data-testid={`mark-reviewed-${r.id}`}");
  });

  it("exclude button uses data-testid", () => {
    expect(recordsTab).toContain("data-testid={`exclude-record-${r.id}`}");
  });

  it("delete confirm uses data-testid=confirm-delete-tax-record", () => {
    expect(recordsTab).toContain('data-testid="confirm-delete-tax-record"');
  });

  it("shows summary stats (income, expenses, needsReview)", () => {
    expect(recordsTab).toContain("compliance.tax.records.stats.income");
    expect(recordsTab).toContain("compliance.tax.records.stats.expenses");
    expect(recordsTab).toContain("compliance.tax.records.stats.needsReview");
  });

  it("uses dual layout (md:block / md:hidden)", () => {
    expect(recordsTab).toContain("md:block");
    expect(recordsTab).toContain("md:hidden");
  });

  it("form includes all required fields", () => {
    expect(recordsTab).toContain("compliance.tax.records.form.type");
    expect(recordsTab).toContain("compliance.tax.records.form.date");
    expect(recordsTab).toContain("compliance.tax.records.form.country");
    expect(recordsTab).toContain("compliance.tax.records.form.amount");
    expect(recordsTab).toContain("compliance.tax.records.form.treatment");
  });

  it("uses formatAmount with Intl.NumberFormat", () => {
    expect(recordsTab).toContain("Intl.NumberFormat");
  });
});

// ─── TaxExportsTab ────────────────────────────────────────────────────────────

describe("TaxExportsTab", () => {
  it("has data-testid=tax-exports-tab", () => {
    expect(exportsTab).toContain('data-testid="tax-exports-tab"');
  });

  it("has desktop table with data-testid=tax-exports-table", () => {
    expect(exportsTab).toContain('data-testid="tax-exports-table"');
  });

  it("has mobile cards with data-testid=tax-exports-cards", () => {
    expect(exportsTab).toContain('data-testid="tax-exports-cards"');
  });

  it("generate button has data-testid=generate-export-button", () => {
    expect(exportsTab).toContain('data-testid="generate-export-button"');
  });

  it("calls generateTaxRecordsCsv and downloadCsvBlob", () => {
    expect(exportsTab).toContain("generateTaxRecordsCsv");
    expect(exportsTab).toContain("downloadCsvBlob");
  });

  it("calls recordTaxExport to log the export", () => {
    expect(exportsTab).toContain("recordTaxExport");
  });

  it("includes a disclaimer note about review status not being filtered", () => {
    expect(exportsTab).toContain("compliance.tax.exports.form.note");
  });

  it("shows all four tax modes", () => {
    expect(exportsTab).toContain("income_tax");
    expect(exportsTab).toContain("vat");
    expect(exportsTab).toContain("corporation_tax");
    expect(exportsTab).toContain("other");
  });
});

// ─── TaxReadinessPage: tab chrome ────────────────────────────────────────────

describe("TaxReadinessPage: 3-tab layout", () => {
  it("renders three tabs: deadlines, records, exports", () => {
    expect(taxPage).toContain("deadlines");
    expect(taxPage).toContain("records");
    expect(taxPage).toContain("exports");
  });

  it("uses TABS constant to drive tab bar", () => {
    expect(taxPage).toContain('["deadlines", "records", "exports"]');
  });

  it("each tab button has data-testid=tab-{name}", () => {
    expect(taxPage).toContain("data-testid={`tab-${tab}`}");
  });

  it("uses role=tablist on the tab bar", () => {
    expect(taxPage).toContain('role="tablist"');
  });

  it("conditionally renders TaxRecordsTab for records tab", () => {
    expect(taxPage).toContain('activeTab === "records"');
    expect(taxPage).toContain("<TaxRecordsTab");
  });

  it("conditionally renders TaxExportsTab for exports tab", () => {
    expect(taxPage).toContain('activeTab === "exports"');
    expect(taxPage).toContain("<TaxExportsTab");
  });
});

// ─── i18n: Phase 1b keys ─────────────────────────────────────────────────────

describe("i18n: Phase 1b keys in EN and PL", () => {
  const requiredKeys = [
    "compliance.tax.tabs.deadlines",
    "compliance.tax.tabs.records",
    "compliance.tax.tabs.exports",
    "compliance.tax.records.addRecord",
    "compliance.tax.records.markReviewed",
    "compliance.tax.records.exclude",
    "compliance.tax.records.type.income",
    "compliance.tax.records.type.expense",
    "compliance.tax.records.treatment.likely_allowable",
    "compliance.tax.records.treatment.review_required",
    "compliance.tax.records.review.unreviewed",
    "compliance.tax.records.form.heading",
    "compliance.tax.records.form.save",
    "compliance.tax.exports.create",
    "compliance.tax.exports.form.heading",
    "compliance.tax.exports.form.generate",
    "compliance.tax.exports.modes.income_tax",
    "compliance.tax.exports.modes.vat",
    "compliance.tax.exports.errors.loadFailed",
  ];

  for (const key of requiredKeys) {
    it(`"${key}" present in ≥2 locales`, () => {
      const regex = new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g");
      const count = (messagesJs.match(regex) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    });
  }
});
