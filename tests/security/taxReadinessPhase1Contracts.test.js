import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const taxService    = read("src/services/taxReadinessService.js");
const rpcContracts  = read("src/services/rpcContracts.js");
const useHook       = read("src/hooks/useTaxReadiness.js");
const statusBadge   = read("src/components/compliance/TaxStatusBadge.jsx");
const taxPage       = read("src/pages/compliance/TaxReadinessPage.jsx");
const messagesJs    = read("src/i18n/messages.js");
const securitySql   = read("supabase/compliance_security_hardening.sql");

// ─── rpcContracts: tax fields parsed ─────────────────────────────────────────

describe("parseComplianceItemRow: tax fields", () => {
  it("parses jurisdiction", () => {
    expect(rpcContracts).toContain("jurisdiction: toNullableString(value.jurisdiction)");
  });

  it("parses tax_filing_type", () => {
    expect(rpcContracts).toContain("tax_filing_type: toNullableString(value.tax_filing_type)");
  });

  it("parses deadline_date", () => {
    expect(rpcContracts).toContain("deadline_date: toNullableString(value.deadline_date)");
  });

  it("parses filed_at", () => {
    expect(rpcContracts).toContain("filed_at: toNullableString(value.filed_at)");
  });

  it("parses filing_reference", () => {
    expect(rpcContracts).toContain("filing_reference: toNullableString(value.filing_reference)");
  });
});

// ─── taxReadinessService: structure ──────────────────────────────────────────

describe("taxReadinessService: exported functions", () => {
  it("exports listTaxItems", () => {
    expect(taxService).toContain("export async function listTaxItems");
  });

  it("exports createTaxItem", () => {
    expect(taxService).toContain("export async function createTaxItem");
  });

  it("exports markTaxItemFiled", () => {
    expect(taxService).toContain("export async function markTaxItemFiled");
  });

  it("exports deleteTaxItem", () => {
    expect(taxService).toContain("export async function deleteTaxItem");
  });

  it("exports deriveTaxStatus", () => {
    expect(taxService).toContain("export function deriveTaxStatus");
  });

  it("exports exportTaxItemsAsCsv", () => {
    expect(taxService).toContain("export function exportTaxItemsAsCsv");
  });
});

describe("taxReadinessService: safety invariants", () => {
  it("listTaxItems calls rpc list_tax_items (category=tax enforced in SQL RPC, Phase 7)", () => {
    expect(taxService).toContain('.rpc("list_tax_items"');
  });

  it("createTaxItem inserts category=tax (enforced in RPC)", () => {
    // Phase 5: enforcement moved to SQL RPC; JS calls rpc("create_tax_item")
    const idx = securitySql.indexOf("create or replace function public.create_tax_item(");
    const end = securitySql.indexOf("create or replace function public.mark_tax_item_filed(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("'tax'");
  });

  it("markTaxItemFiled enforces category=tax filter (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes category = 'tax'
    const idx = securitySql.indexOf("create or replace function public.mark_tax_item_filed(");
    const end = securitySql.indexOf("create or replace function public.delete_tax_item(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("category   = 'tax'");
  });

  it("deleteTaxItem enforces category=tax filter (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes category = 'tax'
    const idx = securitySql.indexOf("create or replace function public.delete_tax_item(");
    const end = securitySql.indexOf("create or replace function public.create_tax_record(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("category   = 'tax'");
  });

  it("markTaxItemFiled scopes by account_id as well as item id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.mark_tax_item_filed(");
    const end = securitySql.indexOf("create or replace function public.delete_tax_item(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("deleteTaxItem scopes by account_id as well as item id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.delete_tax_item(");
    const end = securitySql.indexOf("create or replace function public.create_tax_record(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("jurisdiction is uppercased and capped at 2 chars on write", () => {
    expect(taxService).toContain("toUpperCase().slice(0, 2)");
  });

  it("recurrenceIntervalMonths is clamped 0–60", () => {
    expect(taxService).toContain("Math.max(0, Math.min(60,");
  });
});

describe("taxReadinessService: deriveTaxStatus logic", () => {
  it("returns compliant when filed_at is set", () => {
    expect(taxService).toContain("if (item.filed_at) return \"compliant\"");
  });

  it("returns overdue when daysUntil < 0", () => {
    expect(taxService).toContain("if (daysUntil < 0) return \"overdue\"");
  });

  it("upcoming threshold is 30 days", () => {
    expect(taxService).toContain("if (daysUntil <= 30) return \"upcoming\"");
  });

  it("falls back to deadline_date then due_date", () => {
    expect(taxService).toContain("item.deadline_date || item.due_date");
  });

  it("handles missing date gracefully", () => {
    expect(taxService).toContain("if (!raw) return \"scheduled\"");
  });
});

describe("taxReadinessService: CSV export safety", () => {
  it("escapes double-quotes inside cell values", () => {
    expect(taxService).toContain('replace(/"/g, \'""\'');
  });

  it("includes all expected column headers", () => {
    const HEADERS = ["Title", "Jurisdiction", "Type", "Deadline", "Status", "Filed Date", "Reference"];
    for (const h of HEADERS) {
      expect(taxService).toContain(h);
    }
  });

  it("uses deriveTaxStatus in export (not raw status field)", () => {
    const idx = taxService.indexOf("export function exportTaxItemsAsCsv");
    const snippet = taxService.slice(idx, idx + 400);
    expect(snippet).toContain("deriveTaxStatus(item)");
  });
});

// ─── useTaxReadiness hook ─────────────────────────────────────────────────────

describe("useTaxReadiness hook", () => {
  it("exports useTaxReadiness", () => {
    expect(useHook).toContain("export function useTaxReadiness");
  });

  it("returns items, loading, error, refetch", () => {
    expect(useHook).toContain("items");
    expect(useHook).toContain("loading");
    expect(useHook).toContain("error");
    expect(useHook).toContain("refetch");
  });

  it("guards against missing accountId", () => {
    expect(useHook).toContain("if (!accountId)");
  });

  it("uses cancellation flag to avoid stale state updates", () => {
    expect(useHook).toContain("cancelled = true");
  });
});

// ─── TaxStatusBadge ──────────────────────────────────────────────────────────

describe("TaxStatusBadge", () => {
  it("renders four status states", () => {
    expect(statusBadge).toContain("compliant");
    expect(statusBadge).toContain("upcoming");
    expect(statusBadge).toContain("overdue");
    expect(statusBadge).toContain("scheduled");
  });

  it("uses i18n keys for labels (not hardcoded strings)", () => {
    expect(statusBadge).toContain("compliance.tax.status.");
  });

  it("uses data-testid for each badge", () => {
    expect(statusBadge).toContain("data-testid={`tax-status-badge-${status}`}");
  });

  it("overdue is rose-coloured", () => {
    const idx = statusBadge.indexOf("overdue");
    const snippet = statusBadge.slice(idx, idx + 100);
    expect(snippet).toContain("rose");
  });

  it("compliant is emerald-coloured", () => {
    const idx = statusBadge.indexOf("compliant");
    const snippet = statusBadge.slice(idx, idx + 100);
    expect(snippet).toContain("emerald");
  });
});

// ─── TaxReadinessPage ────────────────────────────────────────────────────────

describe("TaxReadinessPage", () => {
  it("has data-testid=tax-readiness-page", () => {
    expect(taxPage).toContain('data-testid="tax-readiness-page"');
  });

  it("has desktop table with data-testid=tax-items-table", () => {
    expect(taxPage).toContain('data-testid="tax-items-table"');
  });

  it("has mobile cards with data-testid=tax-items-cards", () => {
    expect(taxPage).toContain('data-testid="tax-items-cards"');
  });

  it("uses dual-layout pattern (md:block / md:hidden)", () => {
    expect(taxPage).toContain("md:block");
    expect(taxPage).toContain("md:hidden");
  });

  it("shows disclaimer via i18n key", () => {
    expect(taxPage).toContain("compliance.tax.disclaimer");
  });

  it("has Add Deadline button that shows inline form", () => {
    expect(taxPage).toContain("showAddForm");
    expect(taxPage).toContain("compliance.tax.addDeadline");
  });

  it("has jurisdiction tabs for GB, PL, DE", () => {
    expect(taxPage).toContain("GB");
    expect(taxPage).toContain("PL");
    expect(taxPage).toContain("DE");
  });

  it("shows four stat cards (total/overdue/upcoming/compliant)", () => {
    expect(taxPage).toContain("compliance.tax.stats.total");
    expect(taxPage).toContain("compliance.tax.stats.overdue");
    expect(taxPage).toContain("compliance.tax.stats.upcoming");
    expect(taxPage).toContain("compliance.tax.stats.compliant");
  });

  it("mark-filed button has data-testid=mark-filed-${item.id}", () => {
    expect(taxPage).toContain("data-testid={`mark-filed-${item.id}`}");
  });

  it("delete button has data-testid=delete-tax-item-${item.id}", () => {
    expect(taxPage).toContain("data-testid={`delete-tax-item-${item.id}`}");
  });

  it("confirm mark-filed has data-testid=confirm-mark-filed", () => {
    expect(taxPage).toContain('data-testid="confirm-mark-filed"');
  });

  it("filed reference input has data-testid=filed-reference-input", () => {
    expect(taxPage).toContain('data-testid="filed-reference-input"');
  });

  it("exports CSV via exportTaxItemsAsCsv", () => {
    expect(taxPage).toContain("exportTaxItemsAsCsv");
  });

  it("form includes recurrence selector", () => {
    expect(taxPage).toContain("recurrenceIntervalMonths");
    expect(taxPage).toContain("compliance.tax.form.recurrence");
  });

  it("does not hardcode any jurisdiction-specific labels", () => {
    expect(taxPage).not.toContain("United Kingdom");
    expect(taxPage).not.toContain("Großbritannien");
    expect(taxPage).not.toContain("Wielka Brytania");
  });
});

// ─── i18n: Phase 1 keys in all locales ───────────────────────────────────────

describe("i18n: Phase 1 tax keys", () => {
  const requiredKeys = [
    "compliance.tax.addDeadline",
    "compliance.tax.exportCsv",
    "compliance.tax.markFiled",
    "compliance.tax.emptyState",
    "compliance.tax.jurisdiction.all",
    "compliance.tax.jurisdiction.gb",
    "compliance.tax.jurisdiction.pl",
    "compliance.tax.jurisdiction.de",
    "compliance.tax.status.compliant",
    "compliance.tax.status.upcoming",
    "compliance.tax.status.overdue",
    "compliance.tax.status.scheduled",
    "compliance.tax.stats.total",
    "compliance.tax.stats.overdue",
    "compliance.tax.stats.upcoming",
    "compliance.tax.stats.compliant",
    "compliance.tax.table.title",
    "compliance.tax.table.deadline",
    "compliance.tax.table.status",
    "compliance.tax.form.heading",
    "compliance.tax.form.title",
    "compliance.tax.form.jurisdiction",
    "compliance.tax.form.deadlineDate",
    "compliance.tax.form.recurrence",
    "compliance.tax.form.recurrence.none",
    "compliance.tax.form.recurrence.quarterly",
    "compliance.tax.form.recurrence.annual",
    "compliance.tax.form.save",
    "compliance.tax.filedModal.title",
    "compliance.tax.filedModal.confirm",
    "compliance.tax.deleteModal.title",
    "compliance.tax.errors.saveFailed",
    "compliance.tax.errors.markFiledFailed",
  ];

  for (const key of requiredKeys) {
    it(`key "${key}" present in at least EN and PL`, () => {
      const occurrences = (messagesJs.match(new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g")) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    });
  }
});
