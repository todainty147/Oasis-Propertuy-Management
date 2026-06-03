import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  detectPossibleMtdDuplicates,
  mapPropertyFinanceCategoryToMtdSuggestion,
  PROPERTY_FINANCE_SOURCE_TYPE,
} from "../../src/services/mtdPropertyFinanceSyncService.js";
import { mapRecordsToDraftLines } from "../../src/lib/mtd/mtdQuarterlyDraft.js";

describe("Property Finance to MTD sync helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps mortgage to finance cost review without automatic MTD inclusion", () => {
    const result = mapPropertyFinanceCategoryToMtdSuggestion({ category: "mortgage" });

    expect(result.suggestedCategory).toBe("finance_cost");
    expect(result.includeInMtd).toBe(false);
    expect(result.reviewStatus).toBe("needs_review");
    expect(result.classificationConfidence).toBe("accountant_review_required");
  });

  it("maps common operating categories to suggested categories but keeps inclusion off", () => {
    expect(mapPropertyFinanceCategoryToMtdSuggestion({ category: "insurance" })).toMatchObject({
      suggestedCategory: "insurance",
      includeInMtd: false,
      classificationConfidence: "suggested",
    });
    expect(mapPropertyFinanceCategoryToMtdSuggestion({ category: "utilities" })).toMatchObject({
      suggestedCategory: "running_cost",
      includeInMtd: false,
      classificationConfidence: "suggested",
    });
    expect(mapPropertyFinanceCategoryToMtdSuggestion({ category: "other" })).toMatchObject({
      suggestedCategory: "needs_review",
      includeInMtd: false,
    });
  });

  it("keeps unreviewed synced candidates out of quarterly draft totals", () => {
    const [line] = mapRecordsToDraftLines([
      {
        sourceType: "mtd_expense_tracker",
        sourceTable: "tax_expense_classifications",
        sourceId: "classification-1",
        propertyId: "property-1",
        date: "2026-06-03",
        description: "Insurance payment from Property Finance",
        amount: 100,
        direction: "expense",
        tenaqoCategory: "insurance",
        taxTreatment: "review_required",
        mtdReady: false,
        evidenceStatus: "partial",
        sourceReliability: "needs_review",
      },
    ]);

    expect(line.include_in_draft).toBe(false);
    expect(line.issue_status).toBe("needs_review");
  });

  it("marks possible duplicate synced candidates as review issues", () => {
    const [line] = mapRecordsToDraftLines([
      {
        sourceType: "mtd_expense_tracker",
        sourceTable: "tax_expense_classifications",
        sourceId: "classification-1",
        propertyId: "property-1",
        date: "2026-06-03",
        description: "Insurance payment from Property Finance",
        amount: 100,
        direction: "expense",
        tenaqoCategory: "insurance",
        taxTreatment: "likely_allowable",
        mtdReady: true,
        evidenceStatus: "complete",
        sourceReliability: "possible_duplicate",
      },
    ]);

    expect(line.source_type).toBe("mtd_expense_tracker");
    expect(line.include_in_draft).toBe(false);
    expect(line.issue_status).toBe("possible_duplicate");
  });

  it("documents the source type used for hard dedupe", () => {
    expect(PROPERTY_FINANCE_SOURCE_TYPE).toBe("property_operating_expense");
  });

  it("can detect possible duplicates from a pre-fetched comparison set", async () => {
    const duplicates = await detectPossibleMtdDuplicates({
      accountId: "account-1",
      candidate: {
        id: "source-1",
        property_id: "property-1",
        expense_date: "2026-06-03",
        amount: 100,
        category: "insurance",
        suggestedCategory: "insurance",
      },
      existingRows: [
        {
          id: "classification-1",
          property_id: "property-1",
          source_id: "manual-1",
          expense_date: "2026-06-04",
          amount: 100,
          category: "insurance",
          description: "Insurance payment",
        },
        {
          id: "classification-2",
          property_id: "property-2",
          source_id: "manual-2",
          expense_date: "2026-06-04",
          amount: 100,
          category: "insurance",
          description: "Insurance payment",
        },
      ],
    });

    expect(duplicates.map((row) => row.id)).toEqual(["classification-1"]);
  });
});
