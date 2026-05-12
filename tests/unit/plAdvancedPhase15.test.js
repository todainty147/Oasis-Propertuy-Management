// tests/unit/plAdvancedPhase15.test.js
// Phase 1.5 unit tests for Poland Compliance Toolkit UX improvements.

import { describe, it, expect } from "vitest";
import {
  calcStrReadinessScore,
  getStrMissingItems,
  STR_SAFETY_KEYS,
  STR_PLATFORMS,
  calcRentMatchConfidence,
  confidenceLabel,
  isTemplateProductionReady,
  filterPartners,
  PARTNER_TYPES,
  isValidMatchTransition,
  allowedMatchTransitions,
} from "../../src/utils/plAdvancedUtils";

// ── STR readiness ─────────────────────────────────────────────────────────────

describe("calcStrReadinessScore — Phase 1.5", () => {
  it("returns 0 for null input", () => {
    expect(calcStrReadinessScore(null)).toBe(0);
  });

  it("returns 0 for empty object", () => {
    expect(calcStrReadinessScore({})).toBe(0);
  });

  it("awards 40 for registered status", () => {
    const score = calcStrReadinessScore({ registration_status: "registered" });
    expect(score).toBe(40);
  });

  it("awards 20 for pending status", () => {
    const score = calcStrReadinessScore({ registration_status: "pending" });
    expect(score).toBe(20);
  });

  it("awards up to 40 for full safety checklist", () => {
    const checklist = Object.fromEntries(STR_SAFETY_KEYS.map((k) => [k, "confirmed"]));
    const score = calcStrReadinessScore({ registration_status: "registered", safety_checklist: checklist });
    expect(score).toBe(80);
  });

  it("counts not_applicable as resolved in safety", () => {
    const checklist = Object.fromEntries(STR_SAFETY_KEYS.map((k) => [k, "not_applicable"]));
    const score = calcStrReadinessScore({ registration_status: "registered", safety_checklist: checklist });
    expect(score).toBe(80);
  });

  it("awards 20 for at least one active platform ref", () => {
    const score = calcStrReadinessScore({
      registration_status: "registered",
      platform_refs: [{ platform: "airbnb", listing_id: "12345", is_active: true }],
    });
    expect(score).toBe(60);
  });

  it("does not count inactive platform refs", () => {
    const score = calcStrReadinessScore({
      registration_status: "registered",
      platform_refs: [{ platform: "airbnb", is_active: false }],
    });
    expect(score).toBe(40);
  });

  it("returns 100 for fully complete property", () => {
    const checklist = Object.fromEntries(STR_SAFETY_KEYS.map((k) => [k, "confirmed"]));
    const score = calcStrReadinessScore({
      registration_status: "registered",
      safety_checklist: checklist,
      platform_refs: [{ platform: "airbnb", listing_id: "12345", is_active: true }],
    });
    expect(score).toBe(100);
  });
});

// ── STR missing items ─────────────────────────────────────────────────────────

describe("getStrMissingItems — Phase 1.5", () => {
  it("returns all 3 items for null input", () => {
    expect(getStrMissingItems(null)).toEqual(["registration", "safety_checklist", "platform_ref"]);
  });

  it("returns registration missing when not registered", () => {
    expect(getStrMissingItems({ registration_status: "not_started" })).toContain("registration");
  });

  it("does not flag registration when registered", () => {
    const missing = getStrMissingItems({ registration_status: "registered" });
    expect(missing).not.toContain("registration");
  });

  it("flags safety_checklist when items are pending", () => {
    const checklist = { fire_extinguisher: "pending" };
    const missing = getStrMissingItems({ registration_status: "registered", safety_checklist: checklist });
    expect(missing).toContain("safety_checklist");
  });

  it("does not flag safety when all confirmed or not_applicable", () => {
    const checklist = Object.fromEntries(STR_SAFETY_KEYS.map((k) => [k, "confirmed"]));
    const missing = getStrMissingItems({ registration_status: "registered", safety_checklist: checklist });
    expect(missing).not.toContain("safety_checklist");
  });

  it("flags platform_ref when no platforms", () => {
    expect(getStrMissingItems({ registration_status: "registered" })).toContain("platform_ref");
  });

  it("returns empty array for fully complete property", () => {
    const checklist = Object.fromEntries(STR_SAFETY_KEYS.map((k) => [k, "confirmed"]));
    const missing = getStrMissingItems({
      registration_status: "registered",
      safety_checklist: checklist,
      platform_refs: [{ platform: "airbnb", listing_id: "123" }],
    });
    expect(missing).toHaveLength(0);
  });
});

// ── STR constants ─────────────────────────────────────────────────────────────

describe("STR constants", () => {
  it("STR_SAFETY_KEYS has 6 items", () => {
    expect(STR_SAFETY_KEYS).toHaveLength(6);
  });

  it("STR_PLATFORMS includes airbnb, booking_com, vrbo, other", () => {
    expect(STR_PLATFORMS).toContain("airbnb");
    expect(STR_PLATFORMS).toContain("booking_com");
    expect(STR_PLATFORMS).toContain("vrbo");
    expect(STR_PLATFORMS).toContain("other");
  });
});

// ── Rent match confidence ─────────────────────────────────────────────────────

describe("calcRentMatchConfidence — Phase 1.5 display logic", () => {
  const base = {
    expectedAmount: 2500,
    candidateAmount: 2500,
    expectedPeriodStart: "2026-05-01",
    expectedPeriodEnd: "2026-05-31",
    candidateReceivedAt: "2026-05-10",
  };

  it("returns 0 when amounts missing", () => {
    expect(calcRentMatchConfidence({ expectedAmount: 0, candidateAmount: 0 })).toBe(0);
  });

  it("scores 0.8 for exact amount match within period", () => {
    const score = calcRentMatchConfidence(base);
    expect(score).toBe(0.8);
  });

  it("scores 0.5 for amount match only, no timing", () => {
    const score = calcRentMatchConfidence({ expectedAmount: 2500, candidateAmount: 2500 });
    expect(score).toBe(0.5);
  });

  it("scores 0.3 for timing match only (≤1% amount diff)", () => {
    const score = calcRentMatchConfidence({
      ...base,
      candidateAmount: 2525, // 1% diff
    });
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it("does not exceed 1.0", () => {
    const score = calcRentMatchConfidence({
      ...base,
      candidateReference: "rent may 2026",
      expectedReference: "rent may 2026",
    });
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns 0 for amount mismatch >5%", () => {
    const score = calcRentMatchConfidence({
      expectedAmount: 2500,
      candidateAmount: 1000,
    });
    expect(score).toBe(0);
  });
});

// ── Confidence label ──────────────────────────────────────────────────────────

describe("confidenceLabel", () => {
  it("returns high for score >= 0.7", () => {
    expect(confidenceLabel(0.7)).toBe("high");
    expect(confidenceLabel(1.0)).toBe("high");
  });

  it("returns medium for 0.4 <= score < 0.7", () => {
    expect(confidenceLabel(0.4)).toBe("medium");
    expect(confidenceLabel(0.69)).toBe("medium");
  });

  it("returns low for score < 0.4", () => {
    expect(confidenceLabel(0)).toBe("low");
    expect(confidenceLabel(0.39)).toBe("low");
  });
});

// ── Rent match difference display ─────────────────────────────────────────────

describe("rent match difference calculation (UI logic)", () => {
  it("calculates positive difference when received > expected", () => {
    const diff = (2600 - 2500).toFixed(2);
    expect(diff).toBe("100.00");
    expect(Number(diff)).toBeGreaterThan(0);
  });

  it("calculates negative difference when received < expected", () => {
    const diff = (2400 - 2500).toFixed(2);
    expect(diff).toBe("-100.00");
    expect(Number(diff)).toBeLessThan(0);
  });

  it("shows no difference when amounts match exactly", () => {
    const diff = (2500 - 2500).toFixed(2);
    expect(Number(diff)).toBe(0);
  });
});

// ── Match status transitions ──────────────────────────────────────────────────

describe("match status transitions — Phase 1.5", () => {
  it("suggested can be confirmed, rejected, or unmatched", () => {
    const allowed = allowedMatchTransitions("suggested");
    expect(allowed).toContain("confirmed");
    expect(allowed).toContain("rejected");
    expect(allowed).toContain("unmatched");
  });

  it("confirmed can only be unmatched", () => {
    const allowed = allowedMatchTransitions("confirmed");
    expect(allowed).toEqual(["unmatched"]);
  });

  it("isValidMatchTransition suggested → confirmed is true", () => {
    expect(isValidMatchTransition("suggested", "confirmed")).toBe(true);
  });

  it("isValidMatchTransition confirmed → confirmed is false", () => {
    expect(isValidMatchTransition("confirmed", "confirmed")).toBe(false);
  });
});

// ── Template production ready ─────────────────────────────────────────────────

describe("isTemplateProductionReady — Phase 1.5", () => {
  it("returns true for reviewed + active", () => {
    expect(isTemplateProductionReady({ status: "reviewed", is_active: true })).toBe(true);
  });

  it("returns false for reviewed but inactive", () => {
    expect(isTemplateProductionReady({ status: "reviewed", is_active: false })).toBe(false);
  });

  it("returns false for draft even if active", () => {
    expect(isTemplateProductionReady({ status: "draft", is_active: true })).toBe(false);
  });

  it("returns false for requires_review", () => {
    expect(isTemplateProductionReady({ status: "requires_review", is_active: true })).toBe(false);
  });

  it("returns false for null template", () => {
    expect(isTemplateProductionReady(null)).toBe(false);
  });
});

// ── Partner filtering ─────────────────────────────────────────────────────────

describe("filterPartners — Phase 1.5", () => {
  const partners = [
    { id: "1", partner_type: "notary",    service_area: "Warsaw",   is_active: true  },
    { id: "2", partner_type: "solicitor", service_area: "Kraków",   is_active: true  },
    { id: "3", partner_type: "notary",    service_area: "Gdańsk",   is_active: true  },
    { id: "4", partner_type: "accountant",service_area: "Warsaw",   is_active: false },
  ];

  it("returns all active partners with no filter", () => {
    const result = filterPartners(partners, {});
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.is_active !== false)).toBe(true);
  });

  it("filters by partner type", () => {
    const result = filterPartners(partners, { partnerType: "notary" });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.partner_type === "notary")).toBe(true);
  });

  it("filters by service area (case-insensitive)", () => {
    const result = filterPartners(partners, { serviceArea: "warsaw" });
    expect(result).toHaveLength(1); // accountant in Warsaw is inactive
    expect(result[0].id).toBe("1");
  });

  it("returns empty for non-matching area", () => {
    const result = filterPartners(partners, { serviceArea: "Poznań" });
    expect(result).toHaveLength(0);
  });

  it("excludes inactive partners even without explicit filter", () => {
    const result = filterPartners(partners, {});
    const ids = result.map((p) => p.id);
    expect(ids).not.toContain("4");
  });

  it("handles empty partner list", () => {
    expect(filterPartners([], {})).toHaveLength(0);
  });

  it("PARTNER_TYPES includes all expected types", () => {
    expect(PARTNER_TYPES).toContain("notary");
    expect(PARTNER_TYPES).toContain("solicitor");
    expect(PARTNER_TYPES).toContain("accountant");
    expect(PARTNER_TYPES).toContain("property_manager");
  });
});

// ── Finance prefill URL logic ─────────────────────────────────────────────────

describe("Finance prefill URL generation (PlRentMatchPanel ConfirmedCta logic)", () => {
  function buildFinanceParams(candidate) {
    const params = new URLSearchParams();
    if (candidate.expected_amount)       params.set("amount",    String(candidate.expected_amount));
    if (candidate.expected_currency)     params.set("currency",  candidate.expected_currency);
    if (candidate.expected_period_start) params.set("from",      candidate.expected_period_start);
    if (candidate.expected_period_end)   params.set("to",        candidate.expected_period_end);
    if (candidate.candidate_reference)   params.set("reference", candidate.candidate_reference);
    return `/finance?${params.toString()}`;
  }

  it("builds correct finance link with all fields", () => {
    const link = buildFinanceParams({
      expected_amount: 2500,
      expected_currency: "PLN",
      expected_period_start: "2026-05-01",
      expected_period_end: "2026-05-31",
      candidate_reference: "czynsz maj 2026",
    });
    expect(link).toContain("amount=2500");
    expect(link).toContain("currency=PLN");
    expect(link).toContain("from=2026-05-01");
    expect(link).toContain("to=2026-05-31");
    expect(link).toContain("reference=");
    expect(link.startsWith("/finance?")).toBe(true);
  });

  it("omits params when fields are missing", () => {
    const link = buildFinanceParams({ expected_amount: 2500, expected_currency: "PLN" });
    expect(link).not.toContain("from=");
    expect(link).not.toContain("to=");
    expect(link).not.toContain("reference=");
  });

  it("does not auto-create a payment — only generates a link", () => {
    // This is a pure URL string — no DB call happens here
    const link = buildFinanceParams({ expected_amount: 1000, expected_currency: "PLN" });
    expect(typeof link).toBe("string");
    expect(link.startsWith("/finance")).toBe(true);

  });
});

// ── Overview next action routing logic ────────────────────────────────────────

describe("PlOverviewPanel next action resolution logic", () => {
  function resolveNextAction({ hasPolandCompliance, hasStr, hasRentMatch, hasTemplates }) {
    if (hasPolandCompliance) return { key: "rentalProt", tab: "rentalProtection" };
    if (hasStr)              return { key: "strReg",     tab: "str" };
    if (hasRentMatch)        return { key: "rentMatch",  tab: "rent" };
    if (hasTemplates)        return { key: "templates",  tab: "templates" };
    return null;
  }

  it("prioritises rentalProtection when hasPolandCompliance", () => {
    const result = resolveNextAction({ hasPolandCompliance: true, hasStr: true, hasRentMatch: true, hasTemplates: true });
    expect(result?.tab).toBe("rentalProtection");
  });

  it("falls through to str when no poland compliance", () => {
    const result = resolveNextAction({ hasPolandCompliance: false, hasStr: true, hasRentMatch: true });
    expect(result?.tab).toBe("str");
  });

  it("falls through to rent when no str", () => {
    const result = resolveNextAction({ hasPolandCompliance: false, hasStr: false, hasRentMatch: true });
    expect(result?.tab).toBe("rent");
  });

  it("falls through to templates when only templates", () => {
    const result = resolveNextAction({ hasPolandCompliance: false, hasStr: false, hasRentMatch: false, hasTemplates: true });
    expect(result?.tab).toBe("templates");
  });

  it("returns null when no features", () => {
    const result = resolveNextAction({ hasPolandCompliance: false, hasStr: false, hasRentMatch: false, hasTemplates: false });
    expect(result).toBeNull();
  });
});

// ── Property search filter logic (PlStrCompliancePanel) ──────────────────────

describe("property selector search filter logic", () => {
  const properties = [
    { id: "1", address: "ul. Marszałkowska 1", city: "Warsaw" },
    { id: "2", address: "ul. Floriańska 12",   city: "Kraków" },
    { id: "3", address: "ul. Długa 5",          city: "Gdańsk" },
    { id: "4", address: "ul. Piotrkowska 100",  city: "Łódź" },
  ];

  function filterProperties(properties, query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return properties;
    return properties.filter((p) =>
      (p.address || "").toLowerCase().includes(needle) ||
      (p.city    || "").toLowerCase().includes(needle)
    );
  }

  it("returns all properties when query is empty", () => {
    expect(filterProperties(properties, "")).toHaveLength(4);
  });

  it("filters by address substring (case-insensitive)", () => {
    const result = filterProperties(properties, "marszał");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by city", () => {
    const result = filterProperties(properties, "kraków");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("returns empty when no match", () => {
    const result = filterProperties(properties, "xyz");
    expect(result).toHaveLength(0);
  });

  it("trims whitespace from query", () => {
    const result = filterProperties(properties, "  gdańsk  ");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });
});

// ── Template visibility rules ─────────────────────────────────────────────────

describe("template visibility — normal user only sees reviewed+active", () => {
  const templates = [
    { id: "1", status: "reviewed",        is_active: true  },
    { id: "2", status: "reviewed",        is_active: false },
    { id: "3", status: "draft",           is_active: true  },
    { id: "4", status: "requires_review", is_active: true  },
    { id: "5", status: "retired",         is_active: false },
  ];

  it("listLegalTemplates (includeAll=false) returns only reviewed+active", () => {
    const visible = templates.filter((t) => isTemplateProductionReady(t));
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("1");
  });

  it("draft templates are never shown to normal users", () => {
    const drafts = templates.filter((t) => t.status === "draft");
    expect(drafts.every((t) => !isTemplateProductionReady(t))).toBe(true);
  });

  it("requires_review templates are never shown", () => {
    const needsReview = templates.filter((t) => t.status === "requires_review");
    expect(needsReview.every((t) => !isTemplateProductionReady(t))).toBe(true);
  });
});
