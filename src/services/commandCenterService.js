import { supabase } from "../lib/supabase";
import { getDashboardSnapshot } from "./dashboardService";
import { listPropertyOperationalHealthScores } from "./propertyHealthScoreService";

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

function normalizeRpcItem(row) {
  return {
    id: row?.item_key || "",
    kind: row?.item_type || "",
    category: row?.category || "general",
    severity: row?.severity || "info",
    bucket: row?.bucket || "action",
    entityType: row?.entity_type || "portfolio",
    entityId: row?.entity_id || null,
    title: row?.title || row?.item_type || "Signal",
    body: row?.body || "",
    linkPath: row?.link_path || "",
    createdAt: row?.created_at || null,
    resolvedState: !!row?.resolved_state,
    source: row?.source_table || "",
    propertyId: row?.property_id || null,
    propertyLabel: row?.property_label || "",
    tenantId: row?.tenant_id || null,
    tenantLabel: row?.tenant_label || "",
    entityLabel: row?.entity_label || "",
    contractorLabel: row?.contractor_label || "",
    amount: Number(row?.amount || 0),
    ageHours: Number.isFinite(Number(row?.age_hours)) ? Number(row.age_hours) : null,
    dueDays: Number.isFinite(Number(row?.due_days)) ? Number(row.due_days) : null,
    sourceLabel: row?.source_table || "",
  };
}

function sortItems(items = []) {
  return [...items].sort((a, b) => {
    const severityRank = { urgent: 0, action: 1, info: 2 };
    const severityDelta = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
    if (severityDelta !== 0) return severityDelta;

    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;

    const dueA = Number.isFinite(a.dueDays) ? a.dueDays : 99999;
    const dueB = Number.isFinite(b.dueDays) ? b.dueDays : 99999;
    if (dueA !== dueB) return dueA - dueB;

    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function countByCategory(items = []) {
  return items.reduce((acc, item) => {
    const key = item.category || "general";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export async function getCommandCenterData(accountId) {
  if (!accountId) {
    return {
      summary: {
        urgentCount: 0,
        actionCount: 0,
        upcomingCount: 0,
        recentCount: 0,
        automationCount: 0,
        propertiesWithIssuesCount: 0,
        unreadAlertsCount: 0,
        overdueAmount: 0,
      },
      groups: { urgent: [], action: [], upcoming: [], recent: [] },
      propertyIssues: [],
      items: [],
      categoryCounts: {},
      automationItems: [],
      snapshot: null,
    };
  }

  const [snapshot, rpcRes, propertyHealthRows] = await Promise.all([
    getDashboardSnapshot(accountId, { horizonDays: 7 }),
    supabase.rpc("command_center_items", {
      p_account_id: accountId,
      p_limit: 80,
    }),
    listPropertyOperationalHealthScores(accountId, { limit: 200 }),
  ]);

  if (rpcRes.error) {
    if (isMissingBackendObject(rpcRes.error)) {
      throw new Error("command_center_items RPC is not deployed. Run supabase/command_center_items.sql.");
    }
    throw rpcRes.error;
  }

  const items = (rpcRes.data || []).map(normalizeRpcItem);
  const urgent = sortItems(items.filter((item) => item.bucket === "urgent")).slice(0, 12);
  const action = sortItems(items.filter((item) => item.bucket === "action")).slice(0, 12);
  const upcoming = sortItems(items.filter((item) => item.bucket === "upcoming")).slice(0, 12);
  const recent = sortItems(items.filter((item) => item.bucket === "recent")).slice(0, 12);
  const actionableItems = [...urgent, ...action, ...upcoming];
  const healthByProperty = new Map((propertyHealthRows || []).map((row) => [row.propertyId, row]));
  const propertyCounts = new Map();

  for (const item of actionableItems) {
    const key = item?.propertyId || null;
    const label = String(item?.propertyLabel || "").trim();
    if (!key && !label) continue;
    const mapKey = key || label;
    const current = propertyCounts.get(mapKey) || { id: key, label, count: 0 };
    current.count += 1;
    propertyCounts.set(mapKey, current);
  }

  const propertyIssues = Array.from(propertyCounts.values())
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)))
    .slice(0, 8)
    .map((row) => {
      const health = healthByProperty.get(row.id) || null;
      return {
        ...row,
        score: health?.score ?? null,
        category: health?.category || null,
        linkPath: row.id ? `/properties/${row.id}` : "",
      };
    });

  const automationItems = items.filter((item) => item.source === "automation_runs");

  return {
    summary: {
      urgentCount: urgent.length,
      actionCount: action.length,
      upcomingCount: upcoming.length,
      recentCount: recent.length,
      automationCount: automationItems.length,
      propertiesWithIssuesCount: propertyIssues.length,
      unreadAlertsCount: items.filter((item) => item.source === "notifications").length,
      overdueAmount: Number(snapshot?.overdue_amount || 0),
    },
    groups: { urgent, action, upcoming, recent },
    propertyIssues,
    items,
    categoryCounts: countByCategory(items),
    automationItems,
    snapshot,
  };
}
