import { describe, expect, it } from "vitest";

import {
  generateQuarterlyDraftLinesCsv,
  generateQuarterlyDraftSummaryCsv,
} from "../../src/services/mtdQuarterlyDraftService.js";
import {
  aggregateDraftLinesByCategory,
  getCategoryMappingIssue,
  mapRecordToHmrcCategoryKey,
  mapTenaqoCategoryToMtdCategory,
} from "../../src/lib/mtd/mtdCategoryMapping.js";
import {
  generatePayloadPreview,
  mapRecordsToDraftLines,
  validateDraftLines,
} from "../../src/lib/mtd/mtdQuarterlyDraft.js";
import {
  buildUkPropertyPeriodSummaryPayload,
  validateUkPropertyPeriodSummaryInput,
} from "../../src/lib/mtd/hmrcUkPropertyPeriodSummaryPayloadBuilder.js";

describe("MTD quarterly draft category mapping", () => {
  it("maps existing Tax Tools categories to review-safe MTD categories", () => {
    expect(mapTenaqoCategoryToMtdCategory("repairs_maintenance")).toBe("repairs_and_maintenance");
    expect(mapTenaqoCategoryToMtdCategory("professional_fee")).toBe("professional_or_agent_fee");
    expect(mapTenaqoCategoryToMtdCategory("running_cost")).toBe("property_running_cost");
    expect(mapTenaqoCategoryToMtdCategory("capital_improvement")).toBe("review_category");
  });

  it("flags capital improvements, mixed-use, and finance costs for review", () => {
    expect(getCategoryMappingIssue({ direction: "expense", tenaqoCategory: "capital_improvement" }).issueStatus).toBe("needs_review");
    expect(getCategoryMappingIssue({ direction: "expense", tenaqoCategory: "mixed_use_review" }).issueStatus).toBe("needs_review");
    expect(getCategoryMappingIssue({ direction: "expense", tenaqoCategory: "finance_cost" }).issueStatus).toBe("needs_review");
  });

  it("maps income records to income category keys", () => {
    expect(mapRecordToHmrcCategoryKey({ direction: "income", tenaqoCategory: "rent_income" })).toBe("rent_income");
    expect(mapRecordToHmrcCategoryKey({ direction: "income", tenaqoCategory: "other_property_income" })).toBe("other_property_income");
  });
});

describe("MTD quarterly draft lines", () => {
  it("keeps estimate-only source records out of draft totals", () => {
    const [line] = mapRecordsToDraftLines([{
      sourceType: "section24_finance_cost_summary",
      sourceTable: "tax_finance_cost_summaries",
      sourceId: "00000000-0000-0000-0000-000000000001",
      date: "2026-06-30",
      description: "Section 24 context",
      amount: 250,
      direction: "adjustment",
      tenaqoCategory: "finance_cost",
      evidenceStatus: "partial",
      sourceReliability: "estimate_only",
    }]);

    expect(line.issue_status).toBe("source_estimate_only");
    expect(line.include_in_draft).toBe(false);
  });

  it("keeps review-only tax categories excluded until explicitly reviewed", () => {
    const [capital, finance, mixedUse] = mapRecordsToDraftLines([
      { sourceType: "tax_record", date: "2026-05-01", amount: 1000, direction: "expense", tenaqoCategory: "capital_improvement", propertyId: "property-1" },
      { sourceType: "tax_record", date: "2026-05-02", amount: 400, direction: "expense", tenaqoCategory: "finance_cost", propertyId: "property-1" },
      { sourceType: "tax_record", date: "2026-05-03", amount: 80, direction: "expense", tenaqoCategory: "mixed_use_review", propertyId: "property-1" },
    ]);

    expect(capital.issue_status).toBe("needs_review");
    expect(finance.issue_status).toBe("needs_review");
    expect(mixedUse.issue_status).toBe("needs_review");
    expect(capital.include_in_draft).toBe(false);
    expect(finance.include_in_draft).toBe(false);
    expect(mixedUse.include_in_draft).toBe(false);
  });

  it("flags invalid dates and amounts without crashing draft line creation", () => {
    const [line] = mapRecordsToDraftLines([{
      sourceType: "tax_record",
      sourceTable: "tax_records",
      sourceId: "record-1",
      date: "2026-99-99",
      amount: "not-a-number",
      direction: "expense",
      tenaqoCategory: "repairs_maintenance",
      propertyId: "property-1",
    }]);

    expect(line.issue_status).toBe("needs_review");
    expect(line.issue_reason).toMatch(/amount/i);
    expect(line.amount).toBe(0);
    expect(line.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("aggregates included lines by category", () => {
    const lines = [
      { include_in_draft: true, direction: "income", hmrc_category_key: "rent_income", amount: 1200, issue_status: "ok" },
      { include_in_draft: true, direction: "income", hmrc_category_key: "rent_income", amount: 800, issue_status: "ok" },
      { include_in_draft: false, direction: "expense", hmrc_category_key: "review_category", amount: 500, issue_status: "needs_review" },
    ];

    expect(aggregateDraftLinesByCategory(lines)).toEqual([
      { categoryKey: "rent_income", direction: "income", total: 2000, count: 2, issueCount: 0 },
    ]);
  });

  it("builds validation summaries from included and issue lines", () => {
    const summary = validateDraftLines([
      { include_in_draft: true, direction: "income", amount: 1000, issue_status: "ok" },
      { include_in_draft: true, direction: "expense", amount: 300, issue_status: "missing_evidence" },
      { include_in_draft: false, direction: "expense", amount: 200, issue_status: "source_estimate_only" },
    ]);

    expect(summary.incomeTotal).toBe(1000);
    expect(summary.expenseTotal).toBe(300);
    expect(summary.issueCount).toBe(2);
    expect(summary.missingEvidenceCount).toBe(1);
    expect(summary.estimateOnlyCount).toBe(1);
  });

  it("generates a preview-only payload", () => {
    const preview = generatePayloadPreview(
      {
        tax_year: "2026/27",
        period_label: "Q1",
        period_start: "2026-04-06",
        period_end: "2026-07-05",
        source_summary: {
          collectedRecords: 1,
          access_token: "secret-token",
          nested: { refresh_token: "secret-refresh", kept: true },
        },
      },
      [{ include_in_draft: true, direction: "income", amount: 100, issue_status: "ok", hmrc_category_key: "rent_income" }],
    );

    expect(preview.previewOnly).toBe(true);
    expect(preview.hmrcSubmissionDisabled).toBe(true);
    expect(preview.submission.enabled).toBe(false);
    expect(preview.period.label).toBe("Q1");
    expect(JSON.stringify(preview)).not.toContain("secret-token");
    expect(JSON.stringify(preview)).not.toContain("secret-refresh");
    expect(preview.sourceSummary.nested.kept).toBe(true);
  });

  it("exports traceability fields and review disclaimers in draft CSVs", () => {
    const linesCsv = generateQuarterlyDraftLinesCsv([{
      transaction_date: "2026-05-01",
      property_id: "property-1",
      description: "Repair",
      source_type: "tax_record",
      source_table: "tax_records",
      source_id: "record-1",
      direction: "expense",
      tenaqo_category: "repairs_maintenance",
      hmrc_category_key: "repairs_and_maintenance",
      amount: 120,
      include_in_draft: true,
      issue_status: "ok",
    }]);
    const summaryCsv = generateQuarterlyDraftSummaryCsv({
      tax_year: "2026/27",
      period_label: "Q1",
      status: "locked",
      validation_summary: { incomeTotal: 0, expenseTotal: 120, issueCount: 0, includedLines: 1, excludedLines: 0 },
    });

    expect(linesCsv).toContain("\"tax_records\"");
    expect(linesCsv).toContain("\"record-1\"");
    expect(summaryCsv).toContain("not a tax return");
    expect(summaryCsv).toContain("not been submitted to HMRC");
  });
});

describe("HMRC sandbox UK property period summary payload builder", () => {
  const draft = {
    status: "reviewed",
    tax_year: "2026-27",
    period_start: "2026-04-06",
    period_end: "2026-07-05",
  };

  it("maps basic rent income and consolidated expenses into the sandbox payload shape", () => {
    const result = buildUkPropertyPeriodSummaryPayload({
      draft,
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      lines: [
        { include_in_draft: true, direction: "income", amount: 1200, issue_status: "ok", hmrc_category_key: "rent_income" },
        { include_in_draft: true, direction: "expense", amount: 100.235, issue_status: "ok", hmrc_category_key: "repairs_and_maintenance" },
      ],
    });

    expect(result.validationIssues).toEqual([]);
    expect(result.method).toBe("PUT");
    expect(result.payload.fromDate).toBe("2026-04-06");
    expect(result.payload.ukProperty.income.totalRentsReceived.periodAmount).toBe(1200);
    expect(result.payload.ukProperty.expenses.consolidatedExpenses.periodAmount).toBe(100.24);
    expect(result.payloadSummary.submissionMode).toBe("sandbox");
  });

  it("omits excluded lines and separates other property income", () => {
    const result = buildUkPropertyPeriodSummaryPayload({
      draft,
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      lines: [
        { include_in_draft: true, direction: "income", amount: 200, issue_status: "ok", hmrc_category_key: "other_property_income" },
        { include_in_draft: false, direction: "income", amount: 999, issue_status: "excluded", hmrc_category_key: "rent_income" },
      ],
    });

    expect(result.payload.ukProperty.income.otherPropertyIncome.periodAmount).toBe(200);
    expect(result.payload.ukProperty.income.totalRentsReceived).toBeUndefined();
    expect(result.payloadSummary.included_line_count).toBe(1);
  });

  it("blocks unresolved review lines and missing identifiers", () => {
    const issues = validateUkPropertyPeriodSummaryInput({
      draft,
      nino: "",
      businessId: "",
      lines: [
        { include_in_draft: true, direction: "expense", amount: 500, issue_status: "needs_review", description: "Capital improvement" },
      ],
    });

    expect(issues.join(" ")).toMatch(/NINO/i);
    expect(issues.join(" ")).toMatch(/business/i);
    expect(issues.join(" ")).toMatch(/needs review/i);
  });

  it("keeps secrets out of the payload summary", () => {
    const result = buildUkPropertyPeriodSummaryPayload({
      draft,
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      lines: [{ include_in_draft: true, direction: "income", amount: 100, issue_status: "ok", hmrc_category_key: "rent_income" }],
    });

    const summaryText = JSON.stringify(result.payloadSummary);
    expect(summaryText).not.toMatch(/token|secret|client/i);
    expect(result.payloadSummary.issue_count).toBe(0);
  });
});
