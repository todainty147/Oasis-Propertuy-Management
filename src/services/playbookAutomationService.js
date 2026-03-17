import { supabase } from "../lib/supabase";

let automationRuleSettingsUnavailable = false;

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

function clampInt(value, fallback, min = 0, max = 365) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
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
    id: "contractor_ack_overdue_watch",
    titleKey: "playbooks.rule.contractorAckOverdue.title",
    descriptionKey: "playbooks.rule.contractorAckOverdue.description",
    triggerKey: "playbooks.rule.contractorAckOverdue.trigger",
    thresholdKey: "playbooks.rule.contractorAckOverdue.threshold",
    outputs: ["attention_center", "dashboard", "notifications"],
    defaultConfig: {},
    configFields: [],
  },
  {
    id: "compliance_due_watch",
    titleKey: "playbooks.rule.complianceDue.title",
    descriptionKey: "playbooks.rule.complianceDue.description",
    triggerKey: "playbooks.rule.complianceDue.trigger",
    thresholdKey: "playbooks.rule.complianceDue.threshold",
    outputs: ["attention_center", "dashboard", "notifications"],
    defaultConfig: { lead_days: 30 },
    configFields: [
      {
        key: "lead_days",
        labelKey: "playbooks.config.leadDays",
        unitKey: "playbooks.unit.days",
        min: 1,
        max: 120,
      },
    ],
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
  {
    id: "property_health_watch",
    titleKey: "playbooks.rule.propertyHealth.title",
    descriptionKey: "playbooks.rule.propertyHealth.description",
    triggerKey: "playbooks.rule.propertyHealth.trigger",
    thresholdKey: "playbooks.rule.propertyHealth.threshold",
    outputs: ["attention_center", "dashboard", "notifications", "reporting"],
    defaultConfig: { sharp_drop_points: 15 },
    configFields: [
      {
        key: "sharp_drop_points",
        labelKey: "playbooks.config.sharpDropPoints",
        unitKey: "playbooks.unit.points",
        min: 5,
        max: 40,
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

function mapExecutionForUi(row) {
  return {
    ...row,
    details: row?.details || {},
  };
}

function parseJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
        lastRunAt: null,
        lastRunStatus: "recorded",
      },
      recentRuns: [],
      recentResolvedRuns: [],
      recentExecutions: [],
      storage: {
        settingsAvailable: true,
        runsAvailable: true,
        executionLogAvailable: true,
        snapshotAvailable: true,
      },
    };
  }

  const { data, error } = await supabase.rpc("playbook_status_snapshot", {
    p_account_id: accountId,
    p_recent_limit: 12,
  });

  if (error) {
    if (isMissingBackendObject(error) || isPermissionDenied(error)) {
      throw new Error("playbook_status_snapshot RPC is not deployed. Run supabase/playbook_status_snapshot.sql.");
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const settingsRows = parseJsonArray(row?.settings);
  const settingsByRuleId = new Map(settingsRows.map((entry) => [entry.rule_id, entry]));
  const openRunCounts = parseJsonObject(row?.open_run_counts);
  const rules = RULE_DEFS.map((rule) =>
    mergeRuleWithSetting(rule, settingsByRuleId.get(rule.id), Number(openRunCounts?.[rule.id] || 0)),
  );
  const recentRuns = parseJsonArray(row?.recent_runs).map(mapRunForUi);
  const recentResolvedRuns = parseJsonArray(row?.recent_resolved_runs).map(mapRunForUi);
  const recentExecutions = parseJsonArray(row?.recent_executions).map(mapExecutionForUi);
  const activeRules = rules.filter((rule) => rule.enabled && rule.currentCount > 0).length;
  const totalSignals = rules.reduce((sum, rule) => sum + Number(rule.currentCount || 0), 0);

  return {
    rules,
    summary: {
      enabledRules: rules.filter((rule) => rule.enabled).length,
      activeRules,
      totalSignals,
      openRuns: Number(row?.open_runs || 0),
      lastRunAt: row?.last_run_at || null,
      lastRunStatus: row?.last_run_status || "recorded",
    },
    recentRuns,
    recentResolvedRuns,
    recentExecutions,
    storage: {
      settingsAvailable: true,
      runsAvailable: true,
      executionLogAvailable: true,
      snapshotAvailable: true,
    },
  };
}
