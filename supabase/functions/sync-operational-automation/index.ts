import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TAXONOMY: Record<string, { category: string; severity: string }> = {
  overdue_rent: { category: "overdue_rent", severity: "urgent" },
  lease_expiring: { category: "lease_expiring", severity: "action" },
  preventive_due: { category: "preventive_due", severity: "action" },
  contractor_ack_overdue: { category: "contractor_ack_overdue", severity: "urgent" },
};

const RULE_DEFS = {
  rent_overdue_watch: {
    notificationType: "overdue_rent",
    defaultConfig: { grace_days: 0 },
  },
  lease_renewal_watch: {
    notificationType: "lease_expiring",
    defaultConfig: { lead_days: 60 },
  },
  preventive_due_watch: {
    notificationType: "preventive_due",
    defaultConfig: { lead_days: 14 },
  },
  contractor_ack_overdue_watch: {
    notificationType: "contractor_ack_overdue",
    defaultConfig: {},
  },
} as const;

const RULE_IDS = Object.keys(RULE_DEFS);

type SyncBody = {
  accountId?: string;
  dryRun?: boolean;
};

type RuleId = keyof typeof RULE_DEFS;

type AutomationSignal = {
  ruleId: RuleId;
  sourceKey: string;
  severity: "info" | "action" | "urgent";
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  linkPath: string | null;
  details: Record<string, unknown>;
  notificationType: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      return json({ error: "CRON_SECRET is not configured" }, 500);
    }

    if (!isAuthorized(req)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await readJson(req)) as SyncBody;
    const accountIds = await resolveAccountIds(body?.accountId || null);
    const dryRun = body?.dryRun === true;

    const results = [];
    const totals = {
      accountsProcessed: 0,
      signalsOpen: 0,
      signalsResolved: 0,
      notificationsCreated: 0,
      executionRowsInserted: 0,
      errors: 0,
    };

    for (const accountId of accountIds) {
      try {
        const result = await syncAccount(accountId, { dryRun });
        totals.accountsProcessed += 1;
        totals.signalsOpen += result.signalsOpen;
        totals.signalsResolved += result.signalsResolved;
        totals.notificationsCreated += result.notificationsCreated;
        totals.executionRowsInserted += result.executionRowsInserted;
        results.push(result);
      } catch (error) {
        totals.errors += 1;
        results.push({
          accountId,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown account sync error",
        });
      }
    }

    return json({
      ok: true,
      dryRun,
      processedAt: new Date().toISOString(),
      totals,
      results,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function isAuthorized(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return token === CRON_SECRET || headerSecret === CRON_SECRET;
}

async function resolveAccountIds(accountId: string | null) {
  if (accountId) return [accountId];

  const { data, error } = await admin.from("accounts").select("id");
  if (error) throw error;
  return (data || []).map((row) => row.id).filter(Boolean);
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function clampInt(value: unknown, fallback: number, min = 0, max = 365) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function todayDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateOnly(value: unknown) {
  if (!value) return null;
  const next = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(next.getTime()) ? null : next;
}

function daysUntil(value: unknown) {
  const target = toDateOnly(value);
  if (!target) return null;
  return Math.round((target.getTime() - todayDate().getTime()) / 86400000);
}

function formatShortDate(value: unknown) {
  const date = value ? new Date(value as string) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB");
}

function isOverduePayment(row: Record<string, unknown>, graceDays = 0) {
  const status = normalize(row?.status);
  if (row?.paid_at) return false;
  if (["overdue", "zaległe", "zalegle"].includes(status)) return true;

  const due = toDateOnly(row?.due_date);
  if (!due) return false;

  const diff = Math.round((todayDate().getTime() - due.getTime()) / 86400000);
  return diff > Math.max(0, Number(graceDays || 0));
}

function getDerivedLeaseStatus(row: Record<string, unknown>, expiringSoonDays = 60) {
  const explicit = normalize(row?.renewal_status);
  const untilEnd = daysUntil(row?.lease_end_date);

  if (explicit === "renewal_in_progress") return "renewal_in_progress";
  if (explicit === "renewed") return "renewed";
  if (explicit === "ended") return "ended";
  if (Number.isFinite(untilEnd) && Number(untilEnd) < 0) return "ended";
  if (Number.isFinite(untilEnd) && Number(untilEnd) <= expiringSoonDays) return "expiring_soon";
  return "active";
}

async function loadRuleSettings(accountId: string) {
  const { data, error } = await admin
    .from("automation_rule_settings")
    .select("rule_id, enabled, config")
    .eq("account_id", accountId)
    .in("rule_id", RULE_IDS);

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("does not exist") || message.includes("relation")) {
      return new Map<string, { enabled: boolean; config: Record<string, unknown> }>();
    }
    throw error;
  }

  return new Map(
    (data || []).map((row) => [
      row.rule_id,
      {
        enabled: row.enabled !== false,
        config: row.config || {},
      },
    ]),
  );
}

function getRuleConfig(
  settings: Map<string, { enabled: boolean; config: Record<string, unknown> }>,
  ruleId: RuleId,
) {
  const setting = settings.get(ruleId);
  return {
    enabled: setting?.enabled !== false,
    config: {
      ...RULE_DEFS[ruleId].defaultConfig,
      ...(setting?.config || {}),
    },
  };
}

async function loadManagerRecipientIds(accountId: string) {
  const { data, error } = await admin
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId);

  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data || []) {
    if (!row?.user_id) continue;
    if (["owner", "admin", "staff"].includes(normalize(row.role))) {
      ids.add(row.user_id);
    }
  }
  return Array.from(ids);
}

async function deriveSignals(accountId: string, settings: Map<string, { enabled: boolean; config: Record<string, unknown> }>) {
  const [
    paymentsRes,
    leasesRes,
    preventiveRes,
    ackOverdueRes,
  ] = await Promise.all([
    admin
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
    admin
      .from("leases")
      .select(`
        id,
        tenant_id,
        property_id,
        lease_end_date,
        renewal_status,
        tenant:tenants!leases_tenant_id_fkey(name),
        property:properties!leases_property_id_fkey(address)
      `)
      .eq("account_id", accountId)
      .order("lease_end_date", { ascending: true })
      .limit(500),
    admin
      .from("preventive_maintenance_tasks")
      .select(`
        id,
        property_id,
        title,
        category,
        status,
        next_due_date,
        property:properties!preventive_maintenance_tasks_property_id_fkey(address)
      `)
      .eq("account_id", accountId)
      .limit(500),
    admin
      .from("work_orders")
      .select(`
        id,
        property_id,
        maintenance_request_id,
        contractor_name,
        contractor_user_id,
        acknowledgement_due_at,
        acknowledgement_status,
        acknowledged_at,
        maintenance_requests:maintenance_request_id(title),
        properties(address)
      `)
      .eq("account_id", accountId)
      .not("acknowledgement_due_at", "is", null)
      .limit(500),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (leasesRes.error) throw leasesRes.error;
  if (preventiveRes.error) throw preventiveRes.error;
  if (ackOverdueRes.error) throw ackOverdueRes.error;

  const signals: AutomationSignal[] = [];

  const overdueConfig = getRuleConfig(settings, "rent_overdue_watch");
  if (overdueConfig.enabled) {
    const graceDays = clampInt(overdueConfig.config.grace_days, 0, 0, 30);
    for (const row of paymentsRes.data || []) {
      if (!isOverduePayment(row, graceDays)) continue;
      const tenantLabel = row?.tenants?.name || "Tenant";
      const propertyLabel = row?.properties?.address || "Property";
      signals.push({
        ruleId: "rent_overdue_watch",
        notificationType: RULE_DEFS.rent_overdue_watch.notificationType,
        sourceKey: `payment:${row.id}`,
        severity: "urgent",
        title: `Overdue rent: ${tenantLabel}`,
        body: `${propertyLabel} • ${Number(row.amount || 0)} due on ${formatShortDate(row.due_date)}`,
        entityType: "payment",
        entityId: row.id,
        linkPath: row?.tenant_id ? `/tenants/${row.tenant_id}` : "/finance",
        details: {
          tenant_id: row.tenant_id || null,
          property_id: row.property_id || null,
          amount: Number(row.amount || 0),
          due_date: row.due_date || null,
        },
      });
    }
  }

  const leaseConfig = getRuleConfig(settings, "lease_renewal_watch");
  if (leaseConfig.enabled) {
    const leadDays = clampInt(leaseConfig.config.lead_days, 60, 7, 180);
    for (const row of leasesRes.data || []) {
      const derivedStatus = getDerivedLeaseStatus(row, leadDays);
      if (!["expiring_soon", "renewal_in_progress", "ended"].includes(derivedStatus)) continue;
      const tenantLabel = row?.tenant?.name || "Tenant";
      const propertyLabel = row?.property?.address || "Property";
      signals.push({
        ruleId: "lease_renewal_watch",
        notificationType: RULE_DEFS.lease_renewal_watch.notificationType,
        sourceKey: `lease:${row.id}`,
        severity: derivedStatus === "ended" ? "urgent" : "action",
        title:
          derivedStatus === "renewal_in_progress"
            ? `Lease renewal in progress: ${tenantLabel}`
            : derivedStatus === "ended"
              ? `Expired lease: ${tenantLabel}`
              : `Lease expiring soon: ${tenantLabel}`,
        body: `${propertyLabel} • lease end ${formatShortDate(row.lease_end_date)}`,
        entityType: "lease",
        entityId: row.id,
        linkPath: row?.tenant_id ? `/tenants/${row.tenant_id}` : "/tenants",
        details: {
          tenant_id: row.tenant_id || null,
          property_id: row.property_id || null,
          lease_end_date: row.lease_end_date || null,
          derived_status: derivedStatus,
        },
      });
    }
  }

  const preventiveConfig = getRuleConfig(settings, "preventive_due_watch");
  if (preventiveConfig.enabled) {
    const leadDays = clampInt(preventiveConfig.config.lead_days, 14, 1, 60);
    for (const row of preventiveRes.data || []) {
      if (normalize(row?.status) !== "active") continue;
      const dueInDays = daysUntil(row?.next_due_date);
      if (!Number.isFinite(dueInDays) || Number(dueInDays) > leadDays) continue;
      const propertyLabel = row?.property?.address || "Property";
      signals.push({
        ruleId: "preventive_due_watch",
        notificationType: RULE_DEFS.preventive_due_watch.notificationType,
        sourceKey: `preventive_task:${row.id}`,
        severity: Number(dueInDays) < 0 ? "urgent" : "action",
        title:
          Number(dueInDays) < 0
            ? `Overdue preventive task: ${row.title || "Preventive task"}`
            : `Preventive task due soon: ${row.title || "Preventive task"}`,
        body: `${propertyLabel} • ${formatShortDate(row.next_due_date)}`,
        entityType: "preventive_task",
        entityId: row.id,
        linkPath: row?.property_id ? `/properties/${row.property_id}` : "/maintenance-kpi",
        details: {
          property_id: row.property_id || null,
          category: row.category || null,
          next_due_date: row.next_due_date || null,
          days_until_due: dueInDays,
        },
      });
    }
  }

  const ackConfig = getRuleConfig(settings, "contractor_ack_overdue_watch");
  if (ackConfig.enabled) {
    const now = new Date();
    for (const row of ackOverdueRes.data || []) {
      const dueAt = row?.acknowledgement_due_at ? new Date(row.acknowledgement_due_at) : null;
      const ackStatus = normalize(row?.acknowledgement_status);
      const hasContractor = !!(row?.contractor_user_id || row?.contractor_name);
      if (!hasContractor) continue;
      if (!dueAt || Number.isNaN(dueAt.getTime()) || dueAt > now) continue;
      if (ackStatus === "acknowledged" || row?.acknowledged_at) continue;

      const propertyLabel = row?.properties?.address || "Property";
      const requestTitle = row?.maintenance_requests?.title || "Work order";
      signals.push({
        ruleId: "contractor_ack_overdue_watch",
        notificationType: RULE_DEFS.contractor_ack_overdue_watch.notificationType,
        sourceKey: `work_order_ack:${row.id}`,
        severity: "urgent",
        title: `Contractor acknowledgement overdue: ${requestTitle}`,
        body: [propertyLabel, row?.contractor_name || ""].filter(Boolean).join(" • "),
        entityType: "work_order",
        entityId: row.id,
        linkPath: `/work-orders/${row.id}`,
        details: {
          property_id: row.property_id || null,
          maintenance_request_id: row.maintenance_request_id || null,
          acknowledgement_due_at: row.acknowledgement_due_at || null,
          contractor_name: row.contractor_name || null,
        },
      });
    }
  }

  return signals;
}

async function loadExistingRuns(accountId: string) {
  const { data, error } = await admin
    .from("automation_runs")
    .select("id, rule_id, source_key, state, severity, title, entity_type, entity_id, first_triggered_at, last_triggered_at, resolved_at")
    .eq("account_id", accountId)
    .in("rule_id", RULE_IDS);

  if (error) throw error;
  return data || [];
}

function buildRunKey(ruleId: string, sourceKey: string) {
  return `${ruleId}::${sourceKey}`;
}

function buildExecutionRow({
  accountId,
  ruleId,
  eventKey,
  executionType,
  status = "recorded",
  entityType = null,
  entityId = null,
  title = null,
  details = {},
}: {
  accountId: string;
  ruleId: string;
  eventKey: string;
  executionType: string;
  status?: string;
  entityType?: string | null;
  entityId?: string | null;
  title?: string | null;
  details?: Record<string, unknown>;
}) {
  return {
    account_id: accountId,
    rule_id: ruleId,
    event_key: eventKey,
    execution_type: executionType,
    status,
    entity_type: entityType,
    entity_id: entityId,
    title,
    details,
    executed_at: new Date().toISOString(),
  };
}

async function insertExecutionRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return 0;
  const { error } = await admin.from("automation_execution_log").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function sendSignalNotification(accountId: string, recipientUserIds: string[], signal: AutomationSignal) {
  if (!recipientUserIds.length) return 0;

  const taxonomy = TAXONOMY[signal.notificationType] || { category: "general", severity: "info" };
  const { error } = await admin.rpc("create_notifications", {
    p_account_id: accountId,
    p_recipient_user_ids: recipientUserIds,
    p_type: signal.notificationType,
    p_title: signal.title,
    p_body: signal.body,
    p_entity_type: signal.entityType,
    p_entity_id: signal.entityId,
    p_link_path: signal.linkPath,
    p_metadata: {
      ...signal.details,
      rule_id: signal.ruleId,
      source_key: signal.sourceKey,
      sync_source: "scheduled_operational_automation",
      alert_category: taxonomy.category,
      alert_severity: signal.severity || taxonomy.severity,
    },
  });

  if (error) throw error;
  return recipientUserIds.length;
}

async function syncAccount(accountId: string, { dryRun = false } = {}) {
  const settings = await loadRuleSettings(accountId);
  const [recipientUserIds, existingRuns, signals] = await Promise.all([
    loadManagerRecipientIds(accountId),
    loadExistingRuns(accountId),
    deriveSignals(accountId, settings),
  ]);

  const existingMap = new Map(
    existingRuns.map((row) => [buildRunKey(row.rule_id, row.source_key), row]),
  );

  const nowIso = new Date().toISOString();
  const currentKeys = new Set<string>();
  const rowsToUpsert = [];
  const newlyOpenedSignals: AutomationSignal[] = [];

  for (const signal of signals) {
    const mapKey = buildRunKey(signal.ruleId, signal.sourceKey);
    const existing = existingMap.get(mapKey);
    const isReopened = existing && normalize(existing.state) === "resolved";
    const isNew = !existing || isReopened;

    currentKeys.add(mapKey);
    rowsToUpsert.push({
      account_id: accountId,
      rule_id: signal.ruleId,
      source_key: signal.sourceKey,
      state: "open",
      severity: signal.severity,
      title: signal.title,
      body: signal.body,
      entity_type: signal.entityType,
      entity_id: signal.entityId,
      link_path: signal.linkPath,
      details: signal.details,
      first_triggered_at: isNew ? nowIso : existing?.first_triggered_at || nowIso,
      last_triggered_at: nowIso,
      resolved_at: null,
    });

    if (isNew) newlyOpenedSignals.push(signal);
  }

  const runsToResolve = existingRuns.filter((row) => {
    const key = buildRunKey(row.rule_id, row.source_key);
    return normalize(row.state) === "open" && !currentKeys.has(key);
  });

  let executionRowsInserted = 0;
  let notificationsCreated = 0;

  if (!dryRun) {
    if (rowsToUpsert.length) {
      const { error } = await admin.from("automation_runs").upsert(rowsToUpsert, {
        onConflict: "account_id,rule_id,source_key",
      });
      if (error) throw error;
    }

    if (runsToResolve.length) {
      const { error } = await admin
        .from("automation_runs")
        .update({
          state: "resolved",
          resolved_at: nowIso,
          last_triggered_at: nowIso,
        })
        .in("id", runsToResolve.map((row) => row.id));
      if (error) throw error;
    }

    const transitionExecutionRows = [
      ...newlyOpenedSignals.map((signal) =>
        buildExecutionRow({
          accountId,
          ruleId: signal.ruleId,
          eventKey: `opened:${signal.ruleId}:${signal.sourceKey}:${Date.now()}`,
          executionType: "signal_opened",
          entityType: signal.entityType,
          entityId: signal.entityId,
          title: signal.title,
          details: signal.details,
        }),
      ),
      ...runsToResolve.map((run) =>
        buildExecutionRow({
          accountId,
          ruleId: run.rule_id,
          eventKey: `resolved:${run.rule_id}:${run.source_key}:${Date.now()}`,
          executionType: "signal_resolved",
          entityType: run.entity_type,
          entityId: run.entity_id,
          title: run.title,
          details: {
            source_key: run.source_key,
            resolved_from_state: run.state,
          },
        }),
      ),
    ];

    executionRowsInserted += await insertExecutionRows(transitionExecutionRows);

    for (const signal of newlyOpenedSignals) {
      try {
        const recipientCount = await sendSignalNotification(accountId, recipientUserIds, signal);
        notificationsCreated += recipientCount;
        executionRowsInserted += await insertExecutionRows([
          buildExecutionRow({
            accountId,
            ruleId: signal.ruleId,
            eventKey: `notify:${signal.ruleId}:${signal.sourceKey}:${Date.now()}`,
            executionType: "notification_created",
            entityType: signal.entityType,
            entityId: signal.entityId,
            title: signal.title,
            details: {
              recipient_count: recipientCount,
              notification_type: signal.notificationType,
              source_key: signal.sourceKey,
            },
          }),
        ]);
      } catch (error) {
        executionRowsInserted += await insertExecutionRows([
          buildExecutionRow({
            accountId,
            ruleId: signal.ruleId,
            eventKey: `notify_failed:${signal.ruleId}:${signal.sourceKey}:${Date.now()}`,
            executionType: "notification_created",
            status: "failed",
            entityType: signal.entityType,
            entityId: signal.entityId,
            title: signal.title,
            details: {
              error: error instanceof Error ? error.message : "Unknown notification error",
              notification_type: signal.notificationType,
              source_key: signal.sourceKey,
            },
          }),
        ]);
      }
    }
  }

  return {
    accountId,
    ok: true,
    managerRecipients: recipientUserIds.length,
    signalsOpen: signals.length,
    signalsOpened: newlyOpenedSignals.length,
    signalsResolved: runsToResolve.length,
    notificationsCreated,
    executionRowsInserted,
    enabledRules: {
      rent_overdue_watch: getRuleConfig(settings, "rent_overdue_watch").enabled,
      lease_renewal_watch: getRuleConfig(settings, "lease_renewal_watch").enabled,
      preventive_due_watch: getRuleConfig(settings, "preventive_due_watch").enabled,
      contractor_ack_overdue_watch: getRuleConfig(settings, "contractor_ack_overdue_watch").enabled,
    },
  };
}
