import { describe, expect, it } from "vitest";

import { scoreRentalApplication } from "../../src/lib/applicantScoring.js";
import {
  calculateComplianceRating,
  deriveComplianceSafeStatus,
  isExpiringSoon,
  normalizeComplianceStatus,
} from "../../src/utils/complianceSafe.js";

describe("Phase 3 legal security utilities", () => {
  it("calculates compliance rating without counting not-applicable items against the score", () => {
    const today = new Date("2026-05-28T00:00:00Z");
    const result = calculateComplianceRating([
      { status: "logged" },
      { status: "acknowledged" },
      { status: "missing" },
      { status: "not_applicable" },
    ], today);

    expect(result.total).toBe(3);
    expect(result.complete).toBe(2);
    expect(result.rating).toBe(67);
    expect(result.counts.not_applicable).toBe(1);
  });

  it("derives expiring and expired statuses from expiry dates", () => {
    const today = new Date("2026-05-28T00:00:00Z");

    expect(deriveComplianceSafeStatus({ status: "logged", expires_at: "2026-06-20" }, today)).toBe("expiring_soon");
    expect(deriveComplianceSafeStatus({ status: "logged", expires_at: "2026-05-01" }, today)).toBe("expired");
  });

  it("uses item reminder windows and normalises legacy evidence statuses", () => {
    const today = new Date("2026-05-28T00:00:00Z");

    expect(normalizeComplianceStatus("evidence_logged")).toBe("logged");
    expect(isExpiringSoon({ expires_at: "2026-07-01", reminder_days_before: 45 }, today)).toBe(true);
    expect(deriveComplianceSafeStatus({ status: "acknowledged", expires_at: "2026-07-01", reminder_days_before: 10 }, today)).toBe("acknowledged");
  });

  it("counts expiring soon as complete with a warning", () => {
    const today = new Date("2026-05-28T00:00:00Z");
    const result = calculateComplianceRating([
      { status: "logged", expires_at: "2026-06-02" },
      { status: "expired", expires_at: "2026-04-01" },
      { status: "needs_review" },
      { status: "not_applicable" },
    ], today);

    expect(result.complete).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.incomplete).toBe(2);
    expect(result.rating).toBe(33);
  });

  it("scores rental applications using transparent non-protected preference signals", () => {
    const result = scoreRentalApplication({
      applicant_name: "Alex Tenant",
      applicant_email: "alex@example.com",
      preferred_move_in_date: "2026-07-01",
      occupants_count: 2,
      employment_status: "employed",
      estimated_income_band: "45k_60k",
      guarantor_available: true,
      pets_status: "no_pets",
      smoking_status: "non_smoker",
      message: "We are looking for a long-term home and can provide references promptly.",
    }, {
      availableFrom: "2026-07-10",
      monthlyRent: 1200,
      guarantorPreferred: true,
      petsAllowed: false,
      smokingAllowed: false,
    });

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons.join(" ")).toMatch(/Application completeness|Move-in date|Income band/i);
  });
});
