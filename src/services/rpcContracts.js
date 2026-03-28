/**
 * Lightweight runtime contracts for the highest-value RPC surfaces.
 *
 * This keeps the current JavaScript codebase simple while still making
 * backend/frontend drift fail in a predictable place: the service boundary.
 */

export class RpcContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "RpcContractError";
  }
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value, label) {
  if (!isRecord(value)) {
    throw new RpcContractError(`${label} must be an object`);
  }
  return value;
}

function toStringOr(value, fallback = "") {
  if (value == null) return fallback;
  return String(value);
}

function toNullableString(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function toNumberOr(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toBooleanOr(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

function toObjectOr(value, fallback = {}) {
  if (!value) return fallback;
  return isRecord(value) ? value : fallback;
}

function toArrayOr(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function toNumericObject(value, fallback = {}) {
  const record = toObjectOr(value, fallback);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, toNumberOr(entry)]),
  );
}

export function firstRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export const EMPTY_DASHBOARD_SNAPSHOT = {
  property_count: 0,
  occupied_count: 0,
  vacant_count: 0,
  occupancy_rate: 0,
  tenant_paid_total: 0,
  tenant_due_total: 0,
  tenant_overdue_total: 0,
  tenant_due_overdue_count: 0,
  overdue_amount: 0,
  due_soon_count: 0,
  due_soon_amount: 0,
  overdue_current_window_amount: 0,
  overdue_previous_window_amount: 0,
  open_requests: 0,
  open_high_priority: 0,
  waiting_over_48h: 0,
  unassigned_work_orders: 0,
};

export function parseDashboardSnapshotRow(row) {
  if (!row) return { ...EMPTY_DASHBOARD_SNAPSHOT };
  const value = assertRecord(row, "dashboard_snapshot row");
  return {
    property_count: toNumberOr(value.property_count),
    occupied_count: toNumberOr(value.occupied_count),
    vacant_count: toNumberOr(value.vacant_count),
    occupancy_rate: toNumberOr(value.occupancy_rate),
    tenant_paid_total: toNumberOr(value.tenant_paid_total),
    tenant_due_total: toNumberOr(value.tenant_due_total),
    tenant_overdue_total: toNumberOr(value.tenant_overdue_total),
    tenant_due_overdue_count: toNumberOr(value.tenant_due_overdue_count),
    overdue_amount: toNumberOr(value.overdue_amount),
    due_soon_count: toNumberOr(value.due_soon_count),
    due_soon_amount: toNumberOr(value.due_soon_amount),
    overdue_current_window_amount: toNumberOr(value.overdue_current_window_amount),
    overdue_previous_window_amount: toNumberOr(value.overdue_previous_window_amount),
    open_requests: toNumberOr(value.open_requests),
    open_high_priority: toNumberOr(value.open_high_priority),
    waiting_over_48h: toNumberOr(value.waiting_over_48h),
    unassigned_work_orders: toNumberOr(value.unassigned_work_orders),
  };
}

export function parseDashboardHubExtraRow(row) {
  const value = assertRecord(row, "dashboard_hub_extras row");
  return {
    item_key: toStringOr(value.item_key),
    item_type: toStringOr(value.item_type),
    count_value: toNumberOr(value.count_value),
    property_label: toStringOr(value.property_label),
    city: toStringOr(value.city),
    days_vacant: toNullableNumber(value.days_vacant),
    link_path: toStringOr(value.link_path),
    sort_order: toNumberOr(value.sort_order),
  };
}

function parsePropertyFinanceRow(row) {
  const value = assertRecord(row, "finance_snapshot.property_finance row");
  return {
    propertyId: toNullableString(value.property_id ?? value.propertyId),
    address: toStringOr(value.address),
    city: toStringOr(value.city),
    rent: toNumberOr(value.rent),
    paid: toNumberOr(value.paid),
    remaining: toNumberOr(value.remaining),
    paymentStatus: toStringOr(value.payment_status ?? value.paymentStatus),
  };
}

export const EMPTY_FINANCE_SNAPSHOT = {
  total_income: 0,
  overdue_income: 0,
  due_soon_income: 0,
  outstanding_income: 0,
  property_finance: [],
};

export function parseFinanceSnapshotRow(row) {
  if (!row) return { ...EMPTY_FINANCE_SNAPSHOT };
  const value = assertRecord(row, "finance_snapshot row");
  return {
    total_income: toNumberOr(value.total_income),
    overdue_income: toNumberOr(value.overdue_income),
    due_soon_income: toNumberOr(value.due_soon_income),
    outstanding_income: toNumberOr(value.outstanding_income),
    property_finance: toArrayOr(value.property_finance).map(parsePropertyFinanceRow),
  };
}

export const EMPTY_PORTFOLIO_HEALTH_SNAPSHOT = {
  property_count: 0,
  occupied_count: 0,
  vacant_count: 0,
  occupancy_rate: 0,
  paid_amount: 0,
  due_amount: 0,
  overdue_amount: 0,
  due_soon_amount: 0,
  outstanding_amount: 0,
  overdue_0_7_amount: 0,
  overdue_8_30_amount: 0,
  overdue_30_plus_amount: 0,
  open_requests: 0,
  high_priority_open_requests: 0,
  waiting_over_48h: 0,
  active_work_orders: 0,
  work_orders_without_contractor: 0,
  contractor_ack_overdue: 0,
  stalled_repairs: 0,
  long_running_repairs: 0,
  repeat_repair_properties: 0,
  recent_open_created: 0,
  prev_open_created: 0,
  outstanding_current_month: 0,
  outstanding_previous_month: 0,
};

export const EMPTY_WEEKLY_PORTFOLIO_SUMMARY = {
  occupancy_rate: 0,
  open_requests: 0,
  waiting_over_48h: 0,
  overdue_balance: 0,
};

export const EMPTY_MAINTENANCE_KPI_SNAPSHOT = {
  open_requests: 0,
  active_work_orders: 0,
  awaiting_action: 0,
  resolved_pending_closure: 0,
  open_high_priority: 0,
  triage_over_24h: 0,
  contractor_ack_overdue: 0,
  stalled_repairs: 0,
  long_running_repairs: 0,
  repeat_repair_properties: 0,
  req_by_status: {
    open: 0,
    in_progress: 0,
    waiting: 0,
    resolved: 0,
    closed: 0,
  },
  wo_by_status: {
    assigned: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  },
  aging: {
    b0_24: 0,
    b24_48: 0,
    b48_72: 0,
    b72_plus: 0,
  },
};

export function parsePortfolioHealthSnapshotRow(row) {
  if (!row) return { ...EMPTY_PORTFOLIO_HEALTH_SNAPSHOT };
  const value = assertRecord(row, "portfolio_health_snapshot row");
  return {
    property_count: toNumberOr(value.property_count),
    occupied_count: toNumberOr(value.occupied_count),
    vacant_count: toNumberOr(value.vacant_count),
    occupancy_rate: toNumberOr(value.occupancy_rate),
    paid_amount: toNumberOr(value.paid_amount),
    due_amount: toNumberOr(value.due_amount),
    overdue_amount: toNumberOr(value.overdue_amount),
    due_soon_amount: toNumberOr(value.due_soon_amount),
    outstanding_amount: toNumberOr(value.outstanding_amount),
    overdue_0_7_amount: toNumberOr(value.overdue_0_7_amount),
    overdue_8_30_amount: toNumberOr(value.overdue_8_30_amount),
    overdue_30_plus_amount: toNumberOr(value.overdue_30_plus_amount),
    open_requests: toNumberOr(value.open_requests),
    high_priority_open_requests: toNumberOr(value.high_priority_open_requests),
    waiting_over_48h: toNumberOr(value.waiting_over_48h),
    active_work_orders: toNumberOr(value.active_work_orders),
    work_orders_without_contractor: toNumberOr(value.work_orders_without_contractor),
    contractor_ack_overdue: toNumberOr(value.contractor_ack_overdue),
    stalled_repairs: toNumberOr(value.stalled_repairs),
    long_running_repairs: toNumberOr(value.long_running_repairs),
    repeat_repair_properties: toNumberOr(value.repeat_repair_properties),
    recent_open_created: toNumberOr(value.recent_open_created),
    prev_open_created: toNumberOr(value.prev_open_created),
    outstanding_current_month: toNumberOr(value.outstanding_current_month),
    outstanding_previous_month: toNumberOr(value.outstanding_previous_month),
  };
}

export function parseWeeklyPortfolioSummaryRow(row) {
  if (!row) return { ...EMPTY_WEEKLY_PORTFOLIO_SUMMARY };
  const value = assertRecord(row, "portfolio_weekly_summary row");
  return {
    occupancy_rate: toNumberOr(value.occupancy_rate),
    open_requests: toNumberOr(value.open_requests),
    waiting_over_48h: toNumberOr(value.waiting_over_48h),
    overdue_balance: toNumberOr(value.overdue_balance),
  };
}

export function parseInvitationRow(row) {
  const value = assertRecord(row, "invitation row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    account_name: toStringOr(value.account_name),
    email: toStringOr(value.email).trim().toLowerCase(),
    role: toStringOr(value.role).trim().toLowerCase(),
    token: toStringOr(value.token),
    invited_by: toNullableString(value.invited_by),
    created_at: toNullableString(value.created_at),
    accepted_at: toNullableString(value.accepted_at),
    revoked_at: toNullableString(value.revoked_at),
  };
}

export function parseInvitationEligibilityRow(row) {
  const value = assertRecord(row, "invitation eligibility row");
  return {
    ok: toBooleanOr(value.ok),
    code: toStringOr(value.code),
    message: toStringOr(value.message),
  };
}

export function parseAcceptAccountInviteResult(row) {
  const value = assertRecord(row, "accept account invite result");
  return {
    account_id: toNullableString(value.account_id),
    role: toStringOr(value.role).trim().toLowerCase(),
    membership_created: toBooleanOr(value.membership_created, true),
  };
}

export function parseRootAccountRow(row) {
  const value = assertRecord(row, "root account row");
  return {
    id: toNullableString(value.id),
    name: toStringOr(value.name),
    is_root: toBooleanOr(value.is_root),
    is_disabled: toBooleanOr(value.is_disabled),
    disabled_at: toNullableString(value.disabled_at),
    created_at: toNullableString(value.created_at),
  };
}

export function parseRootAccountMutationRow(row) {
  const value = assertRecord(row, "root account mutation row");
  return {
    ok: toBooleanOr(value.ok),
    account_id: toNullableString(value.account_id),
    is_disabled: value.is_disabled == null ? null : toBooleanOr(value.is_disabled),
  };
}

export function parseAccountMemberRoleResult(row) {
  const value = assertRecord(row, "account member role result");
  return {
    ok: toBooleanOr(value.ok),
    account_id: toNullableString(value.account_id),
    user_id: toNullableString(value.user_id),
    old_role: toStringOr(value.old_role).trim().toLowerCase(),
    role: toStringOr(value.role).trim().toLowerCase(),
    changed: toBooleanOr(value.changed),
  };
}

export function parseSelfServeLandlordAccountResult(row) {
  const value = assertRecord(row, "self-serve landlord account result");
  return {
    ok: toBooleanOr(value.ok),
    created: toBooleanOr(value.created),
    account_id: toNullableString(value.account_id),
    account_name: toStringOr(value.account_name),
    role: toStringOr(value.role).trim().toLowerCase(),
  };
}

export function parsePaymentRow(row) {
  const value = assertRecord(row, "payment row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    tenant_id: toNullableString(value.tenant_id),
    owner_id: toNullableString(value.owner_id),
    amount: toNumberOr(value.amount),
    due_date: toNullableString(value.due_date),
    paid_at: toNullableString(value.paid_at),
    created_at: toNullableString(value.created_at),
    status: toStringOr(value.status).trim().toLowerCase(),
  };
}

export function parseMaintenanceRequestRow(row) {
  const value = assertRecord(row, "maintenance request row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    reported_by_tenant_id: toNullableString(value.reported_by_tenant_id),
    title: toStringOr(value.title),
    description: toStringOr(value.description),
    priority: toStringOr(value.priority).trim().toLowerCase(),
    status: toStringOr(value.status).trim().toLowerCase(),
    waiting_reason: toNullableString(value.waiting_reason),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parsePropertyLabelRow(row) {
  const value = assertRecord(row, "property label row");
  return {
    id: toNullableString(value.id),
    address: toStringOr(value.address),
    city: toStringOr(value.city),
  };
}

export function parseContractorDirectoryRow(row) {
  const value = assertRecord(row, "contractor directory row");
  return {
    id: toNullableString(value.id),
    name: toStringOr(value.name),
    phone: toStringOr(value.phone),
    email: toStringOr(value.email),
    active: toBooleanOr(value.active, true),
    user_id: toNullableString(value.user_id),
  };
}

export function parseWorkOrderRow(row) {
  const value = assertRecord(row, "work order row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    maintenance_request_id: toNullableString(value.maintenance_request_id),
    contractor_user_id: toNullableString(value.contractor_user_id),
    contractor_name: toStringOr(value.contractor_name),
    contractor_phone: toStringOr(value.contractor_phone),
    status: toStringOr(value.status).trim().toLowerCase(),
    scheduled_at: toNullableString(value.scheduled_at),
    notes: toStringOr(value.notes),
    quote_amount: toNullableNumber(value.quote_amount),
    invoice_amount: toNullableNumber(value.invoice_amount),
    created_by: toNullableString(value.created_by),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
    pending_cancel_request: toBooleanOr(value.pending_cancel_request),
    last_cancel_request_at: toNullableString(value.last_cancel_request_at),
    last_cancel_request_by: toNullableString(value.last_cancel_request_by),
    last_cancel_resolution_at: toNullableString(value.last_cancel_resolution_at),
    last_cancel_resolution_action: toStringOr(value.last_cancel_resolution_action),
    last_cancel_resolution_by: toNullableString(value.last_cancel_resolution_by),
    assigned_at: toNullableString(value.assigned_at),
    acknowledged_at: toNullableString(value.acknowledged_at),
    acknowledgement_due_at: toNullableString(value.acknowledgement_due_at),
    acknowledgement_status: toStringOr(value.acknowledgement_status).trim().toLowerCase(),
    maintenance_requests: value.maintenance_requests == null ? null : toObjectOr(value.maintenance_requests, null),
  };
}

export function parseContractorWorkOrderCardRow(row) {
  const value = assertRecord(row, "contractor work order card row");
  return {
    work_order_id: toNullableString(value.work_order_id),
    property_label: toStringOr(value.property_label),
    issue_title: toStringOr(value.issue_title),
    issue_description: toStringOr(value.issue_description),
    issue_priority: toStringOr(value.issue_priority).trim().toLowerCase(),
  };
}

export function parseAllowedActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => toStringOr(action).trim().toLowerCase())
    .filter(Boolean);
}

export function parseAllowedActionsBulkRow(row) {
  const value = assertRecord(row, "allowed actions bulk row");
  return {
    work_order_id: toNullableString(value.work_order_id),
    actions: parseAllowedActions(value.actions),
  };
}

export function parseWorkOrderMutationAck(row) {
  const value = assertRecord(row, "work order mutation acknowledgement");
  return {
    ok: toBooleanOr(value.ok, true),
    work_order_id: toNullableString(value.work_order_id),
    status: toNullableString(value.status),
    contractor_id: toNullableString(value.contractor_id),
    reason: toNullableString(value.reason),
  };
}

export function parseMyPaymentRow(row) {
  const value = assertRecord(row, "my payment row");
  return {
    payment_id: toNullableString(value.payment_id),
    property_id: toNullableString(value.property_id),
    amount: toNumberOr(value.amount),
    status: toStringOr(value.status).trim().toLowerCase(),
    due_date: toNullableString(value.due_date),
    paid_at: toNullableString(value.paid_at),
    created_at: toNullableString(value.created_at),
  };
}

export function parseBillingSubscriptionRow(row) {
  const value = assertRecord(row, "billing subscription row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    stripe_customer_id: toStringOr(value.stripe_customer_id),
    stripe_subscription_id: toStringOr(value.stripe_subscription_id),
    stripe_price_id: toStringOr(value.stripe_price_id),
    status: toStringOr(value.status).trim().toLowerCase(),
    current_period_start: toNullableString(value.current_period_start),
    current_period_end: toNullableString(value.current_period_end),
    cancel_at_period_end: toBooleanOr(value.cancel_at_period_end),
    trial_end: toNullableString(value.trial_end),
    metadata: toObjectOr(value.metadata),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseAccountSecuritySettingsRow(row) {
  const value = assertRecord(row, "account security settings row");
  return {
    account_id: toNullableString(value.account_id),
    role_change_target_threshold: toNumberOr(value.role_change_target_threshold, 3),
    role_change_account_threshold: toNumberOr(value.role_change_account_threshold, 5),
    role_change_window_minutes: toNumberOr(value.role_change_window_minutes, 30),
    document_delete_actor_threshold: toNumberOr(value.document_delete_actor_threshold, 5),
    document_delete_account_threshold: toNumberOr(value.document_delete_account_threshold, 10),
    document_delete_window_minutes: toNumberOr(value.document_delete_window_minutes, 15),
    export_retention_days: toNumberOr(value.export_retention_days, 14),
    surface_security_alerts_in_command_center: toBooleanOr(
      value.surface_security_alerts_in_command_center,
      true,
    ),
    security_command_center_min_severity: toStringOr(
      value.security_command_center_min_severity,
      "urgent",
    ).trim().toLowerCase(),
    security_command_center_include_suspicious: toBooleanOr(
      value.security_command_center_include_suspicious,
      true,
    ),
  };
}

export function parseComplianceItemRow(row) {
  const value = assertRecord(row, "compliance item row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    tenant_id: toNullableString(value.tenant_id),
    title: toStringOr(value.title),
    category: toStringOr(value.category).trim().toLowerCase(),
    due_date: toNullableString(value.due_date),
    status: toStringOr(value.status).trim().toLowerCase(),
    reminder_window_days: toNumberOr(value.reminder_window_days),
    recurrence_interval_months: toNumberOr(value.recurrence_interval_months),
    notes: toStringOr(value.notes),
    completed_at: toNullableString(value.completed_at),
    last_completed_at: toNullableString(value.last_completed_at),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseComplianceDocumentLinkRow(row) {
  const value = assertRecord(row, "compliance document link row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    compliance_item_id: toNullableString(value.compliance_item_id),
    document_id: toNullableString(value.document_id),
    created_at: toNullableString(value.created_at),
    documents: value.documents == null ? null : parseDocumentRow(value.documents),
  };
}

export function parseDocumentRow(row) {
  const value = assertRecord(row, "document row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    tenant_id: toNullableString(value.tenant_id),
    scope: toStringOr(value.scope).trim().toLowerCase(),
    visibility: toStringOr(value.visibility).trim().toLowerCase(),
    name: toStringOr(value.name),
    original_filename: toStringOr(value.original_filename),
    mime_type: toStringOr(value.mime_type),
    size_bytes: toNullableNumber(value.size_bytes),
    storage_path: toStringOr(value.storage_path),
    upload_status: toStringOr(value.upload_status).trim().toLowerCase(),
    tags: toArrayOr(value.tags),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseWorkOrderFinancialRow(row) {
  const value = assertRecord(row, "work order financial row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    work_order_id: toNullableString(value.work_order_id),
    quote_amount: toNullableNumber(value.quote_amount),
    quote_currency: toStringOr(value.quote_currency),
    quote_notes: toStringOr(value.quote_notes),
    quote_submitted_at: toNullableString(value.quote_submitted_at),
    quote_submitted_by: toNullableString(value.quote_submitted_by),
    quote_status: toStringOr(value.quote_status).trim().toLowerCase(),
    invoice_amount: toNullableNumber(value.invoice_amount),
    invoice_currency: toStringOr(value.invoice_currency),
    invoice_issued_at: toNullableString(value.invoice_issued_at),
    invoice_due_at: toNullableString(value.invoice_due_at),
    approved_at: toNullableString(value.approved_at),
    approved_by: toNullableString(value.approved_by),
    rejected_at: toNullableString(value.rejected_at),
    rejected_by: toNullableString(value.rejected_by),
    rejection_reason: toStringOr(value.rejection_reason),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseWorkOrderAttachmentRow(row) {
  const value = assertRecord(row, "work order attachment row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    work_order_id: toNullableString(value.work_order_id),
    uploaded_by: toNullableString(value.uploaded_by),
    file_name: toStringOr(value.file_name),
    mime_type: toStringOr(value.mime_type),
    file_size: toNullableNumber(value.file_size),
    storage_bucket: toStringOr(value.storage_bucket),
    storage_path: toStringOr(value.storage_path),
    kind: toStringOr(value.kind).trim().toLowerCase(),
    created_at: toNullableString(value.created_at),
  };
}

export function parseWorkOrderAuditLogRow(row) {
  const value = assertRecord(row, "work order audit log row");
  return {
    id: toNullableString(value.id),
    work_order_id: toNullableString(value.work_order_id),
    action: toStringOr(value.action).trim().toLowerCase(),
    actor_user_id: toNullableString(value.actor_user_id),
    old_value: value.old_value ?? null,
    new_value: value.new_value ?? null,
    created_at: toNullableString(value.created_at),
  };
}

export function parseWorkOrderStatusDefinitionRow(row) {
  const value = assertRecord(row, "work order status definition row");
  return {
    status: toStringOr(value.status).trim().toLowerCase(),
    label: toStringOr(value.label),
  };
}

export function parsePendingCancellationWorkOrderRow(row) {
  const value = assertRecord(row, "pending cancellation work order row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    status: toStringOr(value.status).trim().toLowerCase(),
    contractor_name: toStringOr(value.contractor_name),
    contractor_phone: toStringOr(value.contractor_phone),
    scheduled_at: toNullableString(value.scheduled_at),
    last_cancel_request_at: toNullableString(value.last_cancel_request_at),
    last_cancel_request_by: toNullableString(value.last_cancel_request_by),
  };
}

export function parseMaintenanceExpenseRow(row) {
  const value = assertRecord(row, "maintenance expense row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    amount: toNumberOr(value.amount),
    approval_state: toStringOr(value.approval_state).trim().toLowerCase(),
    expense_date: toNullableString(value.expense_date),
    posted_at: toNullableString(value.posted_at),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parsePropertyOperatingExpenseRow(row) {
  const value = assertRecord(row, "property operating expense row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    category: toStringOr(value.category).trim().toLowerCase(),
    expense_date: toNullableString(value.expense_date),
    amount: toNumberOr(value.amount),
    notes: toStringOr(value.notes),
    created_by: toNullableString(value.created_by),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parsePropertyFinancialProfileRow(row) {
  const value = assertRecord(row, "property financial profile row");
  return {
    property_id: toNullableString(value.property_id),
    account_id: toNullableString(value.account_id),
    estimated_market_value: toNullableNumber(value.estimated_market_value),
    target_cap_rate: toNullableNumber(value.target_cap_rate),
    notes: toStringOr(value.notes),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parsePreventiveMaintenanceTaskRow(row) {
  const value = assertRecord(row, "preventive maintenance task row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    title: toStringOr(value.title),
    category: toStringOr(value.category),
    frequency: toStringOr(value.frequency).trim().toLowerCase(),
    frequency_interval_days: toNullableNumber(value.frequency_interval_days),
    next_due_date: toNullableString(value.next_due_date),
    last_completed_at: toNullableString(value.last_completed_at),
    assigned_to_contractor_id: toNullableString(value.assigned_to_contractor_id),
    notes: toStringOr(value.notes),
    status: toStringOr(value.status).trim().toLowerCase(),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
    property: toObjectOr(value.property, null),
    assigned_contractor: toObjectOr(value.assigned_contractor, null),
  };
}

export function parsePortfolioAttentionItemRow(row) {
  const value = assertRecord(row, "portfolio_attention_items row");
  return {
    item_key: toStringOr(value.item_key),
    item_type: toStringOr(value.item_type),
    property_label: toStringOr(value.property_label),
    city: toStringOr(value.city),
    amount: toNumberOr(value.amount),
    days_vacant: toNullableNumber(value.days_vacant),
    request_title: toStringOr(value.request_title),
    link_path: toStringOr(value.link_path),
    sort_order: toNumberOr(value.sort_order),
  };
}

export function parseLeaseAttentionItemRow(row) {
  const value = assertRecord(row, "lease_attention_items row");
  return {
    item_key: toStringOr(value.item_key),
    item_type: toStringOr(value.item_type),
    property_label: toStringOr(value.property_label),
    tenant_label: toStringOr(value.tenant_label),
    lease_end_date: toNullableString(value.lease_end_date),
    days_until_end: toNullableNumber(value.days_until_end),
    link_path: toStringOr(value.link_path),
    sort_order: toNumberOr(value.sort_order),
  };
}

export function parseMaintenanceAttentionRow(row) {
  const value = assertRecord(row, "maintenance_attention_needed row");
  return {
    item_type: toStringOr(value.item_type),
    maintenance_request_id: toNullableString(value.maintenance_request_id),
    work_order_id: toNullableString(value.work_order_id),
    request_status: toStringOr(value.request_status),
    work_order_status: toStringOr(value.work_order_status),
    priority: toStringOr(value.priority),
    title: toStringOr(value.title),
    property_label: toStringOr(value.property_label),
    created_at: toNullableString(value.created_at),
    age_hours: toNullableNumber(value.age_hours),
  };
}

export function parseMaintenanceKpiSnapshotRow(row) {
  if (!row) return { ...EMPTY_MAINTENANCE_KPI_SNAPSHOT };
  const value = assertRecord(row, "maintenance_kpi_snapshot row");
  return {
    open_requests: toNumberOr(value.open_requests),
    active_work_orders: toNumberOr(value.active_work_orders),
    awaiting_action: toNumberOr(value.awaiting_action),
    resolved_pending_closure: toNumberOr(value.resolved_pending_closure),
    open_high_priority: toNumberOr(value.open_high_priority),
    triage_over_24h: toNumberOr(value.triage_over_24h),
    contractor_ack_overdue: toNumberOr(value.contractor_ack_overdue),
    stalled_repairs: toNumberOr(value.stalled_repairs),
    long_running_repairs: toNumberOr(value.long_running_repairs),
    repeat_repair_properties: toNumberOr(value.repeat_repair_properties),
    req_by_status: {
      ...EMPTY_MAINTENANCE_KPI_SNAPSHOT.req_by_status,
      ...toNumericObject(value.req_by_status),
    },
    wo_by_status: {
      ...EMPTY_MAINTENANCE_KPI_SNAPSHOT.wo_by_status,
      ...toNumericObject(value.wo_by_status),
    },
    aging: {
      ...EMPTY_MAINTENANCE_KPI_SNAPSHOT.aging,
      ...toNumericObject(value.aging),
    },
  };
}

function normalizeHealthReason(reason) {
  const value = assertRecord(reason, "property_operational_health_snapshot reason");
  return {
    key: toStringOr(value.key),
    penalty: toNumberOr(value.penalty),
    amount: value.amount == null ? undefined : toNumberOr(value.amount),
    count: value.count == null ? undefined : toNumberOr(value.count),
  };
}

export function parsePropertyOperationalHealthSnapshotRow(row) {
  const value = assertRecord(row, "property_operational_health_snapshot row");
  return {
    propertyId: toNullableString(value.property_id),
    propertyLabel: toStringOr(value.property_label),
    score: toNumberOr(value.score),
    category: toStringOr(value.category),
    reasons: toArrayOr(value.reasons).filter(isRecord).map(normalizeHealthReason),
    signals: {
      overdueRentAmount: toNumberOr(value.overdue_rent_amount),
      openRequestCount: toNumberOr(value.open_request_count),
      activeWorkOrderCount: toNumberOr(value.active_work_order_count),
      stalledRepairCount: toNumberOr(value.stalled_repair_count),
      ackOverdueCount: toNumberOr(value.ack_overdue_count),
      longRunningRepairCount: toNumberOr(value.long_running_repair_count),
      requests90Count: toNumberOr(value.requests_90_count),
      overduePreventiveCount: toNumberOr(value.overdue_preventive_count),
      dueSoonPreventiveCount: toNumberOr(value.due_soon_preventive_count),
      overdueComplianceCount: toNumberOr(value.overdue_compliance_count),
      dueSoonComplianceCount: toNumberOr(value.due_soon_compliance_count),
      missingComplianceCount: toNumberOr(value.missing_compliance_count),
      hasExpiredLease: toNumberOr(value.expired_lease_count) > 0,
      hasExpiringLease: toNumberOr(value.expiring_lease_count) > 0,
      hasRenewalInProgress: toNumberOr(value.renewal_in_progress_count) > 0,
      recentOperatingExpenses: toNumberOr(value.recent_operating_expenses),
      recentMaintenanceCost: toNumberOr(value.recent_maintenance_cost),
      tenantCount: toNumberOr(value.tenant_count),
    },
  };
}

export function parsePlaybookStatusSnapshotRow(row) {
  const value = assertRecord(row, "playbook_status_snapshot row");
  return {
    settings: toArrayOr(value.settings).filter(isRecord),
    open_run_counts: toObjectOr(value.open_run_counts),
    recent_runs: toArrayOr(value.recent_runs).filter(isRecord),
    recent_resolved_runs: toArrayOr(value.recent_resolved_runs).filter(isRecord),
    recent_executions: toArrayOr(value.recent_executions).filter(isRecord),
    open_runs: toNumberOr(value.open_runs),
    last_run_at: toNullableString(value.last_run_at),
    last_run_status: toStringOr(value.last_run_status, "recorded"),
  };
}

export function parseCommandCenterItemRow(row) {
  const value = assertRecord(row, "command_center_items row");
  return {
    item_key: toStringOr(value.item_key),
    item_type: toStringOr(value.item_type),
    category: toStringOr(value.category, "general"),
    severity: toStringOr(value.severity, "info"),
    bucket: toStringOr(value.bucket, "action"),
    entity_type: toStringOr(value.entity_type, "portfolio"),
    entity_id: toNullableString(value.entity_id),
    title: toStringOr(value.title || value.item_type, "Signal"),
    body: toStringOr(value.body),
    link_path: toStringOr(value.link_path),
    created_at: toNullableString(value.created_at),
    resolved_state: toBooleanOr(value.resolved_state),
    source_table: toStringOr(value.source_table),
    property_id: toNullableString(value.property_id),
    property_label: toStringOr(value.property_label),
    tenant_id: toNullableString(value.tenant_id),
    tenant_label: toStringOr(value.tenant_label),
    entity_label: toStringOr(value.entity_label),
    contractor_label: toStringOr(value.contractor_label),
    amount: toNumberOr(value.amount),
    age_hours: toNullableNumber(value.age_hours),
    due_days: toNullableNumber(value.due_days),
  };
}

export function parseAttentionCenterItemRow(row) {
  const value = assertRecord(row, "attention_center_items row");
  return {
    item_key: toStringOr(value.item_key),
    item_type: toStringOr(value.item_type),
    bucket: toStringOr(value.bucket, "action"),
    property_label: toStringOr(value.property_label),
    tenant_label: toStringOr(value.tenant_label),
    entity_label: toStringOr(value.entity_label),
    amount: toNumberOr(value.amount),
    age_hours: toNullableNumber(value.age_hours),
    due_days: toNullableNumber(value.due_days),
    link_path: toStringOr(value.link_path),
    source_table: toStringOr(value.source_table),
    sort_order: toNumberOr(value.sort_order),
    title: toStringOr(value.title),
    body: toStringOr(value.body),
    created_at: toNullableString(value.created_at),
    metadata: toObjectOr(value.metadata),
    property_id: toNullableString(value.property_id),
  };
}

export function parseTenantActivityFeedRow(row) {
  const value = assertRecord(row, "tenant_activity_feed row");
  return {
    event_key: toStringOr(value.event_key),
    event_type: toStringOr(value.event_type),
    occurred_at: toNullableString(value.occurred_at),
    title: toStringOr(value.title),
    detail: toStringOr(value.detail),
    status: toStringOr(value.status),
    link_path: toStringOr(value.link_path),
    source_table: toStringOr(value.source_table),
    source_id: toNullableString(value.source_id),
  };
}

export function parseTenantIssueRow(row) {
  const value = assertRecord(row, "tenant_my_issues row");
  return {
    maintenance_request_id: toNullableString(value.maintenance_request_id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    title: toStringOr(value.title),
    maintenance_status: toStringOr(value.maintenance_status).trim().toLowerCase(),
    priority: toStringOr(value.priority).trim().toLowerCase(),
    created_at: toNullableString(value.created_at),
    latest_work_order_status: toStringOr(value.latest_work_order_status).trim().toLowerCase(),
    latest_work_order_id: toNullableString(value.latest_work_order_id),
  };
}

export function parseSecurityObservabilityEventRow(row) {
  const value = assertRecord(row, "security_observability_event_feed row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    actor_user_id: toNullableString(value.actor_user_id),
    actor_role: toStringOr(value.actor_role),
    category: toStringOr(value.category),
    kind: toStringOr(value.kind),
    surface: toStringOr(value.surface),
    reason: toStringOr(value.reason),
    outcome: toStringOr(value.outcome),
    code: toStringOr(value.code),
    guard_denied: toBooleanOr(value.guard_denied),
    entity_type: toStringOr(value.entity_type),
    entity_id: toNullableString(value.entity_id),
    correlation_id: toStringOr(value.correlation_id),
    source: toStringOr(value.source),
    metadata: toObjectOr(value.metadata),
    created_at: toNullableString(value.created_at),
  };
}

export function parseSecurityAuditLedgerRow(row) {
  const value = assertRecord(row, "security audit ledger row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    actor_user_id: toNullableString(value.actor_user_id),
    action: toStringOr(value.action).trim().toLowerCase(),
    entity_type: toStringOr(value.entity_type).trim().toLowerCase(),
    entity_id: toNullableString(value.entity_id),
    metadata: toObjectOr(value.metadata),
    created_at: toNullableString(value.created_at),
    actorLabel: toStringOr(value.actorLabel),
    actorKind: toStringOr(value.actorKind),
    entityLabel: toStringOr(value.entityLabel),
    assignedToLabel: toStringOr(value.assignedToLabel),
    acknowledgedByLabel: toStringOr(value.acknowledgedByLabel),
    classifiedByLabel: toStringOr(value.classifiedByLabel),
    resolvedByLabel: toStringOr(value.resolvedByLabel),
  };
}

export function parseSecurityAnomalyAlertRow(row) {
  const value = assertRecord(row, "security anomaly alert row");
  return {
    id: toNullableString(value.id),
    accountId: toNullableString(value.accountId ?? value.account_id),
    alertType: toStringOr(value.alertType ?? value.alert_type),
    severity: toStringOr(value.severity).trim().toLowerCase(),
    status: toStringOr(value.status).trim().toLowerCase(),
    actorUserId: toNullableString(value.actorUserId ?? value.actor_user_id),
    actorLabel: toStringOr(value.actorLabel),
    entityType: toStringOr(value.entityType ?? value.entity_type).trim().toLowerCase(),
    entityId: toNullableString(value.entityId ?? value.entity_id),
    entityLabel: toStringOr(value.entityLabel),
    title: toStringOr(value.title),
    summary: toStringOr(value.summary),
    metadata: toObjectOr(value.metadata),
    alertCount: toNumberOr(value.alertCount ?? value.alert_count, 1),
    classification: toStringOr(value.classification),
    classifiedByUserId: toNullableString(value.classifiedByUserId ?? value.classified_by_user_id),
    classifiedByLabel: toStringOr(value.classifiedByLabel),
    classifiedAt: toNullableString(value.classifiedAt ?? value.classified_at),
    assignedToUserId: toNullableString(value.assignedToUserId ?? value.assigned_to_user_id),
    assignedToLabel: toStringOr(value.assignedToLabel),
    assignedByUserId: toNullableString(value.assignedByUserId ?? value.assigned_by_user_id),
    assignedAt: toNullableString(value.assignedAt ?? value.assigned_at),
    acknowledgedByUserId: toNullableString(value.acknowledgedByUserId ?? value.acknowledged_by_user_id),
    acknowledgedByLabel: toStringOr(value.acknowledgedByLabel),
    acknowledgedAt: toNullableString(value.acknowledgedAt ?? value.acknowledged_at),
    resolvedByUserId: toNullableString(value.resolvedByUserId ?? value.resolved_by_user_id),
    resolvedByLabel: toStringOr(value.resolvedByLabel),
    resolvedAt: toNullableString(value.resolvedAt ?? value.resolved_at),
    resolutionNote: toStringOr(value.resolutionNote ?? value.resolution_note),
    createdAt: toNullableString(value.createdAt ?? value.created_at),
    lastSeenAt: toNullableString(value.lastSeenAt ?? value.last_seen_at),
    updatedAt: toNullableString(value.updatedAt ?? value.updated_at),
  };
}

export function parseSecurityAlertAssigneeRow(row) {
  const value = assertRecord(row, "security alert assignee row");
  return {
    userId: toNullableString(value.userId ?? value.user_id),
    role: toStringOr(value.role).trim().toLowerCase(),
    label: toStringOr(value.label),
  };
}

export function parseSecurityAlertWorkflowRow(row) {
  const value = assertRecord(row, "security_anomaly_alert_apply row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    alert_type: toStringOr(value.alert_type),
    severity: toStringOr(value.severity),
    status: toStringOr(value.status).trim().toLowerCase(),
    actor_user_id: toNullableString(value.actor_user_id),
    entity_type: toStringOr(value.entity_type),
    entity_id: toNullableString(value.entity_id),
    title: toStringOr(value.title),
    summary: toStringOr(value.summary),
    metadata: toObjectOr(value.metadata),
    alert_count: toNumberOr(value.alert_count, 1),
    classification: toStringOr(value.classification),
    classified_by_user_id: toNullableString(value.classified_by_user_id),
    classified_at: toNullableString(value.classified_at),
    assigned_to_user_id: toNullableString(value.assigned_to_user_id),
    assigned_by_user_id: toNullableString(value.assigned_by_user_id),
    assigned_at: toNullableString(value.assigned_at),
    acknowledged_by_user_id: toNullableString(value.acknowledged_by_user_id),
    acknowledged_at: toNullableString(value.acknowledged_at),
    resolved_by_user_id: toNullableString(value.resolved_by_user_id),
    resolved_at: toNullableString(value.resolved_at),
    resolution_note: toStringOr(value.resolution_note),
    created_at: toNullableString(value.created_at),
    last_seen_at: toNullableString(value.last_seen_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseSecurityAuditExportJobRow(row) {
  const value = assertRecord(row, "security audit export job row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    requested_by_user_id: toNullableString(value.requested_by_user_id),
    requested_label: toStringOr(value.requested_label),
    export_kind: toStringOr(value.export_kind),
    format: toStringOr(value.format),
    status: toStringOr(value.status).trim().toLowerCase(),
    filter_criteria: toObjectOr(value.filter_criteria),
    artifact_bucket: toStringOr(value.artifact_bucket),
    artifact_path: toStringOr(value.artifact_path),
    row_count: toNumberOr(value.row_count),
    file_size_bytes: toNumberOr(value.file_size_bytes),
    error_summary: toStringOr(value.error_summary),
    created_at: toNullableString(value.created_at),
    started_at: toNullableString(value.started_at),
    completed_at: toNullableString(value.completed_at),
    expires_at: toNullableString(value.expires_at),
  };
}

export function parseSecurityAuditExportJobViewRow(row) {
  const value = assertRecord(row, "security audit export job view row");
  return {
    id: toNullableString(value.id),
    accountId: toNullableString(value.accountId ?? value.account_id),
    requestedByUserId: toNullableString(value.requestedByUserId ?? value.requested_by_user_id),
    requestedByLabel: toStringOr(value.requestedByLabel),
    requestedLabel: toStringOr(value.requestedLabel ?? value.requested_label),
    displayLabel: toStringOr(value.displayLabel),
    exportKind: toStringOr(value.exportKind ?? value.export_kind),
    format: toStringOr(value.format),
    status: toStringOr(value.status).trim().toLowerCase(),
    filterCriteria: toObjectOr(value.filterCriteria ?? value.filter_criteria),
    artifactBucket: toStringOr(value.artifactBucket ?? value.artifact_bucket),
    artifactPath: toStringOr(value.artifactPath ?? value.artifact_path),
    rowCount: toNumberOr(value.rowCount ?? value.row_count),
    fileSizeBytes: toNumberOr(value.fileSizeBytes ?? value.file_size_bytes),
    errorSummary: toStringOr(value.errorSummary ?? value.error_summary),
    createdAt: toNullableString(value.createdAt ?? value.created_at),
    startedAt: toNullableString(value.startedAt ?? value.started_at),
    completedAt: toNullableString(value.completedAt ?? value.completed_at),
    expiresAt: toNullableString(value.expiresAt ?? value.expires_at),
  };
}

export function parseDocumentAuditRow(row) {
  const value = assertRecord(row, "document audit row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    document_id: toNullableString(value.document_id),
    property_id: toNullableString(value.property_id),
    tenant_id: toNullableString(value.tenant_id),
    user_id: toNullableString(value.user_id),
    action: toStringOr(value.action).trim().toLowerCase(),
    details: toObjectOr(value.details),
    metadata: toObjectOr(value.metadata),
    performed_at: toNullableString(value.performed_at),
  };
}

export function parseTenantRow(row) {
  const value = assertRecord(row, "tenant row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    user_id: toNullableString(value.user_id),
    name: toStringOr(value.name),
    email: toStringOr(value.email).trim().toLowerCase(),
    phone: toStringOr(value.phone),
    status: toStringOr(value.status).trim().toLowerCase(),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseAccountBrandingRow(row) {
  const value = assertRecord(row, "account branding row");
  return {
    account_id: toNullableString(value.account_id),
    brand_name: toStringOr(value.brand_name),
    logo_url: toStringOr(value.logo_url),
    primary_color: toStringOr(value.primary_color),
    accent_color: toStringOr(value.accent_color),
    company_name: toStringOr(value.company_name),
    email_from_name: toStringOr(value.email_from_name),
    reply_to_email: toStringOr(value.reply_to_email),
    support_email: toStringOr(value.support_email),
    invite_subject_template: toStringOr(value.invite_subject_template),
    invite_button_label: toStringOr(value.invite_button_label),
    invite_footer_text: toStringOr(value.invite_footer_text),
    support_phone: toStringOr(value.support_phone),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseContractorRatingRow(row) {
  const value = assertRecord(row, "contractor rating row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    work_order_id: toNullableString(value.work_order_id),
    contractor_user_id: toNullableString(value.contractor_user_id),
    rating: toNumberOr(value.rating),
    comment: toStringOr(value.comment),
    rated_by: toNullableString(value.rated_by),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

export function parseActivityLogRow(row) {
  const value = assertRecord(row, "activity log row");
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    entity_type: toStringOr(value.entity_type).trim().toLowerCase(),
    entity_id: toNullableString(value.entity_id),
    action: toStringOr(value.action).trim().toLowerCase(),
    field: toStringOr(value.field),
    old_value: value.old_value ?? null,
    new_value: value.new_value ?? null,
    actor_user_id: toNullableString(value.actor_user_id),
    actor_role: toStringOr(value.actor_role).trim().toLowerCase(),
    meta: toObjectOr(value.meta),
    created_at: toNullableString(value.created_at),
  };
}

export function parseLeaseRow(row) {
  const value = assertRecord(row, "lease row");
  const property = isRecord(value.property) ? value.property : null;
  const tenant = isRecord(value.tenant) ? value.tenant : null;
  return {
    id: toNullableString(value.id),
    account_id: toNullableString(value.account_id),
    property_id: toNullableString(value.property_id),
    tenant_id: toNullableString(value.tenant_id),
    lease_start_date: toNullableString(value.lease_start_date),
    lease_end_date: toNullableString(value.lease_end_date),
    renewal_status: toStringOr(value.renewal_status).trim().toLowerCase(),
    notice_period_days: toNumberOr(value.notice_period_days),
    auto_renew: toBooleanOr(value.auto_renew),
    notes: toStringOr(value.notes),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
    property: property
      ? {
          address: toStringOr(property.address),
        }
      : null,
    tenant: tenant
      ? {
          name: toStringOr(tenant.name),
        }
      : null,
    property_label: toStringOr(value.property_label),
    tenant_label: toStringOr(value.tenant_label),
  };
}

export function parseEdgeUrlResult(row) {
  const value = assertRecord(row, "edge url response");
  return {
    url: toStringOr(value.url),
    trialDays: value.trialDays == null ? null : toNumberOr(value.trialDays),
  };
}

export function parseSecurityAuditExportRunResult(row) {
  const value = assertRecord(row, "security audit export run response");
  return {
    ok: toBooleanOr(value.ok),
    jobId: toNullableString(value.jobId),
    status: toStringOr(value.status).trim().toLowerCase(),
    rowCount: value.rowCount == null ? null : toNumberOr(value.rowCount),
    artifactBucket: toStringOr(value.artifactBucket),
    artifactPath: toStringOr(value.artifactPath),
  };
}

export function parseRpcRows(rows, parser, label = "RPC rows") {
  if (!Array.isArray(rows)) {
    throw new RpcContractError(`${label} must be an array`);
  }
  return rows.map(parser);
}
