import { supabase } from "../lib/supabase";
import {
  EMPTY_MAINTENANCE_KPI_SNAPSHOT,
  firstRpcRow,
  parseActivityLogRow,
  parseMaintenanceAttentionRow,
  parseMaintenanceKpiSnapshotRow,
  parseRpcRows,
  parseWorkOrderAttachmentRow,
  parseWorkOrderAuditLogRow,
  parseWorkOrderFinancialRow,
} from "./rpcContracts";
import {
  logOperationalLatencySample,
  logSecurityRelevantFailure,
  logSlowOperationalTelemetry,
  startOperationalTimer,
} from "./securityFailureLogger";

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hoursSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 3600000));
}

function isCompletedWorkOrderStatus(status) {
  return ["completed", "cancelled", "zakończone", "anulowane"].includes(normalize(status));
}

export async function getMaintenanceAttention(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase.rpc("maintenance_attention_needed", {
    p_account_id: accountId,
  });
  if (error && isMissingBackendObject(error)) {
    const fallbackAnalytics = await getMaintenanceSlaAnalytics(accountId);
    return fallbackAnalytics.attentionRows;
  }
  if (error) throw error;
  const baseRows = parseRpcRows(data || [], parseMaintenanceAttentionRow, "maintenance attention rows");
  const derived = await getMaintenanceSlaAnalytics(accountId);
  const deduped = new Map();
  for (const row of [...baseRows, ...(derived.attentionRows || [])]) {
    const key = `${row?.item_type || "item"}-${row?.maintenance_request_id || "na"}-${row?.work_order_id || "na"}-${row?.property_id || "na"}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export async function getMaintenanceRecentActivity(accountId, t, limit = 10) {
  if (!accountId) return [];

  const [{ data: workOrders, error: workOrdersError }, activityRes] = await Promise.all([
    supabase
      .from("work_orders_with_flags")
      .select("id")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("activity_log")
      .select("id, entity_type, entity_id, action, field, actor_role, created_at")
      .eq("account_id", accountId)
      .in("entity_type", ["maintenance_request", "maintenance_requests", "work_order", "work_orders"])
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (workOrdersError && !isMissingBackendObject(workOrdersError)) throw workOrdersError;
  if (activityRes.error && !isMissingBackendObject(activityRes.error)) throw activityRes.error;

  const workOrderIds = (workOrders || []).map((row) => row.id).filter(Boolean);
  let workOrderAuditRows = [];

  if (workOrderIds.length > 0) {
    const { data, error } = await supabase
      .from("work_order_audit_log")
      .select("id, work_order_id, action, created_at")
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error && !isMissingBackendObject(error)) throw error;
    workOrderAuditRows = data || [];
  }

  const activityItems = (activityRes.data || []).map((row) => {
    const entityType = String(row.entity_type || "").toLowerCase();
    const isWorkOrder = entityType === "work_order" || entityType === "work_orders";

    return {
      key: `act-${row.id}`,
      at: row.created_at,
      title: isWorkOrder ? t("maintenance.kpi.feed.workOrderChange") : t("maintenance.kpi.feed.requestChange"),
      detail: row.field ? `${row.action || "update"} • ${row.field}` : row.action || "update",
      linkPath: isWorkOrder && row.entity_id ? `/work-orders/${row.entity_id}` : "/maintenance-inbox",
    };
  });

  const auditItems = (workOrderAuditRows || []).map((row) => ({
    key: `woa-${row.id}`,
    at: row.created_at,
    title: t("maintenance.kpi.feed.workOrderAudit"),
    detail: row.action || "update",
    linkPath: row.work_order_id ? `/work-orders/${row.work_order_id}` : "/maintenance-inbox",
  }));

  return [...activityItems, ...auditItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

function formatTimelineAction(action = "", t) {
  const normalized = String(action || "").toLowerCase();
  if (normalized === "insert" || normalized === "create") return t("activity.action.created");
  if (normalized === "update") return t("activity.action.updated");
  if (normalized === "delete") return t("activity.action.deleted");
  if (normalized === "status_change") return t("activity.action.statusChanged");
  if (normalized === "assign") return t("activity.action.assigned");
  return action || t("activity.action.changed");
}

function safeTimelineAt(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function getMaintenanceTimelineEvents({
  accountId,
  request,
  linkedWorkOrders = [],
  t,
} = {}) {
  if (!accountId || !request?.id) return [];

  const requestId = String(request.id);
  const workOrderMap = new Map();
  for (const workOrder of Array.isArray(linkedWorkOrders) ? linkedWorkOrders : []) {
    if (!workOrder?.id) continue;
    workOrderMap.set(workOrder.id, workOrder);
  }
  const workOrderIds = Array.from(workOrderMap.keys());

  const [activityRes, auditRes, attachmentRes, financialRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, account_id, entity_type, entity_id, action, field, old_value, new_value, actor_user_id, actor_role, meta, created_at")
      .eq("account_id", accountId)
      .in("entity_type", ["maintenance_request", "maintenance_requests"])
      .eq("entity_id", requestId)
      .order("created_at", { ascending: true })
      .limit(100),
    workOrderIds.length > 0
      ? supabase
          .from("work_order_audit_log")
          .select("id, work_order_id, action, actor_user_id, old_value, new_value, created_at")
          .in("work_order_id", workOrderIds)
          .order("created_at", { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length > 0
      ? supabase
          .from("work_order_attachments")
          .select("id, account_id, work_order_id, uploaded_by, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at")
          .in("work_order_id", workOrderIds)
          .order("created_at", { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length > 0
      ? supabase
          .from("work_order_financials")
          .select("id, account_id, work_order_id, quote_amount, quote_currency, quote_notes, quote_submitted_at, quote_submitted_by, quote_status, invoice_amount, invoice_currency, invoice_issued_at, invoice_due_at, approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at, updated_at")
          .in("work_order_id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (activityRes?.error) throw activityRes.error;
  if (auditRes?.error) throw auditRes.error;
  if (attachmentRes?.error) throw attachmentRes.error;
  if (financialRes?.error) throw financialRes.error;

  const activityRows = parseRpcRows(activityRes.data || [], parseActivityLogRow, "maintenance timeline activity rows");
  const auditRows = parseRpcRows(auditRes.data || [], parseWorkOrderAuditLogRow, "maintenance timeline audit rows");
  const attachmentRows = parseRpcRows(
    attachmentRes.data || [],
    parseWorkOrderAttachmentRow,
    "maintenance timeline attachment rows",
  );
  const financialRows = parseRpcRows(
    financialRes.data || [],
    parseWorkOrderFinancialRow,
    "maintenance timeline financial rows",
  );

  const events = [
    {
      key: `req-created-${request.id}`,
      at: request.created_at,
      title: t("maintenance.timeline.requestCreated"),
      detail: request.title || t("maintenance.requestFallbackTitle"),
      source: "request",
    },
    ...workOrderIds.map((workOrderId) => ({
      key: `wo-created-${workOrderId}`,
      at: workOrderMap.get(workOrderId)?.created_at,
      title: t("maintenance.timeline.workOrderCreated"),
      detail: `WO: ${workOrderId}`,
      woId: workOrderId,
      source: "work_order",
    })),
    ...activityRows.map((row) => {
      const field = String(row.field || "").toLowerCase();
      const isNoteChange = field === "description";
      const isStatusChange = field === "status" || String(row.action || "").toLowerCase() === "status_change";
      return {
        key: `activity-${row.id}`,
        at: row.created_at,
        title: isNoteChange
          ? t("maintenance.timeline.staffNote")
          : isStatusChange
            ? t("maintenance.timeline.requestStatusChanged")
            : formatTimelineAction(row.action, t),
        detail: row.field ? `field: ${row.field}` : row.actor_role ? `role: ${row.actor_role}` : "",
        source: "request",
      };
    }),
    ...auditRows.map((row) => {
      const action = String(row.action || "").toLowerCase();
      const isAssign = action.includes("assign") || action.includes("contractor");
      const isComplete = action.includes("complete") || action.includes("completed");
      return {
        key: `wo-audit-${row.work_order_id || "na"}-${row.id}`,
        at: row.created_at,
        title: isAssign
          ? t("maintenance.timeline.contractorAssigned")
          : isComplete
            ? t("maintenance.timeline.workCompleted")
            : t("maintenance.timeline.workOrderAction", { action: formatTimelineAction(row.action, t) }),
        detail: row.action || "",
        woId: row.work_order_id || null,
        source: "work_order",
      };
    }),
    ...attachmentRows.map((row) => ({
      key: `att-${row.work_order_id || "na"}-${row.id}`,
      at: row.created_at,
      title: t("maintenance.timeline.photoUploaded"),
      detail: row.file_name || row.kind || t("maintenance.timeline.attachment"),
      attachmentRow: row,
      woId: row.work_order_id || null,
      source: "work_order",
    })),
    ...financialRows.flatMap((row) => {
      const next = [];
      if (row.quote_submitted_at) {
        next.push({
          key: `fin-quote-submitted-${row.work_order_id}`,
          at: row.quote_submitted_at,
          title: t("maintenance.timeline.quoteSubmitted"),
          detail: "",
          woId: row.work_order_id,
          source: "work_order",
        });
      }
      if (row.approved_at) {
        next.push({
          key: `fin-quote-approved-${row.work_order_id}`,
          at: row.approved_at,
          title: t("maintenance.timeline.quoteApproved"),
          detail: "",
          woId: row.work_order_id,
          source: "work_order",
        });
      }
      if (row.rejected_at) {
        next.push({
          key: `fin-quote-rejected-${row.work_order_id}`,
          at: row.rejected_at,
          title: t("maintenance.timeline.quoteRejected"),
          detail: row.rejection_reason || "",
          woId: row.work_order_id,
          source: "work_order",
        });
      }
      if (row.invoice_issued_at) {
        next.push({
          key: `fin-invoice-issued-${row.work_order_id}`,
          at: row.invoice_issued_at,
          title: t("maintenance.timeline.invoiceIssued"),
          detail: "",
          woId: row.work_order_id,
          source: "work_order",
        });
      }
      return next;
    }),
  ];

  if (String(request.status || "").toLowerCase() === "closed") {
    events.push({
      key: `req-closed-${request.id}`,
      at: request.updated_at || request.created_at,
      title: t("maintenance.timeline.requestClosed"),
      detail: "",
      source: "request",
    });
  }

  return events.sort((left, right) => safeTimelineAt(left.at) - safeTimelineAt(right.at));
}

export async function getMaintenanceKpiSnapshot(accountId) {
  if (!accountId) return null;
  const startedAt = startOperationalTimer();
  const thresholdMs = 1500;
  const { data, error } = await supabase.rpc("maintenance_kpi_snapshot", {
    p_account_id: accountId,
  });
  if (error && isMissingBackendObject(error)) {
    return { ...EMPTY_MAINTENANCE_KPI_SNAPSHOT };
  }
  if (error) {
    logSecurityRelevantFailure("maintenance_kpi_snapshot", {
      error,
      context: { accountId },
    });
    throw error;
  }
  const durationMs = startOperationalTimer() - startedAt;
  logOperationalLatencySample("maintenance_kpi_snapshot", {
    accountId,
    surface: "maintenance",
    durationMs,
    targetMs: thresholdMs,
  });
  logSlowOperationalTelemetry("maintenance_kpi_snapshot", {
    accountId,
    surface: "maintenance",
    durationMs,
    thresholdMs,
  });
  return parseMaintenanceKpiSnapshotRow(firstRpcRow(data));
}

function chooseSpendAmount(row) {
  const invoice = Number(row?.invoice_amount || 0);
  if (Number.isFinite(invoice) && invoice > 0) return invoice;
  const quote = Number(row?.quote_amount || 0);
  return Number.isFinite(quote) ? quote : 0;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function recentMonths(count = 6) {
  const now = new Date();
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: monthKey(d),
      date: d,
    });
  }
  return months;
}

function startOfCurrentMonth() {
  return startOfMonth(new Date());
}

function nextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function normalizeCategoryLabel(category) {
  const raw = String(category || "").trim();
  if (!raw) return "Uncategorized";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyFinancialAnalytics() {
  return {
    totalSpend: 0,
    totalQuoted: 0,
    avgCostPerWorkOrder: 0,
    topProperties: [],
    topContractors: [],
    expensiveRepairs: [],
    monthlySpend: [],
    categorySpend: [],
    currentMonthActual: 0,
    currentMonthBudget: 0,
    currentMonthVariance: 0,
  };
}

function emptySlaAnalytics() {
  return {
    triageOver24hCount: 0,
    contractorAckOverdueCount: 0,
    stalledRepairsCount: 0,
    longRunningRepairsCount: 0,
    repeatRepairPropertiesCount: 0,
    stalledRepairs: [],
    longRunningRepairs: [],
    repeatRepairProperties: [],
    attentionRows: [],
  };
}

function buildLegacyFinancialAnalytics(rows = [], propertyMap = new Map()) {
  let totalSpend = 0;
  let totalQuoted = 0;
  let countedWorkOrders = 0;
  const propertySpend = new Map();
  const contractorSpend = new Map();
  const expensiveRepairs = [];
  const monthDefs = recentMonths(6);
  const monthSpend = new Map(monthDefs.map((month) => [month.key, 0]));

  for (const row of rows) {
    const quote = Number(row?.quote_amount || 0);
    const spend = chooseSpendAmount(row);
    const status = String(row?.status || "").toLowerCase();
    const propertyLabel = propertyMap.get(row.property_id) || "—";
    const contractorLabel = String(row?.contractor_name || "").trim() || "Unassigned";

    totalSpend += spend;
    totalQuoted += Number.isFinite(quote) ? quote : 0;
    if (spend > 0) countedWorkOrders += 1;

    const propertyKey = String(row.property_id || propertyLabel);
    const currentProperty = propertySpend.get(propertyKey) || {
      propertyId: row.property_id || null,
      label: propertyLabel,
      amount: 0,
    };
    currentProperty.amount += spend;
    propertySpend.set(propertyKey, currentProperty);
    contractorSpend.set(contractorLabel, (contractorSpend.get(contractorLabel) || 0) + spend);

    const basisDate = new Date(row?.updated_at || row?.created_at || Date.now());
    if (!Number.isNaN(basisDate.getTime())) {
      const key = monthKey(startOfMonth(basisDate));
      if (monthSpend.has(key)) {
        monthSpend.set(key, (monthSpend.get(key) || 0) + spend);
      }
    }

    expensiveRepairs.push({
      id: row.id,
      propertyId: row.property_id,
      propertyLabel,
      contractorLabel,
      title: row?.maintenance_requests?.title || row.id,
      amount: spend,
      status,
      linkPath: `/work-orders/${row.id}`,
    });
  }

  return {
    totalSpend,
    totalQuoted,
    avgCostPerWorkOrder: countedWorkOrders > 0 ? totalSpend / countedWorkOrders : 0,
    topProperties: Array.from(propertySpend.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    topContractors: Array.from(contractorSpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    expensiveRepairs: expensiveRepairs
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    monthlySpend: monthDefs.map((month) => ({
      key: month.key,
      label: month.date.toLocaleDateString(undefined, { month: "short" }),
      amount: monthSpend.get(month.key) || 0,
    })),
    categorySpend: [],
    currentMonthActual: 0,
    currentMonthBudget: 0,
    currentMonthVariance: 0,
  };
}

async function getPropertyMap(propertyIds = []) {
  if (propertyIds.length === 0) return new Map();

  const { data: propertyRows, error: propertyError } = await supabase
    .from("properties")
    .select("id, address")
    .in("id", propertyIds);

  if (propertyError && !isMissingBackendObject(propertyError)) throw propertyError;
  return new Map((propertyRows || []).map((row) => [row.id, row.address || "—"]));
}

function makeAttentionRow({
  itemType,
  propertyLabel = "",
  title = "",
  ageHours = null,
  workOrderId = null,
  maintenanceRequestId = null,
  propertyId = null,
}) {
  return {
    item_type: itemType,
    property_label: propertyLabel,
    title,
    age_hours: ageHours,
    work_order_id: workOrderId,
    maintenance_request_id: maintenanceRequestId,
    property_id: propertyId,
  };
}

export async function getMaintenanceSlaAnalytics(accountId) {
  if (!accountId) return emptySlaAnalytics();

  const [requestsRes, workOrdersRes] = await Promise.all([
    supabase
      .from("maintenance_requests")
      .select("id, property_id, reported_by_tenant_id, title, status, priority, created_at, updated_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("work_orders")
      .select(`
        id,
        property_id,
        maintenance_request_id,
        contractor_user_id,
        contractor_name,
        status,
        scheduled_at,
        created_at,
        updated_at,
        assigned_at,
        acknowledged_at,
        acknowledgement_due_at,
        acknowledgement_status,
        maintenance_requests:maintenance_request_id ( id, title )
      `)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (requestsRes.error && isMissingBackendObject(requestsRes.error)) return emptySlaAnalytics();
  if (workOrdersRes.error && isMissingBackendObject(workOrdersRes.error)) return emptySlaAnalytics();
  if (requestsRes.error) throw requestsRes.error;
  if (workOrdersRes.error) throw workOrdersRes.error;

  const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];
  const workOrders = Array.isArray(workOrdersRes.data) ? workOrdersRes.data : [];

  const propertyIds = Array.from(
    new Set([
      ...requests.map((row) => row.property_id).filter(Boolean),
      ...workOrders.map((row) => row.property_id).filter(Boolean),
    ]),
  );
  const propertyMap = await getPropertyMap(propertyIds);

  const workOrdersByRequestId = new Map();
  for (const row of workOrders) {
    if (!row?.maintenance_request_id) continue;
    const list = workOrdersByRequestId.get(row.maintenance_request_id) || [];
    list.push(row);
    workOrdersByRequestId.set(row.maintenance_request_id, list);
  }

  const triageOverdue = [];
  for (const row of requests) {
    const status = normalize(row?.status);
    if (status !== "open") continue;
    if ((workOrdersByRequestId.get(row.id) || []).length > 0) continue;
    const ageHours = hoursSince(row?.created_at);
    if (!Number.isFinite(ageHours) || ageHours < 24) continue;
    triageOverdue.push({
      requestId: row.id,
      propertyId: row.property_id || null,
      propertyLabel: propertyMap.get(row.property_id) || "—",
      title: row?.title || "Maintenance request",
      ageHours,
    });
  }

  const contractorAckOverdue = [];
  const stalledRepairs = [];
  const longRunningRepairs = [];

  for (const row of workOrders) {
    const status = normalize(row?.status);
    const propertyLabel = propertyMap.get(row.property_id) || "—";
    const requestTitle = row?.maintenance_requests?.title || row.id;
    const lastUpdatedHours = hoursSince(row?.updated_at || row?.created_at);
    const repairAgeHours = hoursSince(row?.created_at);
    const hasContractor = !!(row?.contractor_user_id || row?.contractor_name);
    const ackStatus = normalize(row?.acknowledgement_status);
    const ackDueAt = row?.acknowledgement_due_at ? new Date(row.acknowledgement_due_at) : null;

    if (
      hasContractor &&
      ackDueAt &&
      !Number.isNaN(ackDueAt.getTime()) &&
      ackDueAt.getTime() < Date.now() &&
      !row?.acknowledged_at &&
      ackStatus !== "acknowledged" &&
      !isCompletedWorkOrderStatus(status)
    ) {
      contractorAckOverdue.push({
        id: row.id,
        propertyId: row.property_id || null,
        propertyLabel,
        title: requestTitle,
        contractorLabel: row?.contractor_name || "",
        ageHours: lastUpdatedHours,
        dueAt: row?.acknowledgement_due_at || null,
        linkPath: `/work-orders/${row.id}`,
      });
    }

    if (
      ["in_progress", "w trakcie", "blocked", "zablokowane"].includes(status) &&
      Number.isFinite(lastUpdatedHours) &&
      lastUpdatedHours >= 72
    ) {
      stalledRepairs.push({
        id: row.id,
        propertyId: row.property_id || null,
        propertyLabel,
        title: requestTitle,
        contractorLabel: row?.contractor_name || "",
        ageHours: lastUpdatedHours,
        repairAgeHours,
        linkPath: `/work-orders/${row.id}`,
      });
    }

    if (!isCompletedWorkOrderStatus(status) && Number.isFinite(repairAgeHours) && repairAgeHours >= 24 * 14) {
      longRunningRepairs.push({
        id: row.id,
        propertyId: row.property_id || null,
        propertyLabel,
        title: requestTitle,
        contractorLabel: row?.contractor_name || "",
        ageHours: lastUpdatedHours,
        repairAgeHours,
        linkPath: `/work-orders/${row.id}`,
      });
    }
  }

  const recentPropertyCounts = new Map();
  const repeatRepairProperties = [];
  const ninetyDaysAgo = Date.now() - 90 * 24 * 3600000;
  for (const row of requests) {
    if (!row?.property_id) continue;
    const createdAt = row?.created_at ? new Date(row.created_at).getTime() : NaN;
    if (!Number.isFinite(createdAt) || createdAt < ninetyDaysAgo) continue;
    recentPropertyCounts.set(row.property_id, (recentPropertyCounts.get(row.property_id) || 0) + 1);
  }
  for (const [propertyId, count] of recentPropertyCounts.entries()) {
    if (count < 3) continue;
    repeatRepairProperties.push({
      propertyId,
      label: propertyMap.get(propertyId) || "—",
      count,
      amount: count,
      linkPath: `/properties/${propertyId}`,
    });
  }

  return {
    triageOver24hCount: triageOverdue.length,
    contractorAckOverdueCount: contractorAckOverdue.length,
    stalledRepairsCount: stalledRepairs.length,
    longRunningRepairsCount: longRunningRepairs.length,
    repeatRepairPropertiesCount: repeatRepairProperties.length,
    stalledRepairs: stalledRepairs
      .sort((a, b) => Number(b.ageHours || 0) - Number(a.ageHours || 0))
      .slice(0, 6),
    longRunningRepairs: longRunningRepairs
      .sort((a, b) => Number(b.repairAgeHours || 0) - Number(a.repairAgeHours || 0))
      .slice(0, 6),
    repeatRepairProperties: repeatRepairProperties
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
      .slice(0, 6),
    attentionRows: [
      ...triageOverdue.slice(0, 12).map((row) =>
        makeAttentionRow({
          itemType: "triage_over_24h",
          propertyLabel: row.propertyLabel,
          title: row.title,
          ageHours: row.ageHours,
          maintenanceRequestId: row.requestId,
          propertyId: row.propertyId,
        }),
      ),
      ...contractorAckOverdue.slice(0, 12).map((row) =>
        makeAttentionRow({
          itemType: "contractor_ack_overdue",
          propertyLabel: row.propertyLabel,
          title: row.title,
          ageHours: row.ageHours,
          workOrderId: row.id,
          propertyId: row.propertyId,
        }),
      ),
      ...stalledRepairs.slice(0, 12).map((row) =>
        makeAttentionRow({
          itemType: "stalled_in_progress_repair",
          propertyLabel: row.propertyLabel,
          title: row.title,
          ageHours: row.ageHours,
          workOrderId: row.id,
          propertyId: row.propertyId,
        }),
      ),
      ...longRunningRepairs.slice(0, 12).map((row) =>
        makeAttentionRow({
          itemType: "long_running_repair",
          propertyLabel: row.propertyLabel,
          title: row.title,
          ageHours: row.repairAgeHours,
          workOrderId: row.id,
          propertyId: row.propertyId,
        }),
      ),
    ],
  };
}

export async function getMaintenanceFinancialAnalytics(accountId) {
  if (!accountId) return emptyFinancialAnalytics();

  const monthStart = startOfCurrentMonth();
  const monthEnd = nextMonth(monthStart);

  const { data: workOrders, error } = await supabase
    .from("work_orders_with_flags")
    .select("id, property_id, contractor_name, status, quote_amount, invoice_amount, created_at, updated_at, maintenance_request_id, maintenance_requests:maintenance_request_id ( id, title )")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingBackendObject(error)) return emptyFinancialAnalytics();
  if (error) throw error;

  const rows = workOrders || [];
  const propertyIds = Array.from(new Set(rows.map((row) => row.property_id).filter(Boolean)));
  const propertyMap = await getPropertyMap(propertyIds);

  const legacyAnalytics = buildLegacyFinancialAnalytics(rows, propertyMap);

  const [{ data: expenseRows, error: expenseError }, { data: budgetRows, error: budgetError }] = await Promise.all([
    supabase
      .from("maintenance_expenses")
      .select("id, property_id, work_order_id, vendor_id, vendor_name, category, approval_state, amount, expense_date")
      .eq("account_id", accountId)
      .order("expense_date", { ascending: false })
      .limit(1000),
    supabase
      .from("maintenance_budgets")
      .select("id, budget_amount, property_id, category, period_month")
      .eq("account_id", accountId)
      .gte("period_month", monthStart.toISOString().slice(0, 10))
      .lt("period_month", monthEnd.toISOString().slice(0, 10)),
  ]);

  if (expenseError && isMissingBackendObject(expenseError)) return legacyAnalytics;
  if (expenseError) throw expenseError;
  if (budgetError && !isMissingBackendObject(budgetError)) throw budgetError;

  const expenses = (expenseRows || []).filter(
    (row) => String(row?.approval_state || "").toLowerCase() === "approved"
  );

  if (expenses.length === 0) {
    const monthBudget = (budgetRows || [])
      .filter((row) => !row.property_id && !row.category)
      .reduce((sum, row) => sum + Number(row?.budget_amount || 0), 0);

    return {
      ...legacyAnalytics,
      currentMonthBudget: monthBudget,
      currentMonthActual: 0,
      currentMonthVariance: 0 - monthBudget,
    };
  }

  const workOrderMap = new Map(rows.map((row) => [row.id, row]));
  const propertySpend = new Map();
  const contractorSpend = new Map();
  const categorySpend = new Map();
  const expensiveRepairs = [];
  const monthDefs = recentMonths(6);
  const monthSpend = new Map(monthDefs.map((month) => [month.key, 0]));
  const workOrderApprovedSpend = new Map();
  let totalSpend = 0;

  for (const row of expenses) {
    const spend = Number(row?.amount || 0);
    const linkedWorkOrder = workOrderMap.get(row.work_order_id) || null;
    const propertyLabel = propertyMap.get(row.property_id) || "—";
    const contractorLabel =
      String(row?.vendor_name || linkedWorkOrder?.contractor_name || "").trim() || "Unassigned";
    const categoryLabel = normalizeCategoryLabel(row?.category);

    totalSpend += spend;

    const propertyKey = String(row.property_id || propertyLabel);
    const currentProperty = propertySpend.get(propertyKey) || {
      propertyId: row.property_id || null,
      label: propertyLabel,
      amount: 0,
    };
    currentProperty.amount += spend;
    propertySpend.set(propertyKey, currentProperty);
    contractorSpend.set(contractorLabel, (contractorSpend.get(contractorLabel) || 0) + spend);
    categorySpend.set(categoryLabel, (categorySpend.get(categoryLabel) || 0) + spend);

    if (row.work_order_id) {
      workOrderApprovedSpend.set(
        row.work_order_id,
        (workOrderApprovedSpend.get(row.work_order_id) || 0) + spend
      );
    }

    const basisDate = new Date(row?.expense_date || Date.now());
    if (!Number.isNaN(basisDate.getTime())) {
      const key = monthKey(startOfMonth(basisDate));
      if (monthSpend.has(key)) {
        monthSpend.set(key, (monthSpend.get(key) || 0) + spend);
      }
    }
  }

  for (const [workOrderId, amount] of workOrderApprovedSpend.entries()) {
    const row = workOrderMap.get(workOrderId);
    if (!row || amount <= 0) continue;
    expensiveRepairs.push({
      id: row.id,
      propertyId: row.property_id,
      propertyLabel: propertyMap.get(row.property_id) || "—",
      contractorLabel: String(row?.contractor_name || "").trim() || "Unassigned",
      title: row?.maintenance_requests?.title || row.id,
      amount,
      status: String(row?.status || "").toLowerCase(),
      linkPath: `/work-orders/${row.id}`,
    });
  }

  const currentMonthActual = expenses.reduce((sum, row) => {
    const d = new Date(row?.expense_date || "");
    if (Number.isNaN(d.getTime())) return sum;
    return d >= monthStart && d < monthEnd ? sum + Number(row?.amount || 0) : sum;
  }, 0);

  const currentMonthBudget = (budgetRows || [])
    .filter((row) => !row.property_id && !row.category)
    .reduce((sum, row) => sum + Number(row?.budget_amount || 0), 0);

  return {
    totalSpend,
    totalQuoted: legacyAnalytics.totalQuoted,
    avgCostPerWorkOrder:
      workOrderApprovedSpend.size > 0 ? totalSpend / workOrderApprovedSpend.size : 0,
    topProperties: Array.from(propertySpend.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    topContractors: Array.from(contractorSpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    expensiveRepairs: expensiveRepairs
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    monthlySpend: monthDefs.map((month) => ({
      key: month.key,
      label: month.date.toLocaleDateString(undefined, { month: "short" }),
      amount: monthSpend.get(month.key) || 0,
    })),
    categorySpend: Array.from(categorySpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    currentMonthActual,
    currentMonthBudget,
    currentMonthVariance: currentMonthActual - currentMonthBudget,
  };
}

export async function upsertMaintenanceBudget({ accountId, budgetAmount, periodMonth, propertyId = null, category = null }) {
  if (!accountId) throw new Error("Missing account");

  const normalizedMonth = String(periodMonth || "").slice(0, 10);
  const amount = Number(budgetAmount || 0);

  if (!normalizedMonth) throw new Error("Missing period month");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid budget amount");

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    category,
    period_month: normalizedMonth,
    budget_amount: amount,
  };

  const { data: existing, error: existingError } = await supabase
    .from("maintenance_budgets")
    .select("id")
    .eq("account_id", accountId)
    .eq("period_month", normalizedMonth)
    .is("property_id", propertyId)
    .is("category", category)
    .maybeSingle();

  if (existingError && isMissingBackendObject(existingError)) {
    throw new Error("Maintenance budgets are not deployed yet.");
  }
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("maintenance_budgets")
      .update({ budget_amount: amount })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return { id: existing.id, ...payload };
  }

  const { data, error } = await supabase
    .from("maintenance_budgets")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return { id: data?.id || null, ...payload };
}

export function mapMaintenanceAttentionItems(rows = [], t, limit = 12) {
  const severityByType = {
    triage_over_24h: "urgent",
    contractor_ack_overdue: "urgent",
    stuck_waiting_over_48h: "high",
    stalled_in_progress_repair: "critical",
    long_running_repair: "high",
    high_priority_unresolved: "critical",
    request_without_work_order: "medium",
    work_order_without_contractor: "medium",
  };
  const rank = { critical: 3, high: 2, medium: 1, low: 0 };

  return (rows || [])
    .map((row) => {
      const itemType = String(row?.item_type || "").toLowerCase();
      const maintenanceRequestId = row?.maintenance_request_id || "na";
      const workOrderId = row?.work_order_id || "na";
      const ageHours = Number.isFinite(Number(row?.age_hours))
        ? Math.max(0, Math.floor(Number(row.age_hours)))
        : null;

      return {
        key: `${itemType}-${maintenanceRequestId}-${workOrderId}`,
        severity: severityByType[itemType] || "medium",
        title: t(`maintenance.attention.${itemType}`),
        detail: row?.title || t("maintenance.requestFallbackTitle"),
        property: row?.property_label || "",
        timestamp: ageHours != null ? t("maintenance.kpi.openForHours", { hours: ageHours }) : "",
        ageHours,
        linkPath:
          row?.work_order_id
            ? `/work-orders/${row.work_order_id}`
            : row?.maintenance_request_id
              ? "/maintenance-inbox"
              : row?.property_id
                ? `/properties/${row.property_id}`
                : "/maintenance-inbox",
      };
    })
    .sort((a, b) => rank[b.severity] - rank[a.severity])
    .slice(0, limit);
}
