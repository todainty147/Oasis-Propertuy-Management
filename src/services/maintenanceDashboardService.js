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

function chooseSpendAmount(row) {
  const invoice = Number(row?.invoice_amount || 0);
  if (Number.isFinite(invoice) && invoice > 0) return invoice;
  const quote = Number(row?.quote_amount || 0);
  return Number.isFinite(quote) ? quote : 0;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function recentMonths(count = 6) {
  const now = new Date();
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: monthKey(d),
      date: d,
    });
  }
  return months;
}

function startOfCurrentMonth() {
  return startOfMonth(new Date());
}

function nextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function normalizeCategoryLabel(category) {
  const raw = String(category || "").trim();
  if (!raw) return "Uncategorized";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyFinancialAnalytics() {
  return {
    totalSpend: 0,
    totalQuoted: 0,
    avgCostPerWorkOrder: 0,
    topProperties: [],
    topContractors: [],
    expensiveRepairs: [],
    monthlySpend: [],
    categorySpend: [],
    currentMonthActual: 0,
    currentMonthBudget: 0,
    currentMonthVariance: 0,
  };
}

function buildLegacyFinancialAnalytics(rows = [], propertyMap = new Map()) {
  let totalSpend = 0;
  let totalQuoted = 0;
  let countedWorkOrders = 0;
  const propertySpend = new Map();
  const contractorSpend = new Map();
  const expensiveRepairs = [];
  const monthDefs = recentMonths(6);
  const monthSpend = new Map(monthDefs.map((month) => [month.key, 0]));

  for (const row of rows) {
    const quote = Number(row?.quote_amount || 0);
    const spend = chooseSpendAmount(row);
    const status = String(row?.status || "").toLowerCase();
    const propertyLabel = propertyMap.get(row.property_id) || "—";
    const contractorLabel = String(row?.contractor_name || "").trim() || "Unassigned";

    totalSpend += spend;
    totalQuoted += Number.isFinite(quote) ? quote : 0;
    if (spend > 0) countedWorkOrders += 1;

    const propertyKey = String(row.property_id || propertyLabel);
    const currentProperty = propertySpend.get(propertyKey) || {
      propertyId: row.property_id || null,
      label: propertyLabel,
      amount: 0,
    };
    currentProperty.amount += spend;
    propertySpend.set(propertyKey, currentProperty);
    contractorSpend.set(contractorLabel, (contractorSpend.get(contractorLabel) || 0) + spend);

    const basisDate = new Date(row?.updated_at || row?.created_at || Date.now());
    if (!Number.isNaN(basisDate.getTime())) {
      const key = monthKey(startOfMonth(basisDate));
      if (monthSpend.has(key)) {
        monthSpend.set(key, (monthSpend.get(key) || 0) + spend);
      }
    }

    expensiveRepairs.push({
      id: row.id,
      propertyId: row.property_id,
      propertyLabel,
      contractorLabel,
      title: row?.maintenance_requests?.title || row.id,
      amount: spend,
      status,
      linkPath: `/work-orders/${row.id}`,
    });
  }

  return {
    totalSpend,
    totalQuoted,
    avgCostPerWorkOrder: countedWorkOrders > 0 ? totalSpend / countedWorkOrders : 0,
    topProperties: Array.from(propertySpend.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    topContractors: Array.from(contractorSpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    expensiveRepairs: expensiveRepairs
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    monthlySpend: monthDefs.map((month) => ({
      key: month.key,
      label: month.date.toLocaleDateString(undefined, { month: "short" }),
      amount: monthSpend.get(month.key) || 0,
    })),
    categorySpend: [],
    currentMonthActual: 0,
    currentMonthBudget: 0,
    currentMonthVariance: 0,
  };
}

async function getPropertyMap(propertyIds = []) {
  if (propertyIds.length === 0) return new Map();

  const { data: propertyRows, error: propertyError } = await supabase
    .from("properties")
    .select("id, address")
    .in("id", propertyIds);

  if (propertyError && !isMissingBackendObject(propertyError)) throw propertyError;
  return new Map((propertyRows || []).map((row) => [row.id, row.address || "—"]));
}

export async function getMaintenanceFinancialAnalytics(accountId) {
  if (!accountId) return emptyFinancialAnalytics();

  const monthStart = startOfCurrentMonth();
  const monthEnd = nextMonth(monthStart);

  const { data: workOrders, error } = await supabase
    .from("work_orders_with_flags")
    .select("id, property_id, contractor_name, status, quote_amount, invoice_amount, created_at, updated_at, maintenance_request_id, maintenance_requests:maintenance_request_id ( id, title )")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingBackendObject(error)) return emptyFinancialAnalytics();
  if (error) throw error;

  const rows = workOrders || [];
  const propertyIds = Array.from(new Set(rows.map((row) => row.property_id).filter(Boolean)));
  const propertyMap = await getPropertyMap(propertyIds);

  const legacyAnalytics = buildLegacyFinancialAnalytics(rows, propertyMap);

  const [{ data: expenseRows, error: expenseError }, { data: budgetRows, error: budgetError }] = await Promise.all([
    supabase
      .from("maintenance_expenses")
      .select("id, property_id, work_order_id, vendor_id, vendor_name, category, approval_state, amount, expense_date")
      .eq("account_id", accountId)
      .order("expense_date", { ascending: false })
      .limit(1000),
    supabase
      .from("maintenance_budgets")
      .select("id, budget_amount, property_id, category, period_month")
      .eq("account_id", accountId)
      .gte("period_month", monthStart.toISOString().slice(0, 10))
      .lt("period_month", monthEnd.toISOString().slice(0, 10)),
  ]);

  if (expenseError && isMissingBackendObject(expenseError)) return legacyAnalytics;
  if (expenseError) throw expenseError;
  if (budgetError && !isMissingBackendObject(budgetError)) throw budgetError;

  const expenses = (expenseRows || []).filter(
    (row) => String(row?.approval_state || "").toLowerCase() === "approved"
  );

  if (expenses.length === 0) {
    const monthBudget = (budgetRows || [])
      .filter((row) => !row.property_id && !row.category)
      .reduce((sum, row) => sum + Number(row?.budget_amount || 0), 0);

    return {
      ...legacyAnalytics,
      currentMonthBudget: monthBudget,
      currentMonthActual: 0,
      currentMonthVariance: 0 - monthBudget,
    };
  }

  const workOrderMap = new Map(rows.map((row) => [row.id, row]));
  const propertySpend = new Map();
  const contractorSpend = new Map();
  const categorySpend = new Map();
  const expensiveRepairs = [];
  const monthDefs = recentMonths(6);
  const monthSpend = new Map(monthDefs.map((month) => [month.key, 0]));
  const workOrderApprovedSpend = new Map();
  let totalSpend = 0;

  for (const row of expenses) {
    const spend = Number(row?.amount || 0);
    const linkedWorkOrder = workOrderMap.get(row.work_order_id) || null;
    const propertyLabel = propertyMap.get(row.property_id) || "—";
    const contractorLabel =
      String(row?.vendor_name || linkedWorkOrder?.contractor_name || "").trim() || "Unassigned";
    const categoryLabel = normalizeCategoryLabel(row?.category);

    totalSpend += spend;

    const propertyKey = String(row.property_id || propertyLabel);
    const currentProperty = propertySpend.get(propertyKey) || {
      propertyId: row.property_id || null,
      label: propertyLabel,
      amount: 0,
    };
    currentProperty.amount += spend;
    propertySpend.set(propertyKey, currentProperty);
    contractorSpend.set(contractorLabel, (contractorSpend.get(contractorLabel) || 0) + spend);
    categorySpend.set(categoryLabel, (categorySpend.get(categoryLabel) || 0) + spend);

    if (row.work_order_id) {
      workOrderApprovedSpend.set(
        row.work_order_id,
        (workOrderApprovedSpend.get(row.work_order_id) || 0) + spend
      );
    }

    const basisDate = new Date(row?.expense_date || Date.now());
    if (!Number.isNaN(basisDate.getTime())) {
      const key = monthKey(startOfMonth(basisDate));
      if (monthSpend.has(key)) {
        monthSpend.set(key, (monthSpend.get(key) || 0) + spend);
      }
    }
  }

  for (const [workOrderId, amount] of workOrderApprovedSpend.entries()) {
    const row = workOrderMap.get(workOrderId);
    if (!row || amount <= 0) continue;
    expensiveRepairs.push({
      id: row.id,
      propertyId: row.property_id,
      propertyLabel: propertyMap.get(row.property_id) || "—",
      contractorLabel: String(row?.contractor_name || "").trim() || "Unassigned",
      title: row?.maintenance_requests?.title || row.id,
      amount,
      status: String(row?.status || "").toLowerCase(),
      linkPath: `/work-orders/${row.id}`,
    });
  }

  const currentMonthActual = expenses.reduce((sum, row) => {
    const d = new Date(row?.expense_date || "");
    if (Number.isNaN(d.getTime())) return sum;
    return d >= monthStart && d < monthEnd ? sum + Number(row?.amount || 0) : sum;
  }, 0);

  const currentMonthBudget = (budgetRows || [])
    .filter((row) => !row.property_id && !row.category)
    .reduce((sum, row) => sum + Number(row?.budget_amount || 0), 0);

  return {
    totalSpend,
    totalQuoted: legacyAnalytics.totalQuoted,
    avgCostPerWorkOrder:
      workOrderApprovedSpend.size > 0 ? totalSpend / workOrderApprovedSpend.size : 0,
    topProperties: Array.from(propertySpend.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    topContractors: Array.from(contractorSpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    expensiveRepairs: expensiveRepairs
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    monthlySpend: monthDefs.map((month) => ({
      key: month.key,
      label: month.date.toLocaleDateString(undefined, { month: "short" }),
      amount: monthSpend.get(month.key) || 0,
    })),
    categorySpend: Array.from(categorySpend.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    currentMonthActual,
    currentMonthBudget,
    currentMonthVariance: currentMonthActual - currentMonthBudget,
  };
}

export async function upsertMaintenanceBudget({ accountId, budgetAmount, periodMonth, propertyId = null, category = null }) {
  if (!accountId) throw new Error("Missing account");

  const normalizedMonth = String(periodMonth || "").slice(0, 10);
  const amount = Number(budgetAmount || 0);

  if (!normalizedMonth) throw new Error("Missing period month");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid budget amount");

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    category,
    period_month: normalizedMonth,
    budget_amount: amount,
  };

  const { data: existing, error: existingError } = await supabase
    .from("maintenance_budgets")
    .select("id")
    .eq("account_id", accountId)
    .eq("period_month", normalizedMonth)
    .is("property_id", propertyId)
    .is("category", category)
    .maybeSingle();

  if (existingError && isMissingBackendObject(existingError)) {
    throw new Error("Maintenance budgets are not deployed yet.");
  }
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("maintenance_budgets")
      .update({ budget_amount: amount })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return { id: existing.id, ...payload };
  }

  const { data, error } = await supabase
    .from("maintenance_budgets")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return { id: data?.id || null, ...payload };
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
