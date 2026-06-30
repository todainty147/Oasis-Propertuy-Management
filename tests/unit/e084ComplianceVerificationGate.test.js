import { describe, expect, it } from "vitest";
import { deriveComplianceItemStatus } from "../../src/lib/complianceSafeStatus.js";

const TODAY = new Date("2026-06-30T12:00:00Z");
const FUTURE = "2026-12-31";  // > 30 days out — would be 'logged' without expiry logic
const NEAR   = "2026-07-10";  // < 30 days — would be 'expiring_soon' without gate
const PAST   = "2026-01-01";  // already expired

const OCR_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("E-084 OCR false-compliance gate", () => {
  // ── Deny-tests: OCR-sourced + unverified → needs_review ─────────────────────

  it("OCR-sourced + unverified + logged → needs_review (deny)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
      expires_at: null,
    }, TODAY)).toBe("needs_review");
  });

  it("OCR-sourced + unverified + acknowledged → needs_review (deny)", () => {
    expect(deriveComplianceItemStatus({
      status: "acknowledged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
      expires_at: null,
    }, TODAY)).toBe("needs_review");
  });

  it("OCR-sourced + unverified + near expiry → needs_review not expiring_soon (deny)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
      expires_at: NEAR,
      reminder_days_before: 30,
    }, TODAY)).toBe("needs_review");
  });

  // ── Positive: human_verified_at set → gate lifted ───────────────────────────

  it("OCR-sourced + verified + near expiry → expiring_soon (gate lifted)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: "2026-06-30T10:00:00Z",
      expires_at: NEAR,
      reminder_days_before: 30,
    }, TODAY)).toBe("expiring_soon");
  });

  it("OCR-sourced + verified + distant expiry → logged (gate lifted)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: "2026-06-30T10:00:00Z",
      expires_at: FUTURE,
    }, TODAY)).toBe("logged");
  });

  // ── Inverse: no ocr_source_extraction_id → existing behaviour unchanged ─────

  it("manually-entered logged item → logged (no gate applied)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: null,
      human_verified_at: null,
      expires_at: null,
    }, TODAY)).toBe("logged");
  });

  it("manually-entered + near expiry → expiring_soon (no gate applied)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: null,
      human_verified_at: null,
      expires_at: NEAR,
      reminder_days_before: 30,
    }, TODAY)).toBe("expiring_soon");
  });

  it("manually-entered acknowledged → acknowledged (no gate applied)", () => {
    expect(deriveComplianceItemStatus({
      status: "acknowledged",
      ocr_source_extraction_id: null,
      human_verified_at: null,
      expires_at: null,
    }, TODAY)).toBe("acknowledged");
  });

  // ── Boundary: expired is never gated (safe-fail for OCR-read past dates) ────

  it("OCR-sourced + unverified + past expiry → expired not needs_review (safe-fail boundary)", () => {
    expect(deriveComplianceItemStatus({
      status: "logged",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
      expires_at: PAST,
    }, TODAY)).toBe("expired");
  });

  // ── Edge cases: statuses outside the gate set ────────────────────────────────

  it("OCR-sourced + not_applicable → not_applicable (gate not applied)", () => {
    expect(deriveComplianceItemStatus({
      status: "not_applicable",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
    }, TODAY)).toBe("not_applicable");
  });

  it("OCR-sourced + stored status=needs_review → needs_review (short-circuits before gate)", () => {
    expect(deriveComplianceItemStatus({
      status: "needs_review",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
    }, TODAY)).toBe("needs_review");
  });

  it("OCR-sourced + missing → missing (gate only covers trusted-compliant statuses)", () => {
    expect(deriveComplianceItemStatus({
      status: "missing",
      ocr_source_extraction_id: OCR_ID,
      human_verified_at: null,
    }, TODAY)).toBe("missing");
  });
});
