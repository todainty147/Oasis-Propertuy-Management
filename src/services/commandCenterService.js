import { supabase } from "../lib/supabase";
import { getAttentionCenterData } from "./attentionCenterService";
import { getDashboardSnapshot } from "./dashboardService";
import { listPropertyOperationalHealthScores } from "./propertyHealthScoreService";

const CORE_RULE_IDS = new Set([
  "rent_overdue_watch",
  "lease_renewal_watch",
  "maintenance_triage",
  "contractor_blocked_followup",
  "contractor_ack_overdue_watch",
  "compliance_due_watch",
  "preventive_due_watch",
]);

let commandCenterItemsUnavailable = false;

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

function mapRuleCategory(ruleId) {
  switch (ruleId) {
    case "rent_overdue_watch":
      return "finance";
    case "maintenance_triage":
      return "maintenance";
    case "contractor_blocked_followup":
    case "contractor_ack_overdue_watch":
      return "contractor";
    case "lease_renewal_watch":
      return "lease";
    case "compliance_due_watch":
      return "compliance";
    case "preventive_due_watch":
      return "preventive";
    case "property_health_watch":
      return "portfolio";
    default:
      return "general";
  }
}

function mapSeverityToBucket(severity) {
  const normalized = normalize(severity);
  if (normalized === "urgent") return "urgent";
  if (normalized === "action") return "action";
  return "recent";
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

function getAutomationEntityLabels(row) {
  const details = row?.details || {};
  return {
    propertyLabel: details.property_label || details.propertyLabel || "",
    tenantLabel: details.tenant_label || details.tenantLabel || "",
    entityLabel: details.request_title || details.title || "",
  };
}

function mapAutomationRunItem(row) {
  const labels = getAutomationEntityLabels(row);
  return {
    id: `automation-${row.id}`,
    kind: row.rule_id || "automation_signal",
    category: mapRuleCategory(row.rule_id),
    severity: normalize(row.severity) || "action",
    bucket: mapSeverityToBucket(row.severity),
    entityType: row.entity_type || "automation",
    entityId: row.entity_id || null,
    title: row.title || row.rule_id || "Automation signal",
    body: row.body || "",
    linkPath: row.link_path || "",
    createdAt: row.first_triggered_at || row.last_triggered_at || row.created_at || null,
    resolvedState: normalize(row.state) === "resolved",
    source: "automation_runs",
    propertyId: labels.propertyLabel ? null : null,
    propertyLabel: labels.propertyLabel,
    tenantLabel: labels.tenantLabel,
    entityLabel: labels.entityLabel,
    amount: 0,
    ageHours: null,
    dueDays: null,
    sourceLabel: "automation",
  };
}

async function listCommandCenterAutomationRuns(accountId, limit = 24) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("automation_runs")
    .select(`
      id,
      rule_id,
      state,
      severity,
      title,
      body,
      entity_type,
      entity_id,
      link_path,
      details,
      first_triggered_at,
      last_triggered_at,
      created_at
    `)
    .eq("account_id", accountId)
    .eq("state", "open")
    .order("last_triggered_at", { ascending: false })
    .limit(limit);

  if (error) {
    const message = String(error?.message || "").toLowerCase();
    if (
      error?.code === "PGRST404" ||
      error?.code === "42501" ||
      message.includes("does not exist") ||
      message.includes("permission denied")
    ) {
      return [];
    }
    throw error;
  }

  return (data || [])
    .filter((row) => row?.rule_id === "property_health_watch" || !CORE_RULE_IDS.has(row?.rule_id))
    .map(mapAutomationRunItem);
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

function dedupeItems(items = []) {
  const seen = new Map();

  for (const item of items) {
    const dedupeKey =
      item?.source === "automation_runs"
        ? `automation:${item.id}`
        : [
            item?.kind || "",
            item?.entityType || "",
            item?.entityId || "",
            item?.linkPath || "",
            item?.title || "",
          ].join(":");

    if (!seen.has(dedupeKey)) {
      seen.set(dedupeKey, item);
    }
  }

  return Array.from(seen.values());
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

  if (!commandCenterItemsUnavailable) {
    const [snapshot, rpcRes, propertyHealthRows] = await Promise.all([
      getDashboardSnapshot(accountId, { horizonDays: 7 }),
      supabase.rpc("command_center_items", {
        p_account_id: accountId,
        p_limit: 80,
      }),
      listPropertyOperationalHealthScores(accountId, { limit: 200 }),
    ]);

    if (rpcRes.error && isMissingBackendObject(rpcRes.error)) {
      commandCenterItemsUnavailable = true;
    } else if (rpcRes.error) {
      throw rpcRes.error;
    } else {
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
  }

  const [attentionData, automationItems] = await Promise.all([
    getAttentionCenterData(accountId),
    listCommandCenterAutomationRuns(accountId),
  ]);

  const mergedItems = dedupeItems([...(attentionData?.items || []), ...automationItems]);
  const urgent = sortItems(mergedItems.filter((item) => item.bucket === "urgent")).slice(0, 12);
  const action = sortItems(mergedItems.filter((item) => item.bucket === "action")).slice(0, 12);
  const upcoming = sortItems(mergedItems.filter((item) => item.bucket === "upcoming")).slice(0, 12);
  const recent = sortItems(mergedItems.filter((item) => item.bucket === "recent")).slice(0, 12);

  return {
    ...attentionData,
    items: mergedItems,
    groups: {
      urgent,
      action,
      upcoming,
      recent,
    },
    summary: {
      ...(attentionData?.summary || {}),
      urgentCount: urgent.length,
      actionCount: action.length,
      upcomingCount: upcoming.length,
      recentCount: recent.length,
      automationCount: automationItems.length,
    },
    categoryCounts: countByCategory(mergedItems),
    automationItems,
  };
}
