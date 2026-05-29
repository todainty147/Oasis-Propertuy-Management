import { describe, expect, it } from "vitest";

import {
  buildTenantPendingActions,
  getRiskProtectionSummary,
  isCompletedComplianceAcknowledgement,
  isCompletedTenantEvidenceShare,
  isPendingComplianceAcknowledgement,
  isPendingTenantEvidenceShare,
} from "../../src/lib/riskProtectionSummary";
import {
  getRiskProtectionBadgeProps,
  getStatusLabel,
  getStatusTone,
  normaliseRiskProtectionStatus,
} from "../../src/lib/riskProtectionStatus";

describe("risk protection status helpers", () => {
  it("normalises labels and tones for shared suite statuses", () => {
    expect(normaliseRiskProtectionStatus(" Needs_Review ")).toBe("needs_review");
    expect(normaliseRiskProtectionStatus(null)).toBe("unknown");
    expect(getStatusLabel("tenant_signed")).toBe("Signed");
    expect(getStatusTone("expired")).toBe("critical");
    expect(getStatusTone("pending")).toBe("warning");
    expect(getStatusTone(null)).toBe("neutral");
    expect(getStatusTone("acknowledged")).toBe("success");
    expect(getRiskProtectionBadgeProps("revoked")).toEqual(expect.objectContaining({
      label: "Revoked",
      tone: "muted",
    }));
  });

  it("aggregates tenant pending actions without exposing landlord-only records", () => {
    const properties = [{ id: "p1", address: "12 Test Street" }];
    const result = buildTenantPendingActions({
      properties,
      evidenceShares: [
        {
          id: "s1",
          share_status: "shared",
          shared_at: "2026-05-01T10:00:00Z",
          inspection_reports: { title: "Check-in", property_id: "p1" },
        },
        {
          id: "s2",
          share_status: "tenant_signed",
          responded_at: "2026-05-02T10:00:00Z",
          inspection_reports: { title: "Check-out", property_id: "p1" },
        },
      ],
      complianceAcknowledgements: [
        {
          id: "a1",
          acknowledgement_status: "pending",
          created_at: "2026-05-03T10:00:00Z",
          tenancy_compliance_items: {
            property_id: "p1",
            compliance_requirements: { label: "Gas safety certificate" },
          },
        },
      ],
    });

    expect(result.pending.map((action) => action.path)).toEqual([
      "/tenant/compliance-documents/a1",
      "/tenant/evidence-reports/s1",
    ]);
    expect(result.completed.map((action) => action.path)).toEqual(["/tenant/evidence-reports/s2"]);
  });

  it("summarises landlord risk protection signals", () => {
    expect(getRiskProtectionSummary({
      complianceItems: [
        { status: "missing", compliance_item_acknowledgements: [] },
        { status: "logged", expires_at: "2026-01-01", compliance_item_acknowledgements: [] },
        { status: "logged", expires_at: "2026-06-15", reminder_days_before: 30, compliance_item_acknowledgements: [{ acknowledgement_status: "pending" }] },
      ],
      evidenceReports: [{ status: "locked" }],
      evidenceShares: [{ share_status: "viewed" }],
      disputePacks: [{ status: "draft" }],
      currentDate: "2026-05-29",
    })).toEqual({
      missingComplianceItems: 2,
      expiringComplianceItems: 1,
      pendingTenantAcknowledgements: 1,
      lockedEvidenceReports: 1,
      pendingTenantEvidenceSignatures: 1,
      draftDisputePacks: 1,
    });
  });

  it("classifies tenant action predicates directly", () => {
    expect(isPendingTenantEvidenceShare({ share_status: "shared" })).toBe(true);
    expect(isPendingTenantEvidenceShare({ share_status: "shared", revoked_at: "2026-05-01T10:00:00Z" })).toBe(false);
    expect(isCompletedTenantEvidenceShare({ share_status: "tenant_disputed" })).toBe(true);
    expect(isPendingComplianceAcknowledgement({ acknowledgement_status: "viewed" })).toBe(true);
    expect(isPendingComplianceAcknowledgement({ acknowledgement_status: "revoked" })).toBe(false);
    expect(isCompletedComplianceAcknowledgement({ acknowledgement_status: "acknowledged" })).toBe(true);
  });
});
