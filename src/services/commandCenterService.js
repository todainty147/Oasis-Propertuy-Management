import { supabase } from "../lib/supabase";
import { getDashboardSnapshot } from "./dashboardService";
import { listPropertyOperationalHealthScores } from "./propertyHealthScoreService";
import { logSecurityRelevantFailure } from "./securityFailureLogger";
import { parseCommandCenterItemRow, parseRpcRows } from "./rpcContracts";

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
    id: row.item_key,
    kind: row.item_type,
    category: row.category,
    severity: row.severity,
    bucket: row.bucket,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    createdAt: row.created_at,
    resolvedState: row.resolved_state,
    source: row.source_table,
    propertyId: row.property_id,
    propertyLabel: row.property_label,
    tenantId: row.tenant_id,
    tenantLabel: row.tenant_label,
    entityLabel: row.entity_label,
    contractorLabel: row.contractor_label,
    amount: row.amount,
    ageHours: row.age_hours,
    dueDays: row.due_days,
    sourceLabel: row.source_table,
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

// Maps a list_rr_attention_items row to the same shape as normalizeRpcItem.
function normalizeRrAttentionItem(row) {
  const dueDays = Number.isFinite(Number(row.due_days)) ? Number(row.due_days) : 30;
  // Derive a sort-stable createdAt: items due sooner appear more recent so they
  // rank above far-future items within the same bucket after .slice(0, 12).
  const createdAt = new Date(Date.now() - Math.max(0, dueDays - 1) * 86_400_000).toISOString();

  return {
    id:              String(row.item_key || ""),
    kind:            String(row.item_type || ""),
    category:        "compliance",
    severity:        row.bucket === "urgent" ? "urgent" : "action",
    bucket:          String(row.bucket || "action"),
    entityType:      null,
    entityId:        null,
    title:           null,
    body:            null,
    linkPath:        String(row.link_path || ""),
    createdAt,
    resolvedState:   null,
    source:          String(row.source_table || "renters_rights_tasks"),
    propertyId:      null,
    propertyLabel:   String(row.property_label || ""),
    tenantId:        null,
    tenantLabel:     String(row.tenant_label || ""),
    entityLabel:     String(row.entity_label || ""),
    contractorLabel: null,
    amount:          Number(row.amount || 0),
    ageHours:        Number(row.age_hours || 0),
    dueDays,
    sourceLabel:     "renters_rights_tasks",
  };
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

  // RR items: direct RPC call, no extra import, fully isolated from main Promise.all.
  // Any failure (missing function, feature gate, network) must never suppress AI cards.
  const rrRows = await supabase
    .rpc("list_rr_attention_items", { p_account_id: accountId, p_limit: 20 })
    .then((res) => res.data ?? [])
    .catch((err) => { console.warn("[CommandCenter] list_rr_attention_items:", err?.message ?? err); return []; });

  if (rpcRes.error) {
    if (isMissingBackendObject(rpcRes.error)) {
      throw new Error("command_center_items RPC is not deployed. Run supabase/command_center_items.sql.");
    }
    logSecurityRelevantFailure("command_center_items", {
      error: rpcRes.error,
      context: { accountId },
    });
    throw rpcRes.error;
  }

  const rrItems = (rrRows || []).map(normalizeRrAttentionItem);

  const items = [
    ...parseRpcRows(
      rpcRes.data || [],
      parseCommandCenterItemRow,
      "command_center_items rows",
    ).map(normalizeRpcItem),
    ...rrItems,
  ];
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
