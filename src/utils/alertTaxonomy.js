const TAXONOMY = {
  maintenance_request_created: { category: "maintenance", severity: "action" },
  maintenance_status_changed: { category: "maintenance", severity: "info" },
  maintenance_request_in_progress: { category: "maintenance", severity: "info" },
  work_order_progress_updated: { category: "maintenance", severity: "info" },
  work_order_acknowledged: { category: "contractor", severity: "info" },
  work_order_blocked_follow_up: { category: "blocked_follow_up", severity: "urgent" },
  contractor_ack_overdue: { category: "contractor_ack_overdue", severity: "urgent" },
  overdue_rent: { category: "overdue_rent", severity: "urgent" },
  lease_expiring: { category: "lease_expiring", severity: "action" },
  compliance_due: { category: "compliance_due", severity: "action" },
  preventive_due: { category: "preventive_due", severity: "action" },
};

export function getAlertTaxonomy(type, metadata = {}) {
  const key = String(type || "").trim();
  const explicitCategory = String(metadata?.alert_category || "").trim();
  const explicitSeverity = String(metadata?.alert_severity || "").trim();
  const base = TAXONOMY[key] || {};
  return {
    category: explicitCategory || base.category || "general",
    severity: explicitSeverity || base.severity || "info",
  };
}
