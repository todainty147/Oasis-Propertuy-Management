import { supabase } from "../lib/supabase";
import { getComplianceAttention } from "./complianceService";
import { getDashboardSnapshot } from "./dashboardService";
import { getLeaseAttentionItems } from "./leaseService";
import { getMaintenanceAttention } from "./maintenanceDashboardService";
import { getPreventiveMaintenanceAttention } from "./preventiveMaintenanceService";
import { listPropertyOperationalHealthScores } from "./propertyHealthScoreService";

let attentionCenterItemsUnavailable = false;

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column")
  );
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function inferEntityFromLinkPath(linkPath) {
  const value = String(linkPath || "").trim();
  const patterns = [
    { prefix: "/tenants/", entityType: "tenant" },
    { prefix: "/properties/", entityType: "property" },
    { prefix: "/work-orders/", entityType: "work_order" },
  ];

  for (const pattern of patterns) {
    if (!value.startsWith(pattern.prefix)) continue;
    const entityId = value.slice(pattern.prefix.length).split("?")[0] || null;
    return {
      entityType: pattern.entityType,
      entityId,
    };
  }

  return {
    entityType: "portfolio",
    entityId: null,
  };
}

function deriveAttentionCategory(kind, source) {
  const normalizedKind = normalize(kind);
  const normalizedSource = normalize(source);

  if (normalizedKind.includes("rent") || normalizedSource === "payments") return "finance";
  if (normalizedKind.startsWith("lease")) return "lease";
  if (normalizedKind.startsWith("preventive")) return "preventive";
  if (normalizedKind.startsWith("compliance")) return "compliance";
  if (
    [
      "contractor_no_response",
      "work_order_without_contractor",
      "work_order_blocked_follow_up",
      "contractor_ack_overdue",
    ].includes(normalizedKind)
  ) {
    return "contractor";
  }
  if (normalizedKind === "notification_alert") return "general";
  return "maintenance";
}

function deriveAttentionSeverity(kind, bucket) {
  if (normalize(bucket) === "urgent") return "urgent";
  if (normalize(bucket) === "action") return "action";
  if (normalize(kind) === "notification_alert") return "info";
  return "info";
}

function enrichAttentionItem(item) {
  const inferred = inferEntityFromLinkPath(item?.linkPath);
  return {
    ...item,
    category: item?.category || deriveAttentionCategory(item?.kind, item?.source),
    severity: item?.severity || deriveAttentionSeverity(item?.kind, item?.bucket),
    entityType: item?.entityType || inferred.entityType,
    entityId: item?.entityId || inferred.entityId,
    title: item?.title || item?.kind || "",
    createdAt: item?.createdAt || null,
    resolvedState: item?.resolvedState === true,
    sourceLabel: item?.source === "notifications" ? "notifications" : item?.source,
  };
}

function hoursSince(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 3600000));
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function isCompletedWorkOrderStatus(status) {
  return ["completed", "cancelled", "zakończone", "anulowane"].includes(normalize(status));
}

function isAssignedWorkOrderStatus(status) {
  return ["assigned", "przypisane"].includes(normalize(status));
}

function isInProgressWorkOrderStatus(status) {
  return ["in_progress", "w trakcie"].includes(normalize(status));
}

function isOverduePaymentRow(row) {
  const status = normalize(row?.status);
  if (["overdue", "zaległe"].includes(status)) return true;
  if (row?.paid_at) return false;
  const due = row?.due_date ? new Date(`${row.due_date}T00:00:00`) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function isDueSoonPaymentRow(row, horizonDays = 7) {
  if (row?.paid_at || isOverduePaymentRow(row)) return false;
  const due = row?.due_date ? new Date(`${row.due_date}T00:00:00`) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays);
  return due >= today && due <= horizon;
}

function normalizeMaintenanceItem(row) {
  const type = normalize(row?.item_type);
  const item = {
    id: `maint-${type}-${row?.maintenance_request_id || row?.work_order_id || "na"}`,
    kind: type,
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantLabel: "",
    entityLabel: row?.title || "",
    amount: 0,
    ageHours: Number.isFinite(Number(row?.age_hours)) ? Number(row.age_hours) : null,
    dueDays: null,
    linkPath:
      row?.link_path ||
      (row?.work_order_id
        ? `/work-orders/${row.work_order_id}`
        : row?.property_id
          ? `/properties/${row.property_id}`
          : "/maintenance-inbox"),
    source: "maintenance",
    bucket: "action",
    createdAt: row?.created_at || row?.updated_at || null,
    resolvedState: false,
  };

  if (type === "high_priority_unresolved" || type === "stuck_waiting_over_48h") {
    item.bucket = "urgent";
  } else if (["triage_over_24h", "contractor_ack_overdue", "stalled_in_progress_repair"].includes(type)) {
    item.bucket = "urgent";
  } else if (
    ["request_without_work_order", "work_order_without_contractor", "long_running_repair", "repeated_repairs_property"].includes(type)
  ) {
    item.bucket = "action";
  }

  return item;
}

function normalizeRpcItem(row) {
  return {
    id: row?.item_key || `${row?.item_type || "item"}-${row?.source_table || "src"}`,
    kind: row?.item_type || "",
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantLabel: row?.tenant_label || "",
    entityLabel: row?.entity_label || "",
    amount: Number(row?.amount || 0),
    ageHours: Number.isFinite(Number(row?.age_hours)) ? Number(row.age_hours) : null,
    dueDays: Number.isFinite(Number(row?.due_days)) ? Number(row.due_days) : null,
    linkPath: row?.link_path || "",
    source: row?.source_table || "",
    bucket: row?.bucket || "action",
    createdAt: null,
    resolvedState: false,
  };
}

function normalizePreventiveItem(row) {
  const type = normalize(row?.item_type);
  return {
    id: row?.item_key || `preventive-${type}-${row?.property_id || "na"}`,
    kind: type,
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantLabel: "",
    entityLabel: row?.title || "",
    amount: 0,
    ageHours: null,
    dueDays: Number.isFinite(Number(row?.days_until_due)) ? Number(row.days_until_due) : null,
    linkPath: row?.link_path || (row?.property_id ? `/properties/${row.property_id}` : "/maintenance-kpi"),
    source: "preventive_maintenance_tasks",
    bucket: type === "preventive_task_overdue" ? "urgent" : "upcoming",
    contractorLabel: row?.assigned_to_label || "",
    body: row?.category || "",
    createdAt: row?.created_at || null,
    resolvedState: false,
  };
}

function normalizeComplianceItem(row) {
  return {
    id: row?.item_key || `compliance-${row?.property_id || row?.tenant_id || "na"}`,
    kind: row?.item_type || "compliance_due_soon",
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantLabel: row?.tenant_label || "",
    entityLabel: row?.title || "",
    amount: 0,
    ageHours: null,
    dueDays: Number.isFinite(Number(row?.due_days)) ? Number(row.due_days) : null,
    linkPath: row?.link_path || "/dashboard",
    source: "compliance_items",
    bucket:
      row?.item_type === "compliance_overdue"
        ? "urgent"
        : row?.item_type === "compliance_missing_setup"
          ? "action"
          : "upcoming",
    body: row?.category || "",
    createdAt: row?.created_at || null,
    resolvedState: false,
  };
}

function normalizeLeaseItem(row) {
  const type = normalize(row?.item_type);
  return {
    id: row?.item_key || `lease-${type}-${row?.tenant_label || "na"}`,
    kind: type,
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantLabel: row?.tenant_label || "",
    entityLabel: "",
    amount: 0,
    ageHours: null,
    dueDays: Number.isFinite(Number(row?.days_until_end)) ? Number(row.days_until_end) : null,
    linkPath: row?.link_path || "/tenants",
    source: "lease",
    bucket:
      type === "lease_expired"
        ? "urgent"
        : type === "lease_expiring_soon"
          ? "upcoming"
          : "action",
    createdAt: row?.created_at || null,
    resolvedState: false,
  };
}

function normalizePaymentItem(row, kind) {
  const dueDays = daysUntil(row?.due_date);
  return {
    id: `payment-${kind}-${row.id}`,
    kind,
    propertyId: row?.property_id || null,
    propertyLabel: row?.properties?.address || "",
    tenantLabel: row?.tenants?.name || "",
    entityLabel: "",
    amount: Number(row?.amount || 0),
    ageHours: kind === "overdue_rent" && dueDays != null && dueDays < 0 ? Math.abs(dueDays) * 24 : null,
    dueDays,
    linkPath: row?.tenant_id ? `/tenants/${row.tenant_id}` : "/finance",
    source: "payments",
    bucket: kind === "overdue_rent" ? "urgent" : "upcoming",
    createdAt: row?.created_at || row?.due_date || null,
    resolvedState: false,
  };
}

function normalizeNotificationItem(row) {
  return {
    id: `notification-${row.id}`,
    kind: "notification_alert",
    propertyId: null,
    propertyLabel: "",
    tenantLabel: "",
    entityLabel: row?.title || "",
    amount: 0,
    ageHours: hoursSince(row?.created_at),
    dueDays: null,
    linkPath: row?.link_path || "",
    source: "notifications",
    bucket: "recent",
    body: row?.body || "",
    createdAt: row?.created_at || null,
    resolvedState: !!row?.is_read,
  };
}

function normalizeWorkOrderGapItem(row, kind) {
  return {
    id: `wo-gap-${kind}-${row.id}`,
    kind,
    propertyId: row?.property_id || null,
    propertyLabel: row?.propertyLabel || "",
    tenantLabel: "",
    entityLabel: row?.maintenance_requests?.title || "",
    amount: 0,
    ageHours: hoursSince(row?.updated_at || row?.created_at),
    dueDays: row?.scheduled_at ? daysUntil(String(row.scheduled_at).slice(0, 10)) : null,
    linkPath: `/work-orders/${row.id}`,
    source: "work_orders",
    bucket:
      kind === "work_order_overdue" ||
      kind === "contractor_no_response" ||
      kind === "stalled_in_progress_repair"
        ? "urgent"
        : kind === "work_order_blocked_follow_up" || kind === "long_running_repair"
          ? "action"
          : "recent",
    contractorLabel: row?.contractor_name || "",
    createdAt: row?.created_at || null,
    resolvedState: false,
  };
}

function propertyIssueRows(items = []) {
  const counts = new Map();
  for (const item of items) {
    const label = String(item?.propertyLabel || "").trim();
    if (!label) continue;
    const key = item?.propertyId || label;
    const current = counts.get(key) || { id: item?.propertyId || null, label, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

export async function getAttentionCenterData(accountId) {
  if (!accountId) {
    return {
      summary: {
        urgentCount: 0,
        actionCount: 0,
        upcomingCount: 0,
        recentCount: 0,
        propertiesWithIssuesCount: 0,
        unreadAlertsCount: 0,
        overdueAmount: 0,
      },
      groups: { urgent: [], action: [], upcoming: [], recent: [] },
      propertyIssues: [],
      snapshot: null,
    };
  }

  if (!attentionCenterItemsUnavailable) {
    const [snapshot, rpcRes, propertyHealthRows] = await Promise.all([
      getDashboardSnapshot(accountId, { horizonDays: 7 }),
      supabase.rpc("attention_center_items", {
        p_account_id: accountId,
        p_limit: 60,
      }),
      listPropertyOperationalHealthScores(accountId, { limit: 200 }),
    ]);

    if (rpcRes.error && isMissingBackendObject(rpcRes.error)) {
      attentionCenterItemsUnavailable = true;
    } else if (rpcRes.error) {
      throw rpcRes.error;
    } else {
      const items = Array.isArray(rpcRes.data) ? rpcRes.data.map(normalizeRpcItem).map(enrichAttentionItem) : [];
      const groups = {
        urgent: items.filter((item) => item.bucket === "urgent").slice(0, 12),
        action: items.filter((item) => item.bucket === "action").slice(0, 12),
        upcoming: items.filter((item) => item.bucket === "upcoming").slice(0, 12),
        recent: items.filter((item) => item.bucket === "recent").slice(0, 12),
      };
      const actionableItems = [...groups.urgent, ...groups.action, ...groups.upcoming];
      const propertyIssues = propertyIssueRows(actionableItems);
      const healthByProperty = new Map((propertyHealthRows || []).map((row) => [row.propertyId, row]));
      const unreadAlertsCount = items.filter((item) => item.kind === "notification_alert").length;

      return {
        summary: {
          urgentCount: groups.urgent.length,
          actionCount: groups.action.length,
          upcomingCount: groups.upcoming.length,
          recentCount: groups.recent.length,
          propertiesWithIssuesCount: propertyIssues.length,
          unreadAlertsCount,
          overdueAmount: Number(snapshot?.overdue_amount || 0),
        },
        groups,
        propertyIssues: propertyIssues.map((row) => {
          const health = healthByProperty.get(row.id) || null;
          return {
            ...row,
            score: health?.score ?? null,
            category: health?.category || null,
            linkPath: row.id ? `/properties/${row.id}` : "",
          };
        }),
        items,
        snapshot,
      };
    }
  }

  const [
    snapshot,
    maintenanceRows,
    leaseRows,
    preventiveRows,
    complianceRows,
    paymentsRes,
    workOrdersRes,
    notificationsRes,
    propertyHealthRows,
  ] = await Promise.all([
    getDashboardSnapshot(accountId, { horizonDays: 7 }),
    getMaintenanceAttention(accountId),
    getLeaseAttentionItems(accountId, 12),
    getPreventiveMaintenanceAttention(accountId, { dueSoonDays: 14, limit: 12 }),
    getComplianceAttention(accountId, { dueSoonDays: 30, limit: 12 }),
    supabase
      .from("payments")
      .select("id, amount, status, due_date, paid_at, tenant_id, property_id, tenants(name), properties(address)")
      .eq("account_id", accountId)
      .order("due_date", { ascending: true })
      .limit(200),
    supabase
      .from("work_orders")
      .select("id, contractor_user_id, contractor_name, status, scheduled_at, created_at, updated_at, property_id, acknowledgement_due_at, acknowledgement_status, maintenance_requests:maintenance_request_id(title)")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("notifications")
      .select("id, title, body, link_path, is_read, created_at")
      .eq("account_id", accountId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(12),
    listPropertyOperationalHealthScores(accountId, { limit: 200 }),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (workOrdersRes.error && !isMissingBackendObject(workOrdersRes.error)) throw workOrdersRes.error;
  if (notificationsRes.error && !isMissingBackendObject(notificationsRes.error)) throw notificationsRes.error;

  const workOrderPropertyIds = Array.from(
    new Set((workOrdersRes.data || []).map((row) => row.property_id).filter(Boolean))
  );
  let propertyMap = new Map();
  if (workOrderPropertyIds.length > 0) {
    const { data: propertyRows, error: propertyError } = await supabase
      .from("properties")
      .select("id, address")
      .in("id", workOrderPropertyIds);
    if (propertyError) throw propertyError;
    propertyMap = new Map((propertyRows || []).map((row) => [row.id, row.address || ""]));
  }

  const items = [];

  for (const row of maintenanceRows || []) items.push(normalizeMaintenanceItem(row));
  for (const row of leaseRows || []) items.push(normalizeLeaseItem(row));
  for (const row of preventiveRows || []) items.push(normalizePreventiveItem(row));
  for (const row of complianceRows || []) items.push(normalizeComplianceItem(row));

  for (const row of paymentsRes.data || []) {
    if (isOverduePaymentRow(row)) {
      items.push(normalizePaymentItem(row, "overdue_rent"));
    } else if (isDueSoonPaymentRow(row, 7)) {
      items.push(normalizePaymentItem(row, "due_soon_rent"));
    }
  }

  for (const row of workOrdersRes.data || []) {
    const withProperty = {
      ...row,
      propertyLabel: propertyMap.get(row.property_id) || "",
    };
    const age = hoursSince(row?.updated_at || row?.created_at);
    const dueDays = row?.scheduled_at ? daysUntil(String(row.scheduled_at).slice(0, 10)) : null;
    const hasContractor = !!(row?.contractor_user_id || row?.contractor_name);
    const status = normalize(row?.status);
    const ackStatus = normalize(row?.acknowledgement_status);
    const ackDueDays = row?.acknowledgement_due_at
      ? daysUntil(String(row.acknowledgement_due_at).slice(0, 10))
      : null;

    if (
      hasContractor &&
      ackStatus !== "acknowledged" &&
      ackDueDays != null &&
      ackDueDays < 0
    ) {
      items.push(normalizeWorkOrderGapItem(withProperty, "contractor_no_response"));
      continue;
    }

    if (!isCompletedWorkOrderStatus(status) && dueDays != null && dueDays < 0) {
      items.push(normalizeWorkOrderGapItem(withProperty, "work_order_overdue"));
      continue;
    }

    if (
      !isCompletedWorkOrderStatus(status) &&
      Number.isFinite(age) &&
      age >= 72 &&
      (isInProgressWorkOrderStatus(status) || status === "blocked" || status === "zablokowane")
    ) {
      items.push(normalizeWorkOrderGapItem(withProperty, "stalled_in_progress_repair"));
      continue;
    }

    if (
      !isCompletedWorkOrderStatus(status) &&
      Number.isFinite(hoursSince(row?.created_at)) &&
      hoursSince(row?.created_at) >= 14 * 24
    ) {
      items.push(normalizeWorkOrderGapItem(withProperty, "long_running_repair"));
      continue;
    }

    if (status === "blocked" || status === "zablokowane") {
      items.push(normalizeWorkOrderGapItem(withProperty, "work_order_blocked_follow_up"));
      continue;
    }

    if (
      !isCompletedWorkOrderStatus(status) &&
      Number.isFinite(age) &&
      age <= 72 &&
      (isAssignedWorkOrderStatus(status) || isInProgressWorkOrderStatus(status))
    ) {
      items.push(normalizeWorkOrderGapItem(withProperty, "recently_updated_open"));
    }
  }

  for (const row of notificationsRes.data || []) {
    items.push(normalizeNotificationItem(row));
  }

  const deduped = Array.from(new Map(items.map((item) => [item.id, item])).values()).map(enrichAttentionItem);
  const groups = {
    urgent: deduped.filter((item) => item.bucket === "urgent").slice(0, 12),
    action: deduped.filter((item) => item.bucket === "action").slice(0, 12),
    upcoming: deduped.filter((item) => item.bucket === "upcoming").slice(0, 12),
    recent: deduped
      .filter((item) => item.bucket === "recent")
      .sort((a, b) => (a.ageHours || 0) - (b.ageHours || 0))
      .slice(0, 12),
  };

  const actionableItems = [...groups.urgent, ...groups.action, ...groups.upcoming];
  const propertyIssues = propertyIssueRows(actionableItems);
  const healthByProperty = new Map((propertyHealthRows || []).map((row) => [row.propertyId, row]));

  return {
    summary: {
      urgentCount: groups.urgent.length,
      actionCount: groups.action.length,
      upcomingCount: groups.upcoming.length,
      recentCount: groups.recent.length,
      propertiesWithIssuesCount: propertyIssues.length,
      unreadAlertsCount: (notificationsRes.data || []).length,
      overdueAmount: Number(snapshot?.overdue_amount || 0),
    },
    groups,
    propertyIssues: propertyIssues.map((row) => {
      const health = healthByProperty.get(row.id) || null;
      return {
        ...row,
        score: health?.score ?? null,
        category: health?.category || null,
        linkPath: row.id ? `/properties/${row.id}` : "",
      };
    }),
    items: deduped,
    snapshot,
  };
}
