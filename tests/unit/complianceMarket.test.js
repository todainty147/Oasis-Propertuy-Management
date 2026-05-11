import { describe, expect, it } from "vitest";
import {
  calcTaxOfficeDueDate,
  checklistItemBucket,
  COMPLIANCE_MARKETS,
  isPolishMarket,
  NAJEM_OKAZJONALNY_ITEM_KEYS,
  resolveComplianceMarket,
  summariseChecklist,
} from "../../src/utils/complianceMarket.js";

// ── resolveComplianceMarket ───────────────────────────────────────────────

describe("resolveComplianceMarket", () => {
  it("returns property.market when set", () => {
    expect(resolveComplianceMarket({ property: { market: "pl" }, account: { country_code: "GB" } })).toBe("pl");
  });

  it("property override beats account default_market", () => {
    expect(resolveComplianceMarket({ property: { market: "uk" }, account: { default_market: "pl" } })).toBe("uk");
  });

  it("returns account.default_market when property.market is absent", () => {
    expect(resolveComplianceMarket({ account: { default_market: "pl" } })).toBe("pl");
  });

  it("maps GB country_code to uk", () => {
    expect(resolveComplianceMarket({ account: { country_code: "GB" } })).toBe("uk");
  });

  it("maps PL country_code to pl", () => {
    expect(resolveComplianceMarket({ account: { country_code: "PL" } })).toBe("pl");
  });

  it("country_code is case-insensitive", () => {
    expect(resolveComplianceMarket({ account: { country_code: "pl" } })).toBe("pl");
  });

  it("falls back to uk when nothing is set", () => {
    expect(resolveComplianceMarket({})).toBe("uk");
  });

  it("falls back to uk for unknown country_code", () => {
    expect(resolveComplianceMarket({ account: { country_code: "JP" } })).toBe("uk");
  });

  it("ignores invalid property.market values", () => {
    // Invalid market → falls through to account logic
    expect(resolveComplianceMarket({ property: { market: "us" }, account: { country_code: "PL" } })).toBe("pl");
  });

  it("handles missing account gracefully", () => {
    expect(resolveComplianceMarket({ property: { market: "generic" } })).toBe("generic");
  });
});

// ── isPolishMarket ────────────────────────────────────────────────────────

describe("isPolishMarket", () => {
  it("returns true for PL country_code account", () => {
    expect(isPolishMarket({ account: { country_code: "PL" } })).toBe(true);
  });

  it("returns false for GB country_code account", () => {
    expect(isPolishMarket({ account: { country_code: "GB" } })).toBe(false);
  });

  it("returns true when property.market is pl regardless of account", () => {
    expect(isPolishMarket({ property: { market: "pl" }, account: { country_code: "GB" } })).toBe(true);
  });

  it("returns false when no account or property info", () => {
    expect(isPolishMarket({})).toBe(false);
  });
});

// ── COMPLIANCE_MARKETS ────────────────────────────────────────────────────

describe("COMPLIANCE_MARKETS", () => {
  it("contains pl, uk, generic", () => {
    expect(COMPLIANCE_MARKETS).toContain("pl");
    expect(COMPLIANCE_MARKETS).toContain("uk");
    expect(COMPLIANCE_MARKETS).toContain("generic");
  });
});

// ── NAJEM_OKAZJONALNY_ITEM_KEYS ───────────────────────────────────────────

describe("NAJEM_OKAZJONALNY_ITEM_KEYS", () => {
  it("has 10 items", () => {
    expect(NAJEM_OKAZJONALNY_ITEM_KEYS).toHaveLength(10);
  });

  it("starts with lease_agreement", () => {
    expect(NAJEM_OKAZJONALNY_ITEM_KEYS[0]).toBe("lease_agreement");
  });

  it("includes tax_office_deadline", () => {
    expect(NAJEM_OKAZJONALNY_ITEM_KEYS).toContain("tax_office_deadline");
  });

  it("includes notarial_declaration", () => {
    expect(NAJEM_OKAZJONALNY_ITEM_KEYS).toContain("notarial_declaration");
  });
});

// ── summariseChecklist ────────────────────────────────────────────────────

describe("summariseChecklist", () => {
  it("returns zeros for empty list", () => {
    const s = summariseChecklist([]);
    expect(s).toEqual({ total: 0, complete: 0, notApplicable: 0, pending: 0, overdue: 0 });
  });

  it("counts complete items correctly", () => {
    const items = [
      { status: "complete" },
      { status: "complete" },
      { status: "pending" },
    ];
    const s = summariseChecklist(items);
    expect(s.complete).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.total).toBe(3);
  });

  it("counts not_applicable items correctly", () => {
    const items = [{ status: "not_applicable" }, { status: "pending" }];
    const s = summariseChecklist(items);
    expect(s.notApplicable).toBe(1);
  });

  it("counts overdue as pending items where due_date is in the past", () => {
    const past = "2000-01-01";
    const future = "2099-01-01";
    const items = [
      { status: "pending", due_date: past },
      { status: "pending", due_date: future },
      { status: "complete", due_date: past }, // complete — not overdue even if past due
    ];
    const s = summariseChecklist(items);
    expect(s.overdue).toBe(1);
    expect(s.pending).toBe(2);
  });

  it("does not count null due_date as overdue", () => {
    const items = [{ status: "pending", due_date: null }];
    const s = summariseChecklist(items);
    expect(s.overdue).toBe(0);
  });
});

// ── calcTaxOfficeDueDate ──────────────────────────────────────────────────

describe("calcTaxOfficeDueDate", () => {
  it("returns null for null input", () => {
    expect(calcTaxOfficeDueDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(calcTaxOfficeDueDate("")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(calcTaxOfficeDueDate("not-a-date")).toBeNull();
  });

  it("adds exactly 14 days to a known date", () => {
    const result = calcTaxOfficeDueDate("2026-01-01");
    expect(result).toBeInstanceOf(Date);
    // 2026-01-01 + 14 days = 2026-01-15
    expect(result.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("handles month boundary correctly", () => {
    const result = calcTaxOfficeDueDate("2026-01-25");
    // 2026-01-25 + 14 = 2026-02-08
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-08");
  });

  it("handles leap year", () => {
    const result = calcTaxOfficeDueDate("2028-02-20");
    // 2028 is leap year — 2028-02-20 + 14 = 2028-03-05
    expect(result.toISOString().slice(0, 10)).toBe("2028-03-05");
  });
});

// ── checklistItemBucket ───────────────────────────────────────────────────

describe("checklistItemBucket", () => {
  it("returns action when no due date", () => {
    expect(checklistItemBucket(null)).toBe("action");
  });

  it("returns urgent for a past due date", () => {
    expect(checklistItemBucket("2000-01-01")).toBe("urgent");
  });

  it("returns urgent for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(checklistItemBucket(today)).toBe("urgent");
  });

  it("returns urgent for due in 1 day", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(checklistItemBucket(tomorrow)).toBe("urgent");
  });

  it("returns action for due in 3 days", () => {
    const threeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(checklistItemBucket(threeDays)).toBe("action");
  });

  it("returns action for due in 7 days", () => {
    const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(checklistItemBucket(sevenDays)).toBe("action");
  });

  it("returns upcoming for due in 30 days", () => {
    const thirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(checklistItemBucket(thirtyDays)).toBe("upcoming");
  });
});
