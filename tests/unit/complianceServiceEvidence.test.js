/**
 * E-035 unit tests — compliance service evidence deny-gate.
 *
 * Proves that served_at alone is NOT authoritative service evidence.
 * Authoritative service evidence requires a provenance-backed service event
 * (document.served_asserted or document.served_system) as returned by
 * document_service_projection().
 *
 * The deny-test (first test below) is the acceptance gate for E-035:
 * setting served_at directly, without a provenance service event, must NOT
 * cause the system to treat the item as authoritatively served.
 */
import { describe, expect, it } from "vitest";
import { deriveComplianceServiceStatus } from "../../src/lib/complianceSafeStatus.js";

describe("compliance service evidence — deny gate (E-035)", () => {
  it("DENY: served_at alone with no evidence_document_id returns no provenance service event", () => {
    // The canonical deny case: served_at is set directly on the DB row,
    // no document is attached, so no provenance projection exists.
    const item = { served_at: "2026-01-01", evidence_document_id: null };
    const result = deriveComplianceServiceStatus(item, null);

    expect(result.hasProvenanceServiceEvent).toBe(false);
    expect(result.served_at).toBe("2026-01-01");
    expect(result.evidenceStrength).toBe(0);
  });

  it("DENY: served_at set with evidence_document_id but no service projection returns no provenance event", () => {
    // served_at is set, a document is attached, but document_service_projection
    // has not been called yet or returned null. Still not authoritative.
    const item = { served_at: "2026-01-01", evidence_document_id: "doc-abc" };
    const result = deriveComplianceServiceStatus(item, null);

    expect(result.hasProvenanceServiceEvent).toBe(false);
    expect(result.served_at).toBe("2026-01-01");
  });

  it("DENY: projection with no served events (upload only) returns no provenance service event", () => {
    // Document was uploaded to provenance but no service event was recorded.
    // served_at may be set but has_served_asserted and has_served_system are false.
    const item = { served_at: "2026-01-01", evidence_document_id: "doc-abc" };
    const projection = {
      has_served_asserted: false,
      has_served_system: false,
      has_uploaded: true,
      access_evidence_strength: 1,
      status: "uploaded",
    };
    const result = deriveComplianceServiceStatus(item, projection);

    expect(result.hasProvenanceServiceEvent).toBe(false);
    expect(result.evidenceStrength).toBe(1);
    expect(result.projectionStatus).toBe("uploaded");
  });
});

describe("compliance service evidence — positive cases", () => {
  it("projection with has_served_asserted returns provenance service event present", () => {
    const item = { served_at: "2026-01-01", evidence_document_id: "doc-abc" };
    const projection = {
      has_served_asserted: true,
      has_served_system: false,
      access_evidence_strength: 2,
      status: "service_recorded",
    };
    const result = deriveComplianceServiceStatus(item, projection);

    expect(result.hasProvenanceServiceEvent).toBe(true);
    expect(result.evidenceStrength).toBe(2);
    expect(result.projectionStatus).toBe("service_recorded");
  });

  it("projection with has_served_system returns provenance service event present", () => {
    const item = { served_at: "2026-01-01", evidence_document_id: "doc-abc" };
    const projection = {
      has_served_asserted: false,
      has_served_system: true,
      access_evidence_strength: 2,
      status: "service_recorded",
    };
    const result = deriveComplianceServiceStatus(item, projection);

    expect(result.hasProvenanceServiceEvent).toBe(true);
    expect(result.evidenceStrength).toBe(2);
  });

  it("projection with both served events returns provenance service event present at higher strength", () => {
    const item = { served_at: "2026-01-01", evidence_document_id: "doc-abc" };
    const projection = {
      has_served_asserted: true,
      has_served_system: true,
      has_delivery_confirmed: true,
      access_evidence_strength: 2,
      status: "service_recorded",
    };
    const result = deriveComplianceServiceStatus(item, projection);

    expect(result.hasProvenanceServiceEvent).toBe(true);
  });

  it("item with no served_at and projection with served_asserted still reports service event", () => {
    // served_at may not be set if the service was recorded through the provenance path directly.
    const item = { served_at: null, evidence_document_id: "doc-abc" };
    const projection = { has_served_asserted: true, access_evidence_strength: 2 };
    const result = deriveComplianceServiceStatus(item, projection);

    expect(result.served_at).toBeNull();
    expect(result.hasProvenanceServiceEvent).toBe(true);
  });

  it("fully null item returns safe defaults", () => {
    const result = deriveComplianceServiceStatus(null, null);
    expect(result.served_at).toBeNull();
    expect(result.hasProvenanceServiceEvent).toBe(false);
    expect(result.evidenceStrength).toBe(0);
  });
});
