import { supabase } from "../lib/supabase";
import { getDashboardSnapshot } from "./dashboardService";
import { listPropertyOperationalHealthScores } from "./propertyHealthScoreService";
import { parseAttentionCenterItemRow, parseRpcRows } from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

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

function normalizeRpcItem(row) {
  return {
    id: row.item_key || `${row.item_type || "item"}-${row.source_table || "src"}`,
    kind: row.item_type || "",
    title: row.title || "",
    body: row.body || "",
    createdAt: row.created_at || null,
    metadata: row.metadata || {},
    propertyId: row.property_id || null,
    propertyLabel: row.property_label || "",
    tenantLabel: row.tenant_label || "",
    entityLabel: row.entity_label || "",
    amount: row.amount || 0,
    ageHours: row.age_hours,
    dueDays: row.due_days,
    linkPath: row.link_path || "",
    source: row.source_table || "",
    bucket: row.bucket || "action",
    resolvedState: false,
  };
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
      items: [],
      snapshot: null,
    };
  }

  const [snapshot, rpcRes, propertyHealthRows] = await Promise.all([
    getDashboardSnapshot(accountId, { horizonDays: 7 }),
    supabase.rpc("attention_center_items", {
      p_account_id: accountId,
      p_limit: 60,
    }),
    listPropertyOperationalHealthScores(accountId, { limit: 200 }),
  ]);

  if (rpcRes.error) {
    if (isMissingBackendObject(rpcRes.error)) {
      throw new Error("attention_center_items RPC is not deployed. Run supabase/attention_center_items.sql.");
    }
    logSecurityRelevantFailure("attention_center_items", {
      error: rpcRes.error,
      context: { accountId },
    });
    throw rpcRes.error;
  }

  const items = parseRpcRows(
    rpcRes.data || [],
    parseAttentionCenterItemRow,
    "attention_center_items rows",
  )
    .map(normalizeRpcItem)
    .map(enrichAttentionItem);

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
