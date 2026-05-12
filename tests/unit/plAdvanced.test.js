// tests/unit/plAdvanced.test.js
//
// Unit tests for plAdvancedUtils.js pure functions.

import { describe, expect, it } from "vitest";
import {
  hasRentMatchFeature,
  hasStrComplianceFeature,
  hasTemplateLibraryFeature,
  hasPartnerDirectoryFeature,
  hasAnyPlAdvancedFeature,
  calcRentMatchConfidence,
  confidenceLabel,
  isValidMatchTransition,
  allowedMatchTransitions,
  calcStrReadinessScore,
  getStrMissingItems,
  STR_SAFETY_KEYS,
  STR_PLATFORMS,
  isTemplateProductionReady,
  templateStatusLabel,
  isTemplateDisabled,
  filterPartners,
  PARTNER_TYPES,
} from "../../src/utils/plAdvancedUtils.js";

// ── Feature flag helpers ──────────────────────────────────────────────────────

describe("feature flag helpers", () => {
  const allFeatures = [
    "pl_open_banking_readiness",
    "pl_str_compliance",
    "pl_template_library",
    "pl_partner_directory",
  ];

  it("hasRentMatchFeature returns true when flag present", () => {
    expect(hasRentMatchFeature(allFeatures)).toBe(true);
  });

  it("hasRentMatchFeature returns false when flag absent", () => {
    expect(hasRentMatchFeature(["poland_compliance"])).toBe(false);
  });

  it("hasStrComplianceFeature returns true when flag present", () => {
    expect(hasStrComplianceFeature(allFeatures)).toBe(true);
  });

  it("hasStrComplianceFeature returns false when flag absent", () => {
    expect(hasStrComplianceFeature([])).toBe(false);
  });

  it("hasTemplateLibraryFeature returns true when flag present", () => {
    expect(hasTemplateLibraryFeature(allFeatures)).toBe(true);
  });

  it("hasPartnerDirectoryFeature returns true when flag present", () => {
    expect(hasPartnerDirectoryFeature(allFeatures)).toBe(true);
  });

  it("hasAnyPlAdvancedFeature returns true when any flag present", () => {
    expect(hasAnyPlAdvancedFeature(["pl_str_compliance"])).toBe(true);
  });

  it("hasAnyPlAdvancedFeature returns false when no flags present", () => {
    expect(hasAnyPlAdvancedFeature(["poland_compliance", "documents"])).toBe(false);
  });

  it("hasAnyPlAdvancedFeature returns false for empty array", () => {
    expect(hasAnyPlAdvancedFeature([])).toBe(false);
  });

  it("all helpers handle missing input gracefully", () => {
    expect(hasRentMatchFeature()).toBe(false);
    expect(hasStrComplianceFeature(null)).toBe(false);
    expect(hasAnyPlAdvancedFeature(undefined)).toBe(false);
  });
});

// ── calcRentMatchConfidence ───────────────────────────────────────────────────

describe("calcRentMatchConfidence", () => {
  const baseArgs = {
    expectedAmount:       2500,
    candidateAmount:      2500,
    expectedPeriodStart:  "2026-05-01",
    expectedPeriodEnd:    "2026-05-31",
    candidateReceivedAt:  "2026-05-05",
  };

  it("returns 0 when expectedAmount is missing", () => {
    expect(calcRentMatchConfidence({ ...baseArgs, expectedAmount: 0 })).toBe(0);
  });

  it("returns 0 when candidateAmount is missing", () => {
    expect(calcRentMatchConfidence({ ...baseArgs, candidateAmount: null })).toBe(0);
  });

  it("returns high score for exact amount + in-period receipt", () => {
    const score = calcRentMatchConfidence(baseArgs);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns 0.5 for exact amount but no timing", () => {
    const score = calcRentMatchConfidence({
      expectedAmount:  2500,
      candidateAmount: 2500,
    });
    expect(score).toBe(0.5);
  });

  it("gives partial score for amount within 1%", () => {
    const score = calcRentMatchConfidence({
      ...baseArgs,
      candidateAmount: 2525,  // ~1% over
    });
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1.0);
  });

  it("gives minimal score for amount >5% mismatch", () => {
    const score = calcRentMatchConfidence({
      expectedAmount:  2500,
      candidateAmount: 1000,  // >5% off
      expectedPeriodStart: "2026-05-01",
      expectedPeriodEnd:   "2026-05-31",
    });
    expect(score).toBeLessThan(0.4);
  });

  it("adds bonus for reference keyword match", () => {
    const withRef = calcRentMatchConfidence({
      ...baseArgs,
      candidateReference: "czynsz maj kowalski",
      expectedReference:  "kowalski czynsz",
    });
    const withoutRef = calcRentMatchConfidence(baseArgs);
    expect(withRef).toBeGreaterThan(withoutRef);
  });

  it("caps at 1.0", () => {
    const score = calcRentMatchConfidence({
      ...baseArgs,
      candidateReference: "kowalski czynsz maj",
      expectedReference:  "kowalski czynsz",
    });
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns 0 for negative amounts", () => {
    expect(calcRentMatchConfidence({ expectedAmount: -100, candidateAmount: 2500 })).toBe(0);
  });

  it("score is a number between 0 and 1", () => {
    const score = calcRentMatchConfidence(baseArgs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ── confidenceLabel ───────────────────────────────────────────────────────────

describe("confidenceLabel", () => {
  it("returns 'high' for score >= 0.7", () => {
    expect(confidenceLabel(0.7)).toBe("high");
    expect(confidenceLabel(1.0)).toBe("high");
  });

  it("returns 'medium' for score 0.4-0.7", () => {
    expect(confidenceLabel(0.4)).toBe("medium");
    expect(confidenceLabel(0.69)).toBe("medium");
  });

  it("returns 'low' for score < 0.4", () => {
    expect(confidenceLabel(0)).toBe("low");
    expect(confidenceLabel(0.39)).toBe("low");
  });
});

// ── Match status transitions ──────────────────────────────────────────────────

describe("isValidMatchTransition", () => {
  it("suggested → confirmed is valid", () => expect(isValidMatchTransition("suggested", "confirmed")).toBe(true));
  it("suggested → rejected is valid",  () => expect(isValidMatchTransition("suggested", "rejected")).toBe(true));
  it("suggested → unmatched is valid", () => expect(isValidMatchTransition("suggested", "unmatched")).toBe(true));
  it("confirmed → unmatched is valid", () => expect(isValidMatchTransition("confirmed", "unmatched")).toBe(true));
  it("confirmed → suggested is invalid", () => expect(isValidMatchTransition("confirmed", "suggested")).toBe(false));
  it("confirmed → rejected is invalid",  () => expect(isValidMatchTransition("confirmed", "rejected")).toBe(false));
  it("rejected → suggested is valid",  () => expect(isValidMatchTransition("rejected", "suggested")).toBe(true));
  it("unmatched → suggested is valid", () => expect(isValidMatchTransition("unmatched", "suggested")).toBe(true));
  it("unknown from-state returns false", () => expect(isValidMatchTransition("unknown", "confirmed")).toBe(false));
});

describe("allowedMatchTransitions", () => {
  it("suggested has 3 allowed transitions", () => {
    expect(allowedMatchTransitions("suggested")).toHaveLength(3);
  });

  it("confirmed has 1 allowed transition", () => {
    expect(allowedMatchTransitions("confirmed")).toHaveLength(1);
    expect(allowedMatchTransitions("confirmed")).toContain("unmatched");
  });

  it("unknown status returns empty array", () => {
    expect(allowedMatchTransitions("??")).toEqual([]);
  });
});

// ── STR readiness ─────────────────────────────────────────────────────────────

describe("calcStrReadinessScore", () => {
  it("returns 0 for null input", () => {
    expect(calcStrReadinessScore(null)).toBe(0);
  });

  it("returns 0 for empty record", () => {
    expect(calcStrReadinessScore({})).toBe(0);
  });

  it("gives 40 points for registered status", () => {
    const score = calcStrReadinessScore({ registration_status: "registered" });
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it("gives 20 points for pending registration", () => {
    const score = calcStrReadinessScore({ registration_status: "pending" });
    expect(score).toBe(20);
  });

  it("adds up to 40 points for fully confirmed safety checklist", () => {
    const checklist = {};
    STR_SAFETY_KEYS.forEach((k) => { checklist[k] = "confirmed"; });
    const score = calcStrReadinessScore({ registration_status: "not_started", safety_checklist: checklist });
    expect(score).toBe(40);
  });

  it("returns 100 for fully completed STR record", () => {
    const checklist = {};
    STR_SAFETY_KEYS.forEach((k) => { checklist[k] = "confirmed"; });
    const score = calcStrReadinessScore({
      registration_status: "registered",
      safety_checklist:    checklist,
      platform_refs:       [{ platform: "airbnb", is_active: true }],
    });
    expect(score).toBe(100);
  });

  it("counts not_applicable as resolved in safety checklist", () => {
    const checklist = {};
    STR_SAFETY_KEYS.forEach((k) => { checklist[k] = "not_applicable"; });
    const score = calcStrReadinessScore({ safety_checklist: checklist });
    expect(score).toBe(40);
  });

  it("caps at 100", () => {
    const checklist = {};
    STR_SAFETY_KEYS.forEach((k) => { checklist[k] = "confirmed"; });
    const score = calcStrReadinessScore({
      registration_status: "registered",
      safety_checklist:    checklist,
      platform_refs:       [{ platform: "airbnb", is_active: true }],
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("getStrMissingItems", () => {
  it("returns all 3 missing for null input", () => {
    expect(getStrMissingItems(null)).toHaveLength(3);
  });

  it("returns registration when not registered", () => {
    const missing = getStrMissingItems({ registration_status: "pending", safety_checklist: {}, platform_refs: [] });
    expect(missing).toContain("registration");
  });

  it("does not flag registration when status is registered", () => {
    const checklist = {};
    STR_SAFETY_KEYS.forEach((k) => { checklist[k] = "confirmed"; });
    const missing = getStrMissingItems({
      registration_status: "registered",
      safety_checklist: checklist,
      platform_refs: [{ platform: "airbnb" }],
    });
    expect(missing).not.toContain("registration");
  });

  it("returns platform_ref when no platform refs", () => {
    const missing = getStrMissingItems({ registration_status: "registered", safety_checklist: {}, platform_refs: [] });
    expect(missing).toContain("platform_ref");
  });
});

describe("STR_SAFETY_KEYS", () => {
  it("has 6 safety keys", () => {
    expect(STR_SAFETY_KEYS).toHaveLength(6);
  });

  it("includes fire_extinguisher and smoke_detector", () => {
    expect(STR_SAFETY_KEYS).toContain("fire_extinguisher");
    expect(STR_SAFETY_KEYS).toContain("smoke_detector");
  });
});

describe("STR_PLATFORMS", () => {
  it("includes airbnb and booking_com", () => {
    expect(STR_PLATFORMS).toContain("airbnb");
    expect(STR_PLATFORMS).toContain("booking_com");
  });
});

// ── Legal template status rules ───────────────────────────────────────────────

describe("isTemplateProductionReady", () => {
  it("returns true for reviewed + active", () => {
    expect(isTemplateProductionReady({ status: "reviewed", is_active: true })).toBe(true);
  });

  it("returns false for draft", () => {
    expect(isTemplateProductionReady({ status: "draft", is_active: true })).toBe(false);
  });

  it("returns false for requires_review", () => {
    expect(isTemplateProductionReady({ status: "requires_review", is_active: true })).toBe(false);
  });

  it("returns false for reviewed but inactive", () => {
    expect(isTemplateProductionReady({ status: "reviewed", is_active: false })).toBe(false);
  });

  it("returns false for retired", () => {
    expect(isTemplateProductionReady({ status: "retired", is_active: false })).toBe(false);
  });

  it("returns false for null input", () => {
    expect(isTemplateProductionReady(null)).toBe(false);
  });
});

describe("templateStatusLabel", () => {
  it("maps draft → draft",                   () => expect(templateStatusLabel("draft")).toBe("draft"));
  it("maps requires_review → requiresReview",() => expect(templateStatusLabel("requires_review")).toBe("requiresReview"));
  it("maps reviewed → reviewed",             () => expect(templateStatusLabel("reviewed")).toBe("reviewed"));
  it("maps retired → retired",               () => expect(templateStatusLabel("retired")).toBe("retired"));
  it("unknown → draft",                      () => expect(templateStatusLabel("??")).toBe("draft"));
});

describe("isTemplateDisabled", () => {
  it("draft is disabled",           () => expect(isTemplateDisabled({ status: "draft",           is_active: false })).toBe(true));
  it("requires_review is disabled", () => expect(isTemplateDisabled({ status: "requires_review", is_active: true })).toBe(true));
  it("reviewed+active is enabled",  () => expect(isTemplateDisabled({ status: "reviewed",        is_active: true })).toBe(false));
});

// ── Partner filtering ─────────────────────────────────────────────────────────

describe("filterPartners", () => {
  const partners = [
    { id: "1", partner_type: "notary",     service_area: "Warsaw",  is_active: true },
    { id: "2", partner_type: "accountant", service_area: "Kraków",  is_active: true },
    { id: "3", partner_type: "notary",     service_area: "Kraków",  is_active: true },
    { id: "4", partner_type: "solicitor",  service_area: "Gdańsk",  is_active: false },
  ];

  it("returns all active partners with no filters", () => {
    const result = filterPartners(partners);
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.is_active)).toBe(true);
  });

  it("filters by partner type", () => {
    const result = filterPartners(partners, { partnerType: "notary" });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.partner_type === "notary")).toBe(true);
  });

  it("filters by service area (case-insensitive)", () => {
    const result = filterPartners(partners, { serviceArea: "kraków" });
    expect(result).toHaveLength(2);
  });

  it("combines type and area filters", () => {
    const result = filterPartners(partners, { partnerType: "notary", serviceArea: "Kraków" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("excludes inactive partners", () => {
    const result = filterPartners(partners, { partnerType: "solicitor" });
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(filterPartners([])).toEqual([]);
  });

  it("returns empty for no matches", () => {
    expect(filterPartners(partners, { serviceArea: "nonexistent" })).toEqual([]);
  });
});

describe("PARTNER_TYPES", () => {
  it("has 4 types", () => expect(PARTNER_TYPES).toHaveLength(4));
  it("includes notary", () => expect(PARTNER_TYPES).toContain("notary"));
  it("includes solicitor", () => expect(PARTNER_TYPES).toContain("solicitor"));
  it("includes accountant", () => expect(PARTNER_TYPES).toContain("accountant"));
  it("includes property_manager", () => expect(PARTNER_TYPES).toContain("property_manager"));
});
