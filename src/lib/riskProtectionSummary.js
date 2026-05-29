import { deriveComplianceItemStatus } from "../utils/complianceSafe";

function dateValue(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function propertyName(properties = [], propertyId) {
  const property = properties.find((entry) => String(entry.id) === String(propertyId));
  return property?.address || property?.name || "Property";
}

export function isPendingTenantEvidenceShare(share = {}) {
  return ["shared", "viewed"].includes(String(share.share_status || "").toLowerCase()) && !share.revoked_at;
}

export function isCompletedTenantEvidenceShare(share = {}) {
  return ["tenant_signed", "tenant_disputed"].includes(String(share.share_status || "").toLowerCase());
}

export function isPendingComplianceAcknowledgement(acknowledgement = {}) {
  return ["pending", "viewed"].includes(String(acknowledgement.acknowledgement_status || "").toLowerCase());
}

export function isCompletedComplianceAcknowledgement(acknowledgement = {}) {
  return ["acknowledged", "disputed"].includes(String(acknowledgement.acknowledgement_status || "").toLowerCase());
}

export function buildTenantPendingActions({ evidenceShares = [], complianceAcknowledgements = [], properties = [] } = {}) {
  const evidenceActions = evidenceShares.map((share) => {
    const report = share.inspection_reports || {};
    return {
      id: `evidence:${share.id}`,
      entityId: share.id,
      type: "evidence_report",
      typeLabel: "Evidence report",
      title: report.title || "Inspection report",
      property: propertyName(properties, report.property_id),
      dueDate: share.response_due_at || null,
      status: share.share_status || "shared",
      completed: isCompletedTenantEvidenceShare(share),
      pending: isPendingTenantEvidenceShare(share),
      cta: "Review report",
      path: `/tenant/evidence-reports/${share.id}`,
      updatedAt: share.responded_at || share.viewed_at || share.shared_at || share.created_at,
    };
  });

  const complianceActions = complianceAcknowledgements.map((ack) => {
    const item = ack.tenancy_compliance_items || {};
    const requirement = item.compliance_requirements || {};
    return {
      id: `compliance:${ack.id}`,
      entityId: ack.id,
      type: "compliance_document",
      typeLabel: "Compliance document",
      title: requirement.label || "Compliance document",
      property: propertyName(properties, item.property_id),
      dueDate: item.due_date || null,
      status: ack.acknowledgement_status || "pending",
      completed: isCompletedComplianceAcknowledgement(ack),
      pending: isPendingComplianceAcknowledgement(ack),
      cta: "Acknowledge document",
      path: `/tenant/compliance-documents/${ack.id}`,
      updatedAt: ack.acknowledged_at || ack.updated_at || ack.created_at,
    };
  });

  const actions = [...evidenceActions, ...complianceActions]
    .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));

  return {
    pending: actions.filter((action) => action.pending),
    completed: actions.filter((action) => action.completed),
    all: actions,
  };
}

export function getRiskProtectionSummary({
  complianceItems = [],
  evidenceReports = [],
  evidenceShares = [],
  disputePacks = [],
  currentDate,
} = {}) {
  const derivedComplianceStatuses = complianceItems.map((item) => deriveComplianceItemStatus(item, currentDate));

  return {
    missingComplianceItems: derivedComplianceStatuses.filter((status) => ["missing", "expired", "needs_review"].includes(status)).length,
    expiringComplianceItems: derivedComplianceStatuses.filter((status) => status === "expiring_soon").length,
    pendingTenantAcknowledgements: complianceItems.reduce(
      (total, item) => total + (item.compliance_item_acknowledgements || []).filter(isPendingComplianceAcknowledgement).length,
      0,
    ),
    lockedEvidenceReports: evidenceReports.filter((report) => String(report.status || "") === "locked").length,
    pendingTenantEvidenceSignatures: evidenceShares.filter(isPendingTenantEvidenceShare).length,
    draftDisputePacks: disputePacks.filter((pack) => String(pack.status || "") === "draft").length,
  };
}
