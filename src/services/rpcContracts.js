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

export function parseRpcRows(rows, parser, label = "RPC rows") {
  if (!Array.isArray(rows)) {
    throw new RpcContractError(`${label} must be an array`);
  }
  return rows.map(parser);
}
