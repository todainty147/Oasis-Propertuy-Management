import { supabase } from "../lib/supabase";
import { getDerivedLeaseStatus } from "./leaseService";
import { listMissingComplianceSetup } from "./complianceService";
import { parsePropertyOperationalHealthSnapshotRow, parseRpcRows } from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

const HEALTH_SCORE_BASE = 100;
const HEALTH_THRESHOLDS = {
  healthy: 85,
  attention_needed: 60,
};

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysAgo(days) {
  const date = startOfToday();
  date.setDate(date.getDate() - days);
  return date;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isOverduePayment(row) {
  const status = normalize(row?.status);
  if (["overdue", "zaległe", "zalegle"].includes(status)) return true;
  if (row?.paid_at || row?.paidAt) return false;
  const due = toDateOnly(row?.due_date || row?.dueDate);
  if (!due) return false;
  return due < startOfToday();
}

function isOpenRequest(row) {
  return ["open", "in_progress", "waiting", "otwarte", "w trakcie", "oczekuje"].includes(normalize(row?.status));
}

function isActiveWorkOrder(row) {
  return ["assigned", "in_progress", "blocked", "przypisane", "w trakcie", "zablokowane"].includes(
    normalize(row?.status),
  );
}

function isInProgressLikeWorkOrder(row) {
  return ["in_progress", "w trakcie", "blocked", "zablokowane"].includes(normalize(row?.status));
}

function isActivePreventiveTask(row) {
  return normalize(row?.status) === "active";
}

function isOpenComplianceItem(row) {
  return !["completed", "cancelled"].includes(normalize(row?.status));
}

function makeReason(key, penalty, meta = {}) {
  return { key, penalty, ...meta };
}

export function getPropertyOperationalHealthCategory(score) {
  const value = Number(score || 0);
  if (value >= HEALTH_THRESHOLDS.healthy) return "healthy";
  if (value >= HEALTH_THRESHOLDS.attention_needed) return "attention_needed";
  return "high_risk";
}

export function calculatePropertyOperationalHealth({
  property,
  payments = [],
  maintenanceRequests = [],
  workOrders = [],
  preventiveTasks = [],
  complianceItems = [],
  missingComplianceItems = [],
  leases = [],
  operatingExpenses = [],
  tenantCount = 0,
} = {}) {
  const monthlyRent = Number(property?.rent || 0);
  const recent90Cutoff = daysAgo(90);
  const today = startOfToday();

  const overdueRentAmount = payments.reduce((sum, row) => {
    if (!isOverduePayment(row)) return sum;
    return sum + Number(row?.amount || 0);
  }, 0);

  const openRequests = maintenanceRequests.filter(isOpenRequest);
  const activeWorkOrders = workOrders.filter(isActiveWorkOrder);

  const stalledRepairs = activeWorkOrders.filter((row) => {
    if (!isInProgressLikeWorkOrder(row)) return false;
    const updatedAt = toDate(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt);
    if (!updatedAt) return false;
    return updatedAt <= new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  });

  const ackOverdue = activeWorkOrders.filter((row) => {
    const ackStatus = normalize(row?.acknowledgement_status || row?.acknowledgementStatus);
    if (ackStatus === "acknowledged" || ackStatus === "not_required") return false;
    const ackDue = toDate(row?.acknowledgement_due_at || row?.acknowledgementDueAt);
    return !!ackDue && ackDue < new Date();
  });

  const longRunningRepairs = activeWorkOrders.filter((row) => {
    const createdAt = toDate(row?.created_at || row?.createdAt);
    if (!createdAt) return false;
    return createdAt <= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  });

  const recentRequests90 = openRequests.concat(
    maintenanceRequests.filter((row) => {
      const createdAt = toDate(row?.created_at || row?.createdAt);
      return createdAt && createdAt >= recent90Cutoff;
    }),
  );
  const requests90Count = new Set(recentRequests90.map((row) => row?.id).filter(Boolean)).size;

  const overduePreventive = preventiveTasks.filter((row) => {
    if (!isActivePreventiveTask(row)) return false;
    const due = toDateOnly(row?.next_due_date || row?.nextDueDate);
    return !!due && due < today;
  });

  const dueSoonPreventive = preventiveTasks.filter((row) => {
    if (!isActivePreventiveTask(row)) return false;
    const due = toDateOnly(row?.next_due_date || row?.nextDueDate);
    if (!due || due < today) return false;
    return due <= new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  });

  const overdueCompliance = complianceItems.filter((row) => {
    if (!isOpenComplianceItem(row)) return false;
    const due = toDateOnly(row?.due_date || row?.dueDate);
    return !!due && due < today;
  });

  const dueSoonCompliance = complianceItems.filter((row) => {
    if (!isOpenComplianceItem(row)) return false;
    const due = toDateOnly(row?.due_date || row?.dueDate);
    if (!due || due < today) return false;
    const reminderWindowDays = Math.max(0, Number(row?.reminder_window_days || row?.reminderWindowDays || 30));
    return due <= new Date(today.getTime() + reminderWindowDays * 24 * 60 * 60 * 1000);
  });

  const missingComplianceCount = Array.isArray(missingComplianceItems) ? missingComplianceItems.length : 0;

  const derivedLeaseStatuses = leases.map((row) => getDerivedLeaseStatus(row));
  const hasExpiredLease = derivedLeaseStatuses.includes("ended");
  const hasExpiringLease = derivedLeaseStatuses.includes("expiring_soon");
  const hasRenewalInProgress = derivedLeaseStatuses.includes("renewal_in_progress");

  const recentOperatingExpenses = operatingExpenses.reduce((sum, row) => {
    const expenseDate = toDateOnly(row?.expense_date || row?.expenseDate || row?.created_at);
    if (!expenseDate || expenseDate < recent90Cutoff) return sum;
    return sum + Number(row?.amount || 0);
  }, 0);

  const recentMaintenanceCost = workOrders.reduce((sum, row) => {
    const basis = toDate(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt);
    if (!basis || basis < recent90Cutoff) return sum;
    return sum + Number(row?.invoice_amount || row?.invoiceAmount || 0);
  }, 0);

  const reasons = [];

  if (overdueRentAmount > 0) {
    const severe = monthlyRent > 0 && overdueRentAmount >= monthlyRent;
    reasons.push(makeReason("overdue_rent", severe ? 30 : 22, { amount: overdueRentAmount }));
  }

  const maintenancePressure = openRequests.length + activeWorkOrders.length;
  if (maintenancePressure >= 4) {
    reasons.push(makeReason("maintenance_pressure", 10, { count: maintenancePressure }));
  } else if (maintenancePressure >= 2) {
    reasons.push(makeReason("maintenance_pressure", 6, { count: maintenancePressure }));
  } else if (maintenancePressure > 0) {
    reasons.push(makeReason("maintenance_pressure", 3, { count: maintenancePressure }));
  }

  if (stalledRepairs.length > 0) {
    reasons.push(makeReason("stalled_repairs", Math.min(18, stalledRepairs.length * 9), { count: stalledRepairs.length }));
  }

  if (ackOverdue.length > 0) {
    reasons.push(makeReason("contractor_ack_overdue", Math.min(16, ackOverdue.length * 8), { count: ackOverdue.length }));
  }

  if (longRunningRepairs.length > 0) {
    reasons.push(makeReason("long_running_repairs", Math.min(12, longRunningRepairs.length * 6), { count: longRunningRepairs.length }));
  }

  if (requests90Count >= 3) {
    reasons.push(makeReason("repeat_repairs", 8, { count: requests90Count }));
  }

  if (overduePreventive.length > 0) {
    reasons.push(makeReason("preventive_overdue", 8, { count: overduePreventive.length }));
  } else if (dueSoonPreventive.length > 0) {
    reasons.push(makeReason("preventive_due_soon", 3, { count: dueSoonPreventive.length }));
  }

  if (overdueCompliance.length > 0) {
    reasons.push(makeReason("compliance_overdue", 12, { count: overdueCompliance.length }));
  } else if (dueSoonCompliance.length > 0) {
    reasons.push(makeReason("compliance_due_soon", 4, { count: dueSoonCompliance.length }));
  }

  if (missingComplianceCount > 0) {
    reasons.push(makeReason("compliance_missing_setup", 6, { count: missingComplianceCount }));
  }

  if (hasExpiredLease) {
    reasons.push(makeReason("lease_expired", 15));
  } else if (hasExpiringLease) {
    reasons.push(makeReason("lease_expiring", 6));
  } else if (hasRenewalInProgress) {
    reasons.push(makeReason("lease_renewal_in_progress", 4));
  }

  const recentCostPressure = recentOperatingExpenses + recentMaintenanceCost;
  if (monthlyRent > 0 && recentCostPressure >= monthlyRent * 2) {
    reasons.push(makeReason("operating_cost_pressure", 6, { amount: recentCostPressure }));
  }

  if (Number(tenantCount || 0) === 0) {
    reasons.push(makeReason("vacant_property", 4));
  }

  const totalPenalty = reasons.reduce((sum, row) => sum + Number(row.penalty || 0), 0);
  const score = Math.max(0, HEALTH_SCORE_BASE - totalPenalty);
  const category = getPropertyOperationalHealthCategory(score);

  return {
    propertyId: property?.id || null,
    propertyLabel: property?.address || "",
    score,
    category,
    reasons: reasons.sort((a, b) => Number(b.penalty || 0) - Number(a.penalty || 0)),
    signals: {
      overdueRentAmount,
      openRequestCount: openRequests.length,
      activeWorkOrderCount: activeWorkOrders.length,
      stalledRepairCount: stalledRepairs.length,
      ackOverdueCount: ackOverdue.length,
      longRunningRepairCount: longRunningRepairs.length,
      requests90Count,
      overduePreventiveCount: overduePreventive.length,
      dueSoonPreventiveCount: dueSoonPreventive.length,
      overdueComplianceCount: overdueCompliance.length,
      dueSoonComplianceCount: dueSoonCompliance.length,
      missingComplianceCount,
      hasExpiredLease,
      hasExpiringLease,
      hasRenewalInProgress,
      recentOperatingExpenses,
      recentMaintenanceCost,
      tenantCount: Number(tenantCount || 0),
    },
  };
}

async function selectOrEmpty(query, fallback = []) {
  const { data, error } = await query;
  if (error && isMissingBackendObject(error)) return fallback;
  if (error) throw error;
  return Array.isArray(data) ? data : fallback;
}

export async function listPropertyOperationalHealthScores(accountId, { propertyId = null, limit = 200 } = {}) {
  if (!accountId) return [];

  const { data: snapshotRows, error: snapshotError } = await supabase.rpc(
    "property_operational_health_snapshot",
    {
      p_account_id: accountId,
      p_property_id: propertyId,
      p_limit: limit,
    },
  );

  if (!snapshotError) {
    return parseRpcRows(
      snapshotRows || [],
      parsePropertyOperationalHealthSnapshotRow,
      "property operational health snapshot rows",
    );
  }

  if (snapshotError && !isMissingBackendObject(snapshotError)) {
    logSecurityRelevantFailure("property_operational_health_snapshot", {
      error: snapshotError,
      context: { accountId, propertyId },
    });
    throw snapshotError;
  }

  let propertiesQuery = supabase
    .from("properties")
    .select("id, account_id, address, city, rent")
    .eq("account_id", accountId)
    .order("address", { ascending: true })
    .limit(limit);

  if (propertyId) propertiesQuery = propertiesQuery.eq("id", propertyId);

  const properties = await selectOrEmpty(propertiesQuery);
  if (properties.length === 0) return [];

  const propertyIds = properties.map((row) => row.id);

  const [
    payments,
    requests,
    workOrders,
    preventiveTasks,
    complianceItems,
    leases,
    tenants,
    operatingExpenses,
    missingComplianceItems,
  ] = await Promise.all([
    selectOrEmpty(
      supabase
        .from("payments")
        .select("id, property_id, amount, status, due_date, paid_at")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("maintenance_requests")
        .select("id, property_id, status, created_at")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("work_orders")
        .select("id, property_id, status, created_at, updated_at, acknowledgement_status, acknowledgement_due_at, invoice_amount")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("preventive_maintenance_tasks")
        .select("id, property_id, status, next_due_date")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("compliance_items")
        .select("id, property_id, status, due_date, reminder_window_days")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("leases")
        .select("id, property_id, lease_end_date, renewal_status")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(1000),
    ),
    selectOrEmpty(
      supabase
        .from("tenants")
        .select("id, property_id")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    selectOrEmpty(
      supabase
        .from("property_operating_expenses")
        .select("id, property_id, expense_date, amount")
        .eq("account_id", accountId)
        .in("property_id", propertyIds)
        .limit(2000),
    ),
    listMissingComplianceSetup(accountId, { limit: 500 }),
  ]);

  const paymentsByProperty = new Map();
  const requestsByProperty = new Map();
  const workOrdersByProperty = new Map();
  const preventiveByProperty = new Map();
  const complianceByProperty = new Map();
  const leasesByProperty = new Map();
  const tenantCountByProperty = new Map();
  const opexByProperty = new Map();
  const missingComplianceByProperty = new Map();

  for (const row of payments) {
    const list = paymentsByProperty.get(row.property_id) || [];
    list.push(row);
    paymentsByProperty.set(row.property_id, list);
  }
  for (const row of requests) {
    const list = requestsByProperty.get(row.property_id) || [];
    list.push(row);
    requestsByProperty.set(row.property_id, list);
  }
  for (const row of workOrders) {
    const list = workOrdersByProperty.get(row.property_id) || [];
    list.push(row);
    workOrdersByProperty.set(row.property_id, list);
  }
  for (const row of preventiveTasks) {
    const list = preventiveByProperty.get(row.property_id) || [];
    list.push(row);
    preventiveByProperty.set(row.property_id, list);
  }
  for (const row of complianceItems) {
    const list = complianceByProperty.get(row.property_id) || [];
    list.push(row);
    complianceByProperty.set(row.property_id, list);
  }
  for (const row of leases) {
    const list = leasesByProperty.get(row.property_id) || [];
    list.push(row);
    leasesByProperty.set(row.property_id, list);
  }
  for (const row of tenants) {
    tenantCountByProperty.set(row.property_id, (tenantCountByProperty.get(row.property_id) || 0) + 1);
  }
  for (const row of operatingExpenses) {
    const list = opexByProperty.get(row.property_id) || [];
    list.push(row);
    opexByProperty.set(row.property_id, list);
  }
  for (const row of missingComplianceItems || []) {
    const list = missingComplianceByProperty.get(row.property_id) || [];
    list.push(row);
    missingComplianceByProperty.set(row.property_id, list);
  }

  return properties
    .map((property) =>
      calculatePropertyOperationalHealth({
        property,
        payments: paymentsByProperty.get(property.id) || [],
        maintenanceRequests: requestsByProperty.get(property.id) || [],
        workOrders: workOrdersByProperty.get(property.id) || [],
        preventiveTasks: preventiveByProperty.get(property.id) || [],
        complianceItems: complianceByProperty.get(property.id) || [],
        missingComplianceItems: missingComplianceByProperty.get(property.id) || [],
        leases: leasesByProperty.get(property.id) || [],
        operatingExpenses: opexByProperty.get(property.id) || [],
        tenantCount: tenantCountByProperty.get(property.id) || 0,
      }),
    )
    .sort((a, b) => a.score - b.score || a.propertyLabel.localeCompare(b.propertyLabel));
}

export function summarizePropertyOperationalHealth(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length;
  const averageScore =
    total > 0 ? Math.round(list.reduce((sum, row) => sum + Number(row.score || 0), 0) / total) : 0;
  const healthyCount = list.filter((row) => row.category === "healthy").length;
  const attentionCount = list.filter((row) => row.category === "attention_needed").length;
  const highRiskCount = list.filter((row) => row.category === "high_risk").length;

  return {
    total,
    averageScore,
    healthyCount,
    attentionCount,
    highRiskCount,
    lowestProperties: list.slice(0, 6),
  };
}
