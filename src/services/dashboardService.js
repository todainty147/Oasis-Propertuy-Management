import { supabase } from "../lib/supabase";

let dashboardHubExtrasUnavailable = false;

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function getDashboardSnapshot(accountId, { tenantId = null, horizonDays = 1 } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("dashboard_snapshot", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
    p_horizon_days: horizonDays,
  });

  if (error && isMissingBackendObject(error)) {
    return {
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
      overdue_current_window_amount: 0,
      overdue_previous_window_amount: 0,
      open_requests: 0,
      open_high_priority: 0,
      waiting_over_48h: 0,
      unassigned_work_orders: 0,
    };
  }
  if (error) throw friendly(error, "Failed to load dashboard snapshot");

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? {
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
    overdue_current_window_amount: 0,
    overdue_previous_window_amount: 0,
    open_requests: 0,
    open_high_priority: 0,
    waiting_over_48h: 0,
    unassigned_work_orders: 0,
  };
}

export async function getDashboardHubExtras(accountId, { tenantId = null, horizonDays = 1 } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (dashboardHubExtrasUnavailable) return [];

  const { data, error } = await supabase.rpc("dashboard_hub_extras", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
    p_horizon_days: horizonDays,
  });

  if (error && isMissingBackendObject(error)) {
    dashboardHubExtrasUnavailable = true;
    return [];
  }
  if (error) throw friendly(error, "Failed to load dashboard hub extras");
  return Array.isArray(data) ? data : [];
}

export function mapDashboardHubItems({
  attentionRows = [],
  dueSoonCount = 0,
  extras = [],
  leaseItems = [],
  hubHorizon = "today",
  t,
}) {
  const maxAgeHours = hubHorizon === "today" ? 24 : 7 * 24;

  const maintenanceItems = (attentionRows || [])
    .filter((row) => {
      const ageHours = Number(row?.age_hours);
      if (!Number.isFinite(ageHours)) return true;
      return ageHours <= maxAgeHours;
    })
    .slice(0, 6)
    .map((row) => ({
      id: `${row.item_type}-${row.maintenance_request_id || row.work_order_id || "na"}`,
      title: t(`maintenance.attention.${row.item_type}`),
      subtitle: row.title || row.property_label || "—",
      meta:
        row.property_label && Number.isFinite(Number(row.age_hours))
          ? `${row.property_label} • ${Math.floor(Number(row.age_hours) / 24)}d ago`
          : row.property_label || "",
      to: "/maintenance-inbox",
      sortOrder: 100,
    }));

  const extraItems = (extras || []).map((item) => {
    const type = String(item?.item_type || "").toLowerCase();
    if (type === "vacant_long_summary") {
      return {
        id: item.item_key,
        title: t("dashboard.hub.longVacant"),
        subtitle: `${item.property_label || "—"} (${item.days_vacant || 0}d)`,
        meta: item.city || "",
        to: item.link_path || "/properties?status=vacant&aging=14d",
        sortOrder: Number(item.sort_order || 10),
      };
    }

    return {
      id: item.item_key,
      title: t("dashboard.hub.dueSoon"),
      subtitle: t("dashboard.hub.dueSoonCount", {
        count: Number(item.count_value || dueSoonCount || 0),
      }),
      meta: hubHorizon === "today" ? t("dashboard.hub.range.today") : t("dashboard.hub.range.week"),
      to:
        item.link_path ||
        `/finance?status=due&range=${hubHorizon === "today" ? "1d" : "7d"}`,
      sortOrder: Number(item.sort_order || 20),
    };
  });

  const leaseHubItems = (leaseItems || []).map((item) => {
    const type = String(item?.item_type || "").toLowerCase();
    if (type === "lease_expired") {
      return {
        id: item.item_key,
        title: t("dashboard.hub.leaseExpired"),
        subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
        meta: t("dashboard.hub.leaseExpiredMeta", {
          count: Math.abs(Number(item.days_until_end || 0)),
        }),
        to: item.link_path || "/tenants",
        sortOrder: Number(item.sort_order || 15),
      };
    }
    if (type === "lease_renewal_in_progress") {
      return {
        id: item.item_key,
        title: t("dashboard.hub.leaseRenewalInProgress"),
        subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
        meta: item.lease_end_date || "",
        to: item.link_path || "/tenants",
        sortOrder: Number(item.sort_order || 25),
      };
    }
    return {
      id: item.item_key,
      title: t("dashboard.hub.leaseExpiringSoon"),
      subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
      meta: t("dashboard.hub.leaseExpiresIn", {
        count: Number(item.days_until_end || 0),
      }),
      to: item.link_path || "/tenants",
      sortOrder: Number(item.sort_order || 20),
    };
  });

  return [...extraItems, ...leaseHubItems, ...maintenanceItems]
    .sort((a, b) => Number(a.sortOrder || 100) - Number(b.sortOrder || 100))
    .slice(0, 6);
}
