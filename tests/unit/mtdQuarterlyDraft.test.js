import { describe, expect, it } from "vitest";

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
      { tax_year: "2026/27", period_label: "Q1", period_start: "2026-04-06", period_end: "2026-07-05" },
      [{ include_in_draft: true, direction: "income", amount: 100, issue_status: "ok", hmrc_category_key: "rent_income" }],
    );

    expect(preview.previewOnly).toBe(true);
    expect(preview.hmrcSubmissionDisabled).toBe(true);
    expect(preview.period.label).toBe("Q1");
  });
});
