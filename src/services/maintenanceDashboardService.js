import { supabase } from "../lib/supabase";

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function getMaintenanceAttention(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase.rpc("maintenance_attention_needed", {
    p_account_id: accountId,
  });
  if (error && isMissingBackendObject(error)) return [];
  if (error) throw error;
  return Array.isArray(data) ? data : [];
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

export async function getMaintenanceKpiSnapshot(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase.rpc("maintenance_kpi_snapshot", {
    p_account_id: accountId,
  });
  if (error && isMissingBackendObject(error)) {
    return {
      open_requests: 0,
      active_work_orders: 0,
      awaiting_action: 0,
      resolved_pending_closure: 0,
      open_high_priority: 0,
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
  }
  if (error) throw error;
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

export function mapMaintenanceAttentionItems(rows = [], t, limit = 12) {
  const severityByType = {
    stuck_waiting_over_48h: "high",
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
        linkPath: row?.work_order_id ? `/work-orders/${row.work_order_id}` : "/maintenance-inbox",
      };
    })
    .sort((a, b) => rank[b.severity] - rank[a.severity])
    .slice(0, limit);
}
