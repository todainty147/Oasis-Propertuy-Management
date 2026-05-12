// src/utils/plAdvancedUtils.js
//
// Pure utility functions for Poland Advanced Market Features.
// No I/O, no side-effects — safe to import in tests without mocking.

import { ENTITLEMENT_FEATURES } from "../lib/entitlements";

// ---------------------------------------------------------------------------
// Feature flag helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the account's plan entitlements include Open Banking readiness.
 */
export function hasRentMatchFeature(features) {
  const f = Array.isArray(features) ? features : [];
  return f.includes(ENTITLEMENT_FEATURES.PL_OPEN_BANKING_READINESS);
}

export function hasStrComplianceFeature(features) {
  const f = Array.isArray(features) ? features : [];
  return f.includes(ENTITLEMENT_FEATURES.PL_STR_COMPLIANCE);
}

export function hasTemplateLibraryFeature(features) {
  const f = Array.isArray(features) ? features : [];
  return f.includes(ENTITLEMENT_FEATURES.PL_TEMPLATE_LIBRARY);
}

export function hasPartnerDirectoryFeature(features) {
  const f = Array.isArray(features) ? features : [];
  return f.includes(ENTITLEMENT_FEATURES.PL_PARTNER_DIRECTORY);
}

/**
 * Returns true if the account has at least one advanced Poland feature.
 * Used to decide whether to show the "Poland Advanced" navigation entry.
 */
export function hasAnyPlAdvancedFeature(features) {
  const f = Array.isArray(features) ? features : [];
  return (
    hasRentMatchFeature(f) ||
    hasStrComplianceFeature(f) ||
    hasTemplateLibraryFeature(f) ||
    hasPartnerDirectoryFeature(f)
  );
}

// ---------------------------------------------------------------------------
// Rent match confidence
// ---------------------------------------------------------------------------

/**
 * Calculates a confidence score (0.0–1.0) for a proposed rent match.
 * Pure calculation — does NOT write to any ledger or payment record.
 *
 * Scoring:
 *   - Amount exact match:          +0.5
 *   - Amount within 1%:            +0.3
 *   - Amount within 5%:            +0.2
 *   - Amount mismatch >5%:         +0.0
 *   - Received within period:      +0.3
 *   - Received within ±7 days:     +0.2
 *   - Received outside 7 days:     +0.0
 *   - Reference keyword match:     +0.2 (bonus, capped at 1.0)
 */
export function calcRentMatchConfidence({
  expectedAmount,
  candidateAmount,
  expectedPeriodStart,
  expectedPeriodEnd,
  candidateReceivedAt,
  candidateReference = "",
  expectedReference  = "",
}) {
  if (!expectedAmount || !candidateAmount) return 0;

  const expected = Number(expectedAmount);
  const received = Number(candidateAmount);
  if (expected <= 0 || received <= 0) return 0;

  let score = 0;

  // Amount component
  const amountDiff = Math.abs(expected - received) / expected;
  if (amountDiff === 0)          score += 0.5;
  else if (amountDiff <= 0.01)   score += 0.3;
  else if (amountDiff <= 0.05)   score += 0.2;
  // >5% mismatch: no amount contribution

  // Timing component
  if (expectedPeriodStart && expectedPeriodEnd && candidateReceivedAt) {
    const start    = new Date(String(expectedPeriodStart)).getTime();
    const end      = new Date(String(expectedPeriodEnd)).getTime();
    const received_ts = new Date(String(candidateReceivedAt)).getTime();
    const sevenDays   = 7 * 24 * 60 * 60 * 1000;

    if (received_ts >= start && received_ts <= end) {
      score += 0.3;
    } else if (
      received_ts >= start - sevenDays &&
      received_ts <= end   + sevenDays
    ) {
      score += 0.2;
    }
  }

  // Reference keyword match bonus
  if (candidateReference && expectedReference) {
    const ref  = String(candidateReference).toLowerCase();
    const exp  = String(expectedReference).toLowerCase().split(/\s+/).filter(Boolean);
    const hits = exp.filter((word) => word.length > 2 && ref.includes(word));
    if (hits.length > 0) score += 0.2;
  }

  return Math.min(1, Math.round(score * 1000) / 1000);
}

/**
 * Maps a confidence score to a label key.
 */
export function confidenceLabel(score) {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Match status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS = Object.freeze({
  suggested: ["confirmed", "rejected", "unmatched"],
  confirmed: ["unmatched"],
  rejected:  ["suggested"],   // allow re-opening
  unmatched: ["suggested"],
});

/**
 * Returns true if transitioning from `from` → `to` is allowed.
 */
export function isValidMatchTransition(from, to) {
  return Boolean(VALID_TRANSITIONS[from]?.includes(to));
}

/**
 * Returns the allowed next statuses for a given current status.
 */
export function allowedMatchTransitions(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] || [];
}

// ---------------------------------------------------------------------------
// STR readiness
// ---------------------------------------------------------------------------

export const STR_SAFETY_KEYS = Object.freeze([
  "fire_extinguisher",
  "smoke_detector",
  "co_detector",
  "first_aid_kit",
  "emergency_exits",
  "property_insurance",
]);

export const STR_PLATFORMS = Object.freeze([
  "airbnb", "booking_com", "vrbo", "other",
]);

/**
 * Calculates STR compliance readiness score (0–100).
 * Registration + safety checklist + has platform reference.
 */
export function calcStrReadinessScore(strProperty) {
  if (!strProperty) return 0;

  let score = 0;

  // Registration (up to 40 points)
  if (strProperty.registration_status === "registered") score += 40;
  else if (strProperty.registration_status === "pending")  score += 20;

  // Safety checklist (up to 40 points)
  const checklist = strProperty.safety_checklist || {};
  const confirmed = STR_SAFETY_KEYS.filter((k) => checklist[k] === "confirmed").length;
  const notApplicable = STR_SAFETY_KEYS.filter((k) => checklist[k] === "not_applicable").length;
  const resolved = confirmed + notApplicable;
  score += Math.round((resolved / STR_SAFETY_KEYS.length) * 40);

  // Platform reference (up to 20 points)
  const platformRefs = strProperty.platform_refs || [];
  if (Array.isArray(platformRefs) && platformRefs.some((r) => r.is_active !== false)) {
    score += 20;
  }

  return Math.min(100, score);
}

/**
 * Returns an array of missing or incomplete STR requirements.
 */
export function getStrMissingItems(strProperty) {
  if (!strProperty) return ["registration", "safety_checklist", "platform_ref"];
  const missing = [];

  if (strProperty.registration_status !== "registered") {
    missing.push("registration");
  }

  const checklist = strProperty.safety_checklist || {};
  const incomplete = STR_SAFETY_KEYS.filter(
    (k) => !checklist[k] || checklist[k] === "pending",
  );
  if (incomplete.length > 0) missing.push("safety_checklist");

  const refs = strProperty.platform_refs || [];
  if (!Array.isArray(refs) || refs.length === 0) missing.push("platform_ref");

  return missing;
}

// ---------------------------------------------------------------------------
// Legal template status rules
// ---------------------------------------------------------------------------

/**
 * Returns true if a template is safe to show in production UI.
 * RULE: must be reviewed AND active. Draft/requires_review are never production-ready.
 */
export function isTemplateProductionReady(template) {
  return template?.status === "reviewed" && template?.is_active === true;
}

/**
 * Returns a status label key for display.
 */
export function templateStatusLabel(status) {
  const MAP = {
    draft:           "draft",
    requires_review: "requiresReview",
    reviewed:        "reviewed",
    retired:         "retired",
  };
  return MAP[status] || "draft";
}

/**
 * Returns true if a template should be shown as disabled (not usable as final).
 */
export function isTemplateDisabled(template) {
  return !isTemplateProductionReady(template);
}

// ---------------------------------------------------------------------------
// Partner directory filtering
// ---------------------------------------------------------------------------

export const PARTNER_TYPES = Object.freeze([
  "notary", "solicitor", "accountant", "property_manager",
]);

/**
 * Filters a partner list by type and/or service area.
 * Case-insensitive service area search.
 */
export function filterPartners(partners = [], { partnerType, serviceArea } = {}) {
  return partners.filter((p) => {
    if (partnerType && p.partner_type !== partnerType) return false;
    if (serviceArea) {
      const haystack = String(p.service_area || "").toLowerCase();
      const needle   = String(serviceArea).toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return p.is_active !== false;
  });
}
