import { supabase } from "../lib/supabase";
import { getDashboardSnapshot } from "./dashboardService";
import { getDerivedLeaseStatus, listLeases } from "./leaseService";
import { getMaintenanceKpiSnapshot } from "./maintenanceDashboardService";
import {
  getPreventiveMaintenanceOverview,
  listPreventiveMaintenanceTasks,
} from "./preventiveMaintenanceService";

let automationRuleSettingsUnavailable = false;
let automationRunsUnavailable = false;

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function isPermissionDenied(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42501" || message.includes("permission denied");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toDateOnly(value) {
  if (!value) return null;
  const next = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(next.getTime()) ? null : next;
}

function daysUntil(value) {
  const target = toDateOnly(value);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function todayDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatShortDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function isOverduePayment(row, graceDays = 0) {
  const status = normalize(row?.status);
  if (row?.paid_at) return false;
  if (status === "overdue" || status === "zaległe") return true;
  const due = toDateOnly(row?.due_date);
  if (!due) return false;
  const diff = Math.round((todayDate().getTime() - due.getTime()) / 86400000);
  return diff > Math.max(0, Number(graceDays || 0));
}

function clampInt(value, fallback, min = 0, max = 365) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
}

function safeConfigValue(config, key, fallback, min = 0, max = 365) {
  return clampInt(config?.[key], fallback, min, max);
}

const RULE_DEFS = [
  {
    id: "rent_overdue_watch",
    titleKey: "playbooks.rule.rentOverdue.title",
    descriptionKey: "playbooks.rule.rentOverdue.description",
    triggerKey: "playbooks.rule.rentOverdue.trigger",
    thresholdKey: "playbooks.rule.rentOverdue.threshold",
    outputs: ["attention_center", "dashboard", "portfolio_health"],
    defaultConfig: { grace_days: 0 },
    configFields: [
      {
        key: "grace_days",
        labelKey: "playbooks.config.graceDays",
        unitKey: "playbooks.unit.days",
        min: 0,
        max: 30,
      },
    ],
  },
  {
    id: "lease_renewal_watch",
    titleKey: "playbooks.rule.leaseRenewal.title",
    descriptionKey: "playbooks.rule.leaseRenewal.description",
    triggerKey: "playbooks.rule.leaseRenewal.trigger",
    thresholdKey: "playbooks.rule.leaseRenewal.threshold",
    outputs: ["attention_center", "dashboard", "portfolio_health"],
    defaultConfig: { lead_days: 60 },
    configFields: [
      {
        key: "lead_days",
        labelKey: "playbooks.config.leadDays",
        unitKey: "playbooks.unit.days",
        min: 7,
        max: 180,
      },
    ],
  },
  {
    id: "maintenance_triage",
    titleKey: "playbooks.rule.maintenanceTriage.title",
    descriptionKey: "playbooks.rule.maintenanceTriage.description",
    triggerKey: "playbooks.rule.maintenanceTriage.trigger",
    thresholdKey: "playbooks.rule.maintenanceTriage.threshold",
    outputs: ["maintenance_inbox", "notifications"],
    defaultConfig: {},
    configFields: [],
  },
  {
    id: "contractor_blocked_followup",
    titleKey: "playbooks.rule.contractorBlocked.title",
    descriptionKey: "playbooks.rule.contractorBlocked.description",
    triggerKey: "playbooks.rule.contractorBlocked.trigger",
    thresholdKey: "playbooks.rule.contractorBlocked.threshold",
    outputs: ["attention_center", "dashboard"],
    defaultConfig: {},
    configFields: [],
  },
  {
    id: "preventive_due_watch",
    titleKey: "playbooks.rule.preventiveDue.title",
    descriptionKey: "playbooks.rule.preventiveDue.description",
    triggerKey: "playbooks.rule.preventiveDue.trigger",
    thresholdKey: "playbooks.rule.preventiveDue.threshold",
    outputs: ["attention_center", "dashboard", "maintenance_kpi"],
    defaultConfig: { lead_days: 14 },
    configFields: [
      {
        key: "lead_days",
        labelKey: "playbooks.config.leadDays",
        unitKey: "playbooks.unit.days",
        min: 1,
        max: 60,
      },
    ],
  },
];

const RULE_DEF_MAP = Object.fromEntries(RULE_DEFS.map((rule) => [rule.id, rule]));

function sanitizeRuleConfig(rule, config = {}) {
  if (!rule) return {};
  const next = { ...(rule.defaultConfig || {}) };
  for (const field of rule.configFields || []) {
    next[field.key] = clampInt(
      config?.[field.key],
      next[field.key],
      Number(field.min ?? 0),
      Number(field.max ?? 365),
    );
  }
  return next;
}

function mergeRuleWithSetting(rule, settingRow, currentCount) {
  const config = sanitizeRuleConfig(rule, settingRow?.config || {});
  const enabled = settingRow?.enabled !== false;
  return {
    ...rule,
    enabled,
    configurable: true,
    config,
    outputs: (rule.outputs || []).map((output) => String(output || "")),
    currentCount: enabled ? Number(currentCount || 0) : 0,
    state: enabled && Number(currentCount || 0) > 0 ? "active" : "clear",
  };
}

async function listAutomationRuleSettingsRows(accountId) {
  if (!accountId) return [];
  if (automationRuleSettingsUnavailable) return null;
  const { data, error } = await supabase
    .from("automation_rule_settings")
    .select("account_id, rule_id, enabled, config, updated_at")
    .eq("account_id", accountId);

  if (error && isMissingBackendObject(error)) {
    automationRuleSettingsUnavailable = true;
    return null;
  }
  if (error && isPermissionDenied(error)) {
    automationRuleSettingsUnavailable = true;
    return null;
  }
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function listRecentAutomationRunsRows(accountId, limit = 12) {
  if (!accountId) return [];
  if (automationRunsUnavailable) return null;
  const { data, error } = await supabase
    .from("automation_runs")
    .select(`
      id,
      rule_id,
      source_key,
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
      resolved_at,
      created_at,
      updated_at
    `)
    .eq("account_id", accountId)
    .order("last_triggered_at", { ascending: false })
    .limit(limit);

  if (error && isMissingBackendObject(error)) {
    automationRunsUnavailable = true;
    return null;
  }
  if (error && isPermissionDenied(error)) {
    automationRunsUnavailable = true;
    return null;
  }
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function mapRunForUi(row) {
  return {
    id: row.id,
    ruleId: row.rule_id,
    sourceKey: row.source_key,
    state: row.state,
    severity: row.severity,
    title: row.title,
    body: row.body || "",
    linkPath: row.link_path || "",
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    firstTriggeredAt: row.first_triggered_at,
    lastTriggeredAt: row.last_triggered_at,
    resolvedAt: row.resolved_at,
    details: row.details || {},
  };
}

async function mapLabels({ propertyIds = [], tenantIds = [] }) {
  const propertyMap = new Map();
  const tenantMap = new Map();

  if (propertyIds.length) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, address")
      .in("id", propertyIds);
    if (!error) {
      for (const row of data || []) propertyMap.set(row.id, row.address || "—");
    }
  }

  if (tenantIds.length) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name")
      .in("id", tenantIds);
    if (!error) {
      for (const row of data || []) tenantMap.set(row.id, row.name || "—");
    }
  }

  return { propertyMap, tenantMap };
}

async function buildRuleSignals(accountId, rulesById) {
  const [
    dashboardSnapshot,
    maintenanceSnapshot,
    paymentsRes,
    leaseRows,
    maintenanceRes,
    blockedWorkOrdersRes,
    preventiveRows,
  ] = await Promise.all([
    getDashboardSnapshot(accountId, { horizonDays: 7 }),
    getMaintenanceKpiSnapshot(accountId),
    supabase
      .from("payments")
      .select(`
        id,
        amount,
        status,
        due_date,
        paid_at,
        tenant_id,
        property_id,
        tenants ( name ),
        properties ( address )
      `)
      .eq("account_id", accountId),
    listLeases({ accountId, limit: 500 }),
    supabase
      .from("maintenance_requests")
      .select("id, title, status, property_id, reported_by_tenant_id, created_at")
      .eq("account_id", accountId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("work_orders")
      .select("id, property_id, maintenance_request_id, status, contractor_name, created_at, updated_at")
      .eq("account_id", accountId)
      .in("status", ["blocked", "zablokowane"])
      .order("updated_at", { ascending: false })
      .limit(100),
    listPreventiveMaintenanceTasks({
      accountId,
      includePaused: false,
      limit: 500,
    }),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (maintenanceRes.error) throw maintenanceRes.error;
  if (blockedWorkOrdersRes.error) throw blockedWorkOrdersRes.error;

  const maintenanceRows = Array.isArray(maintenanceRes.data) ? maintenanceRes.data : [];
  const blockedWorkOrders = Array.isArray(blockedWorkOrdersRes.data) ? blockedWorkOrdersRes.data : [];
  const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];

  const propertyIds = new Set();
  const tenantIds = new Set();
  const requestIds = new Set();

  for (const row of maintenanceRows) {
    if (row?.property_id) propertyIds.add(row.property_id);
    if (row?.reported_by_tenant_id) tenantIds.add(row.reported_by_tenant_id);
  }
  for (const row of blockedWorkOrders) {
    if (row?.property_id) propertyIds.add(row.property_id);
    if (row?.maintenance_request_id) requestIds.add(row.maintenance_request_id);
  }
  for (const row of preventiveRows || []) {
    if (row?.property_id) propertyIds.add(row.property_id);
  }

  const [{ propertyMap, tenantMap }, requestMapRes] = await Promise.all([
    mapLabels({
      propertyIds: Array.from(propertyIds),
      tenantIds: Array.from(tenantIds),
    }),
    requestIds.size
      ? supabase
          .from("maintenance_requests")
          .select("id, title")
          .in("id", Array.from(requestIds))
      : Promise.resolve({ data: [] }),
  ]);

  const requestTitleMap = new Map((requestMapRes.data || []).map((row) => [row.id, row.title || "Maintenance request"]));

  const overdueGraceDays = safeConfigValue(rulesById.rent_overdue_watch?.config, "grace_days", 0, 0, 30);
  const leaseLeadDays = safeConfigValue(rulesById.lease_renewal_watch?.config, "lead_days", 60, 7, 180);
  const preventiveLeadDays = safeConfigValue(rulesById.preventive_due_watch?.config, "lead_days", 14, 1, 60);

  const signals = {
    rent_overdue_watch: [],
    lease_renewal_watch: [],
    maintenance_triage: [],
    contractor_blocked_followup: [],
    preventive_due_watch: [],
  };

  if (rulesById.rent_overdue_watch?.enabled) {
    for (const row of payments) {
      if (!isOverduePayment(row, overdueGraceDays)) continue;
      const tenantLabel = row?.tenants?.name || "Tenant";
      const propertyLabel = row?.properties?.address || "Property";
      signals.rent_overdue_watch.push({
        sourceKey: `payment:${row.id}`,
        severity: "urgent",
        title: `Overdue rent: ${tenantLabel}`,
        body: `${propertyLabel} • ${Number(row.amount || 0)} due on ${formatShortDate(row.due_date)}`,
        entityType: "payment",
        entityId: row.id,
        linkPath: row?.tenant_id ? `/tenants/${row.tenant_id}` : "/finance",
        details: {
          amount: Number(row.amount || 0),
          due_date: row.due_date,
          tenant_id: row.tenant_id || null,
          property_id: row.property_id || null,
          tenant_label: tenantLabel,
          property_label: propertyLabel,
        },
      });
    }
  }

  if (rulesById.lease_renewal_watch?.enabled) {
    for (const row of leaseRows || []) {
      const derived = getDerivedLeaseStatus(row, leaseLeadDays);
      if (!["expiring_soon", "renewal_in_progress", "ended"].includes(derived)) continue;
      const tenantLabel = row.tenantLabel || "Tenant";
      const propertyLabel = row.propertyLabel || "Property";
      signals.lease_renewal_watch.push({
        sourceKey: `lease:${row.id}`,
        severity: derived === "ended" ? "urgent" : "action",
        title:
          derived === "renewal_in_progress"
            ? `Lease renewal in progress: ${tenantLabel}`
            : derived === "ended"
              ? `Expired lease: ${tenantLabel}`
              : `Lease expiring soon: ${tenantLabel}`,
        body: `${propertyLabel} • lease end ${formatShortDate(row.lease_end_date)}`,
        entityType: "lease",
        entityId: row.id,
        linkPath: row?.tenant_id ? `/tenants/${row.tenant_id}` : "/tenants",
        details: {
          tenant_id: row.tenant_id || null,
          property_id: row.property_id || null,
          lease_end_date: row.lease_end_date,
          derived_status: derived,
        },
      });
    }
  }

  if (rulesById.maintenance_triage?.enabled) {
    for (const row of maintenanceRows) {
      const propertyLabel = propertyMap.get(row.property_id) || "Property";
      const tenantLabel = tenantMap.get(row.reported_by_tenant_id) || "";
      signals.maintenance_triage.push({
        sourceKey: `maintenance_request:${row.id}`,
        severity: "action",
        title: `Maintenance request awaiting review: ${row.title || "Untitled request"}`,
        body: [propertyLabel, tenantLabel].filter(Boolean).join(" • "),
        entityType: "maintenance_request",
        entityId: row.id,
        linkPath: "/maintenance-inbox",
        details: {
          property_id: row.property_id || null,
          tenant_id: row.reported_by_tenant_id || null,
          property_label: propertyLabel,
          tenant_label: tenantLabel,
        },
      });
    }
  }

  if (rulesById.contractor_blocked_followup?.enabled) {
    for (const row of blockedWorkOrders) {
      const propertyLabel = propertyMap.get(row.property_id) || "Property";
      const requestTitle = requestTitleMap.get(row.maintenance_request_id) || "Work order";
      signals.contractor_blocked_followup.push({
        sourceKey: `work_order:${row.id}`,
        severity: "action",
        title: `Blocked contractor follow-up: ${requestTitle}`,
        body: [propertyLabel, row?.contractor_name || ""].filter(Boolean).join(" • "),
        entityType: "work_order",
        entityId: row.id,
        linkPath: `/work-orders/${row.id}`,
        details: {
          property_id: row.property_id || null,
          maintenance_request_id: row.maintenance_request_id || null,
          contractor_name: row.contractor_name || "",
        },
      });
    }
  }

  if (rulesById.preventive_due_watch?.enabled) {
    for (const row of preventiveRows || []) {
      if (normalize(row?.status) !== "active") continue;
      const dueDays = daysUntil(row?.next_due_date);
      if (!Number.isFinite(dueDays)) continue;
      if (dueDays > preventiveLeadDays) continue;
      signals.preventive_due_watch.push({
        sourceKey: `preventive_task:${row.id}`,
        severity: dueDays < 0 ? "urgent" : "action",
        title:
          dueDays < 0
            ? `Overdue preventive task: ${row.title || "Preventive task"}`
            : `Preventive task due soon: ${row.title || "Preventive task"}`,
        body: `${row.propertyLabel || "Property"} • ${formatShortDate(row.next_due_date)}`,
        entityType: "preventive_task",
        entityId: row.id,
        linkPath: row?.property_id ? `/properties/${row.property_id}` : "/maintenance-kpi",
        details: {
          property_id: row.property_id || null,
          next_due_date: row.next_due_date || null,
          days_until_due: dueDays,
          category: row.category || "",
        },
      });
    }
  }

  return {
    signals,
    dashboardSnapshot,
    maintenanceSnapshot,
    preventiveOverview: await getPreventiveMaintenanceOverview(accountId, {
      dueSoonDays: preventiveLeadDays,
    }),
  };
}

export async function updatePlaybookRuleSetting(accountId, ruleId, input = {}) {
  const rule = RULE_DEF_MAP[ruleId];
  if (!accountId) throw new Error("Missing accountId");
  if (!rule) throw new Error("Unknown playbook rule");
  if (automationRuleSettingsUnavailable) {
    throw new Error("Automation settings backend is not available for this session.");
  }

  const payload = {
    account_id: accountId,
    rule_id: ruleId,
    enabled: input?.enabled !== false,
    config: sanitizeRuleConfig(rule, input?.config || {}),
  };

  const { data, error } = await supabase
    .from("automation_rule_settings")
    .upsert(payload, {
      onConflict: "account_id,rule_id",
    })
    .select("account_id, rule_id, enabled, config, updated_at")
    .single();

  if (error && (isMissingBackendObject(error) || isPermissionDenied(error))) {
    automationRuleSettingsUnavailable = true;
    throw new Error("Automation settings backend is not deployed yet.");
  }
  if (error) throw error;
  return data;
}

export async function getPlaybookAutomationOverview(accountId) {
  if (!accountId) {
    return {
      rules: RULE_DEFS.map((rule) => mergeRuleWithSetting(rule, null, 0)),
      summary: {
        enabledRules: RULE_DEFS.length,
        activeRules: 0,
        totalSignals: 0,
        openRuns: 0,
      },
      recentRuns: [],
      storage: {
        settingsAvailable: false,
        runsAvailable: false,
      },
    };
  }

  const settingsRows = await listAutomationRuleSettingsRows(accountId);
  const settingsAvailable = Array.isArray(settingsRows);
  const settingsByRuleId = new Map((settingsRows || []).map((row) => [row.rule_id, row]));

  const seedRules = Object.fromEntries(
    RULE_DEFS.map((rule) => [rule.id, mergeRuleWithSetting(rule, settingsByRuleId.get(rule.id), 0)]),
  );

  const { signals, dashboardSnapshot, maintenanceSnapshot, preventiveOverview } =
    await buildRuleSignals(accountId, seedRules);

  const recentRunsRows = await listRecentAutomationRunsRows(accountId, 12);
  const runsAvailable = Array.isArray(recentRunsRows);

  const rules = RULE_DEFS.map((rule) =>
    mergeRuleWithSetting(rule, settingsByRuleId.get(rule.id), (signals[rule.id] || []).length),
  );

  const activeRules = rules.filter((rule) => rule.enabled && rule.currentCount > 0).length;
  const totalSignals = rules.reduce((sum, rule) => sum + Number(rule.currentCount || 0), 0);
  const openRuns = Array.isArray(recentRunsRows)
    ? recentRunsRows.filter((row) => normalize(row?.state) === "open").length
    : 0;

  return {
    rules,
    summary: {
      enabledRules: rules.filter((rule) => rule.enabled).length,
      activeRules,
      totalSignals,
      openRuns,
      overdueAmount: Number(dashboardSnapshot?.overdue_amount || 0),
      openRequests: Number(maintenanceSnapshot?.open_requests || 0),
      preventiveSignals:
        Number(preventiveOverview?.overdueCount || 0) + Number(preventiveOverview?.dueSoonCount || 0),
    },
    recentRuns: Array.isArray(recentRunsRows) ? recentRunsRows.map(mapRunForUi) : [],
    storage: {
      settingsAvailable,
      runsAvailable,
    },
  };
}
