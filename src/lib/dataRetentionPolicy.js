export const RETENTION_ACTIONS = Object.freeze({
  DELETE: "delete",
  ANONYMISE: "anonymise",
  RESTRICT: "restrict",
  RETAIN: "retain",
});

export const RETENTION_DECISIONS = Object.freeze({
  user_profile: {
    action: RETENTION_ACTIONS.ANONYMISE,
    reason: "Profile identifiers can usually be minimised while preserving account audit continuity.",
  },
  supabase_auth_user: {
    action: RETENTION_ACTIONS.DELETE,
    reason: "Auth identity deletion is scheduled after retention and security review.",
  },
  memberships: {
    action: RETENTION_ACTIONS.DELETE,
    reason: "Membership is an access grant and can be removed without destroying operational records.",
  },
  tenant_profiles: {
    action: RETENTION_ACTIONS.ANONYMISE,
    reason: "Tenant contact fields can be minimised while tenancy, finance, safety, and compliance records remain.",
  },
  contractor_profiles: {
    action: RETENTION_ACTIONS.ANONYMISE,
    reason: "Contractor contact fields can be minimised while work order and invoice history remains.",
  },
  property_records: {
    action: RETENTION_ACTIONS.RESTRICT,
    reason: "Property records are operational and may be required for tenancy, tax, safety, and legal obligations.",
  },
  finance_ledger: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Finance ledger records are retained for accounting, tax, fraud prevention, and dispute resolution.",
  },
  expected_charges: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Expected charges are retained for tenancy obligations, accounting, and disputes.",
  },
  invoices: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Invoices are retained for tax, accounting, contract, and dispute obligations.",
  },
  documents: {
    action: RETENTION_ACTIONS.RESTRICT,
    reason: "Documents may be deleted, restricted, or retained according to legal, compliance, and ownership review.",
  },
  maintenance_requests: {
    action: RETENTION_ACTIONS.ANONYMISE,
    reason: "Maintenance history is retained for safety and disputes while avoidable personal fields are minimised.",
  },
  work_orders: {
    action: RETENTION_ACTIONS.ANONYMISE,
    reason: "Work order history is retained for safety, warranty, invoicing, and dispute evidence.",
  },
  compliance_records: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Compliance records are retained for legal, safety, regulatory, and audit evidence.",
  },
  audit_security_logs: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Audit and security logs are retained for security integrity, fraud prevention, and legal defence.",
  },
  ai_usage_logs: {
    action: RETENTION_ACTIONS.RESTRICT,
    reason: "AI usage records are retained only as needed for cost controls, abuse prevention, and diagnostics.",
  },
  notifications: {
    action: RETENTION_ACTIONS.DELETE,
    reason: "User-facing notifications are transient and usually eligible for deletion.",
  },
  device_tokens: {
    action: RETENTION_ACTIONS.DELETE,
    reason: "Push/device tokens should be revoked and removed when no longer needed.",
  },
  billing_subscription_records: {
    action: RETENTION_ACTIONS.RETAIN,
    reason: "Billing records are retained for tax, accounting, contract, and fraud prevention.",
  },
});

export function getRetentionDecision(category) {
  return RETENTION_DECISIONS[category] || {
    action: RETENTION_ACTIONS.RESTRICT,
    reason: "Unknown categories require manual retention review before deletion.",
  };
}

export function canTransitionDeletionRequest(from, to) {
  const allowed = {
    submitted: ["identity_verification_required", "pending_admin_review", "pending_retention_review", "approved", "cancelled", "rejected"],
    identity_verification_required: ["pending_admin_review", "cancelled", "rejected"],
    pending_admin_review: ["pending_retention_review", "approved", "cancelled", "rejected"],
    pending_retention_review: ["approved", "scheduled", "partially_completed", "completed", "rejected"],
    approved: ["scheduled", "pending_retention_review", "completed", "partially_completed"],
    scheduled: ["pending_retention_review", "completed", "partially_completed", "cancelled"],
    completed: [],
    partially_completed: ["completed"],
    rejected: [],
    cancelled: [],
  };

  return Boolean(allowed[from]?.includes(to));
}
