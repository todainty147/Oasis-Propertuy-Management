// tests/unit/evidencePack.test.js
//
// Unit tests for pure functions in src/utils/evidencePackUtils.js

import { describe, expect, it } from "vitest";
import {
  calcCompletionPct,
  getMissingItems,
  getPendingReviewItems,
  getResolvedItems,
  sortChecklistItems,
  isDocumentEligible,
  suggestByDocumentName,
  deriveHandoverStatus,
  validateMeterReading,
  METER_TYPE_KEYS,
} from "../../src/utils/evidencePackUtils.js";
import { NAJEM_OKAZJONALNY_ITEM_KEYS } from "../../src/utils/complianceMarket.js";

// ── calcCompletionPct ─────────────────────────────────────────────────────────

describe("calcCompletionPct", () => {
  it("returns 0 for empty array", () => {
    expect(calcCompletionPct([])).toBe(0);
  });

  it("returns 100 when all items are complete", () => {
    const items = [
      { status: "complete", evidence_document_id: null },
      { status: "complete", evidence_document_id: "abc" },
      { status: "not_applicable", evidence_document_id: null },
    ];
    expect(calcCompletionPct(items)).toBe(100);
  });

  it("returns 0 when all items are pending with no evidence", () => {
    const items = [
      { status: "pending", evidence_document_id: null },
      { status: "pending", evidence_document_id: null },
    ];
    expect(calcCompletionPct(items)).toBe(0);
  });

  it("returns 50 for pending item with evidence_document_id", () => {
    const items = [{ status: "pending", evidence_document_id: "doc-1" }];
    expect(calcCompletionPct(items)).toBe(50);
  });

  it("counts not_applicable as fully done", () => {
    const items = [
      { status: "not_applicable", evidence_document_id: null },
      { status: "pending", evidence_document_id: null },
    ];
    expect(calcCompletionPct(items)).toBe(50);
  });

  it("rounds to nearest integer", () => {
    const items = [
      { status: "complete", evidence_document_id: null },
      { status: "complete", evidence_document_id: null },
      { status: "pending", evidence_document_id: null },
    ];
    // 2/3 = 66.67 → 67
    expect(calcCompletionPct(items)).toBe(67);
  });

  it("handles mixed: complete + pending-with-evidence + missing", () => {
    const items = [
      { status: "complete", evidence_document_id: null },       // 1.0
      { status: "pending", evidence_document_id: "doc-1" },    // 0.5
      { status: "pending", evidence_document_id: null },        // 0.0
      { status: "pending", evidence_document_id: null },        // 0.0
    ];
    // score = 1.5, total = 4 → 37.5 → 38
    expect(calcCompletionPct(items)).toBe(38);
  });
});

// ── getMissingItems ───────────────────────────────────────────────────────────

describe("getMissingItems", () => {
  const items = [
    { id: 1, status: "pending", evidence_document_id: null },
    { id: 2, status: "pending", evidence_document_id: "doc-1" },
    { id: 3, status: "complete", evidence_document_id: null },
    { id: 4, status: "not_applicable", evidence_document_id: null },
  ];

  it("returns only pending items without evidence", () => {
    expect(getMissingItems(items)).toEqual([{ id: 1, status: "pending", evidence_document_id: null }]);
  });

  it("returns empty array when all are resolved", () => {
    expect(getMissingItems([items[2], items[3]])).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(getMissingItems([])).toEqual([]);
  });
});

// ── getPendingReviewItems ─────────────────────────────────────────────────────

describe("getPendingReviewItems", () => {
  const items = [
    { id: 1, status: "pending", evidence_document_id: null },
    { id: 2, status: "pending", evidence_document_id: "doc-1" },
    { id: 3, status: "complete", evidence_document_id: "doc-2" },
  ];

  it("returns pending items that have evidence linked", () => {
    expect(getPendingReviewItems(items)).toEqual([
      { id: 2, status: "pending", evidence_document_id: "doc-1" },
    ]);
  });

  it("excludes complete items even with evidence", () => {
    expect(getPendingReviewItems([items[2]])).toEqual([]);
  });
});

// ── getResolvedItems ──────────────────────────────────────────────────────────

describe("getResolvedItems", () => {
  const items = [
    { id: 1, status: "pending", evidence_document_id: null },
    { id: 2, status: "complete", evidence_document_id: null },
    { id: 3, status: "not_applicable", evidence_document_id: null },
  ];

  it("returns complete and not_applicable items", () => {
    expect(getResolvedItems(items)).toEqual([items[1], items[2]]);
  });

  it("excludes pending items", () => {
    expect(getResolvedItems([items[0]])).toEqual([]);
  });
});

// ── sortChecklistItems ────────────────────────────────────────────────────────

describe("sortChecklistItems", () => {
  it("sorts items in NAJEM_OKAZJONALNY_ITEM_KEYS order", () => {
    const [key0, key1, key2] = NAJEM_OKAZJONALNY_ITEM_KEYS;
    const items = [
      { item_key: key2 },
      { item_key: key0 },
      { item_key: key1 },
    ];
    const sorted = sortChecklistItems(items);
    expect(sorted[0].item_key).toBe(key0);
    expect(sorted[1].item_key).toBe(key1);
    expect(sorted[2].item_key).toBe(key2);
  });

  it("places unknown item_key at end", () => {
    const [key0] = NAJEM_OKAZJONALNY_ITEM_KEYS;
    const items = [
      { item_key: "unknown_key" },
      { item_key: key0 },
    ];
    const sorted = sortChecklistItems(items);
    expect(sorted[0].item_key).toBe(key0);
    expect(sorted[1].item_key).toBe("unknown_key");
  });

  it("does not mutate the original array", () => {
    const items = [{ item_key: "unknown" }];
    const original = [...items];
    sortChecklistItems(items);
    expect(items).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(sortChecklistItems([])).toEqual([]);
  });
});

// ── isDocumentEligible ────────────────────────────────────────────────────────

describe("isDocumentEligible", () => {
  it("allows application/pdf", () => {
    expect(isDocumentEligible("application/pdf")).toBe(true);
  });

  it("allows image/jpeg", () => {
    expect(isDocumentEligible("image/jpeg")).toBe(true);
  });

  it("allows image/png", () => {
    expect(isDocumentEligible("image/png")).toBe(true);
  });

  it("allows image/webp", () => {
    expect(isDocumentEligible("image/webp")).toBe(true);
  });

  it("allows application/msword", () => {
    expect(isDocumentEligible("application/msword")).toBe(true);
  });

  it("allows docx mime type", () => {
    expect(isDocumentEligible("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });

  it("rejects text/plain", () => {
    expect(isDocumentEligible("text/plain")).toBe(false);
  });

  it("rejects video/mp4", () => {
    expect(isDocumentEligible("video/mp4")).toBe(false);
  });

  it("rejects null gracefully", () => {
    expect(isDocumentEligible(null)).toBe(false);
  });

  it("rejects undefined gracefully", () => {
    expect(isDocumentEligible(undefined)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDocumentEligible("Application/PDF")).toBe(true);
  });
});

// ── suggestByDocumentName ─────────────────────────────────────────────────────

describe("suggestByDocumentName", () => {
  it("returns empty array for unrecognised name", () => {
    expect(suggestByDocumentName("random-file.pdf", [])).toEqual([]);
  });

  it("suggests lease_agreement for name containing 'umowa'", () => {
    const results = suggestByDocumentName("umowa_najmu_2024.pdf", []);
    expect(results.some((r) => r.item_key === "lease_agreement")).toBe(true);
  });

  it("suggests lease_agreement with high confidence for UMOWA tag", () => {
    const results = suggestByDocumentName("doc.pdf", ["UMOWA"]);
    const match = results.find((r) => r.item_key === "lease_agreement");
    expect(match).toBeDefined();
    expect(match.confidence).toBe("high");
  });

  it("suggests notarial_declaration for 'notarial' in name", () => {
    const results = suggestByDocumentName("notarial_statement.pdf", []);
    expect(results.some((r) => r.item_key === "notarial_declaration")).toBe(true);
  });

  it("suggests handover_protocol for 'protokół' in name", () => {
    const results = suggestByDocumentName("protokół_zdawczo.pdf", []);
    expect(results.some((r) => r.item_key === "handover_protocol")).toBe(true);
  });

  it("suggests handover_protocol with high confidence for PROTOKOL tag", () => {
    const results = suggestByDocumentName("doc.pdf", ["PROTOKOL"]);
    const match = results.find((r) => r.item_key === "handover_protocol");
    expect(match?.confidence).toBe("high");
  });

  it("suggests deposit_confirmation for 'kaucja' in name", () => {
    const results = suggestByDocumentName("kaucja_potwierdzenie.pdf", []);
    expect(results.some((r) => r.item_key === "deposit_confirmation")).toBe(true);
  });

  it("suggests tax_office_notification for 'urząd skarbowy' in name", () => {
    const results = suggestByDocumentName("urząd skarbowy zgłoszenie.pdf", []);
    expect(results.some((r) => r.item_key === "tax_office_notification")).toBe(true);
  });

  it("suggests meter_readings for 'licznik' in name", () => {
    const results = suggestByDocumentName("licznik_stan.pdf", []);
    expect(results.some((r) => r.item_key === "meter_readings")).toBe(true);
  });

  it("returns items with required fields", () => {
    const results = suggestByDocumentName("umowa.pdf", []);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => {
      expect(r).toHaveProperty("item_key");
      expect(r).toHaveProperty("confidence");
      expect(r).toHaveProperty("reasoning");
    });
  });

  it("handles empty name gracefully", () => {
    expect(() => suggestByDocumentName("", [])).not.toThrow();
  });

  it("handles null inputs gracefully", () => {
    expect(() => suggestByDocumentName(null, null)).not.toThrow();
  });
});

// ── deriveHandoverStatus ──────────────────────────────────────────────────────

describe("deriveHandoverStatus", () => {
  it("returns 'completed' when status is completed", () => {
    expect(deriveHandoverStatus({ status: "completed" })).toBe("completed");
  });

  it("returns 'landlord_confirmed' when status is landlord_confirmed", () => {
    expect(deriveHandoverStatus({ status: "landlord_confirmed" })).toBe("landlord_confirmed");
  });

  it("returns 'draft' for draft status", () => {
    expect(deriveHandoverStatus({ status: "draft" })).toBe("draft");
  });

  it("returns 'draft' for missing status", () => {
    expect(deriveHandoverStatus({})).toBe("draft");
  });

  it("returns null for null input", () => {
    expect(deriveHandoverStatus(null)).toBe(null);
  });

  it("returns null for undefined input", () => {
    expect(deriveHandoverStatus(undefined)).toBe(null);
  });
});

// ── validateMeterReading ──────────────────────────────────────────────────────

describe("validateMeterReading", () => {
  it("returns null for valid electricity reading", () => {
    expect(validateMeterReading({ meterType: "electricity", readingValue: "12345.6" })).toBe(null);
  });

  it("returns null for all valid meter types", () => {
    METER_TYPE_KEYS.forEach((meterType) => {
      expect(validateMeterReading({ meterType, readingValue: "100" })).toBe(null);
    });
  });

  it("returns 'invalid_meter_type' for unknown meter type", () => {
    expect(validateMeterReading({ meterType: "nuclear", readingValue: "100" })).toBe("invalid_meter_type");
  });

  it("returns 'invalid_meter_type' for empty meter type", () => {
    expect(validateMeterReading({ meterType: "", readingValue: "100" })).toBe("invalid_meter_type");
  });

  it("returns 'reading_value_required' for empty reading value", () => {
    expect(validateMeterReading({ meterType: "gas", readingValue: "" })).toBe("reading_value_required");
  });

  it("returns 'reading_value_required' for whitespace-only reading", () => {
    expect(validateMeterReading({ meterType: "gas", readingValue: "   " })).toBe("reading_value_required");
  });

  it("returns 'reading_value_required' for null reading value", () => {
    expect(validateMeterReading({ meterType: "gas", readingValue: null })).toBe("reading_value_required");
  });

  it("invalid_meter_type takes priority over missing reading value", () => {
    expect(validateMeterReading({ meterType: "nuclear", readingValue: "" })).toBe("invalid_meter_type");
  });
});

// ── METER_TYPE_KEYS ───────────────────────────────────────────────────────────

describe("METER_TYPE_KEYS", () => {
  it("is an array with 6 entries", () => {
    expect(METER_TYPE_KEYS).toHaveLength(6);
  });

  it("includes all expected meter types", () => {
    expect(METER_TYPE_KEYS).toContain("electricity");
    expect(METER_TYPE_KEYS).toContain("gas");
    expect(METER_TYPE_KEYS).toContain("water_cold");
    expect(METER_TYPE_KEYS).toContain("water_hot");
    expect(METER_TYPE_KEYS).toContain("heat");
    expect(METER_TYPE_KEYS).toContain("other");
  });
});
