function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function safeNumber(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function parseDate(value) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function isPaidStatus(status) {
  return ["paid", "opłacone"].includes(normalize(status));
}

function isOverdueStatus(status) {
  return ["overdue", "zaległe", "zalegle"].includes(normalize(status));
}

function isSettledMaintenanceStatus(status) {
  return ["resolved", "closed"].includes(normalize(status));
}

function isSettledWorkOrderStatus(status) {
  return ["completed", "cancelled"].includes(normalize(status));
}

export function getTenantRequestStatusMeta(status) {
  const key = normalize(status);
  if (key === "in_progress") {
    return {
      key,
      tone: "blue",
      labelKey: "tenantPortal.maintenance.requestStatus.inProgress",
      helpKey: "tenantPortal.maintenance.requestHelp.inProgress",
    };
  }
  if (key === "waiting") {
    return {
      key,
      tone: "slate",
      labelKey: "tenantPortal.maintenance.requestStatus.waiting",
      helpKey: "tenantPortal.maintenance.requestHelp.waiting",
    };
  }
  if (key === "resolved") {
    return {
      key,
      tone: "green",
      labelKey: "tenantPortal.maintenance.requestStatus.resolved",
      helpKey: "tenantPortal.maintenance.requestHelp.resolved",
    };
  }
  if (key === "closed") {
    return {
      key,
      tone: "green",
      labelKey: "tenantPortal.maintenance.requestStatus.closed",
      helpKey: "tenantPortal.maintenance.requestHelp.closed",
    };
  }
  return {
    key: "open",
    tone: "amber",
    labelKey: "tenantPortal.maintenance.requestStatus.received",
    helpKey: "tenantPortal.maintenance.requestHelp.received",
  };
}

export function getTenantWorkOrderStatusMeta(status) {
  const key = normalize(status);
  if (key === "in_progress") {
    return {
      key,
      tone: "blue",
      labelKey: "tenantPortal.maintenance.workOrderStatus.inProgress",
      helpKey: "tenantPortal.maintenance.workOrderHelp.inProgress",
    };
  }
  if (key === "completed") {
    return {
      key,
      tone: "green",
      labelKey: "tenantPortal.maintenance.workOrderStatus.completed",
      helpKey: "tenantPortal.maintenance.workOrderHelp.completed",
    };
  }
  if (key === "blocked") {
    return {
      key,
      tone: "slate",
      labelKey: "tenantPortal.maintenance.workOrderStatus.waiting",
      helpKey: "tenantPortal.maintenance.workOrderHelp.waiting",
    };
  }
  if (key === "cancelled") {
    return {
      key,
      tone: "slate",
      labelKey: "tenantPortal.maintenance.workOrderStatus.cancelled",
      helpKey: "tenantPortal.maintenance.workOrderHelp.cancelled",
    };
  }
  return {
    key: "assigned",
    tone: "amber",
    labelKey: "tenantPortal.maintenance.workOrderStatus.scheduled",
    helpKey: "tenantPortal.maintenance.workOrderHelp.scheduled",
  };
}

export function buildTenantPaymentSummary(snapshot = {}, payments = []) {
  const paidFromSnapshot = safeNumber(snapshot?.tenant_paid_total);
  const dueFromSnapshot = safeNumber(snapshot?.tenant_due_total);
  const overdueFromSnapshot = safeNumber(snapshot?.tenant_overdue_total);
  const countFromSnapshot = safeNumber(snapshot?.tenant_due_overdue_count);

  const hasSnapshotValues =
    paidFromSnapshot > 0 ||
    dueFromSnapshot > 0 ||
    overdueFromSnapshot > 0 ||
    countFromSnapshot > 0;

  const sortedPayments = [...(Array.isArray(payments) ? payments : [])].sort((a, b) => {
    const aDate = parseDate(a?.paid_at || a?.due_date || a?.created_at)?.getTime() || 0;
    const bDate = parseDate(b?.paid_at || b?.due_date || b?.created_at)?.getTime() || 0;
    return bDate - aDate;
  });

  const derived = sortedPayments.reduce(
    (acc, row) => {
      const amount = safeNumber(row?.amount);
      if (isPaidStatus(row?.status) || row?.paid_at) {
        acc.paid += amount;
      } else if (isOverdueStatus(row?.status)) {
        acc.overdue += amount;
        acc.dueOrOverdueCount += 1;
      } else {
        acc.due += amount;
        acc.dueOrOverdueCount += 1;
      }
      return acc;
    },
    { paid: 0, due: 0, overdue: 0, dueOrOverdueCount: 0 },
  );

  const paid = hasSnapshotValues ? paidFromSnapshot : derived.paid;
  const due = hasSnapshotValues ? dueFromSnapshot : derived.due;
  const overdue = hasSnapshotValues ? overdueFromSnapshot : derived.overdue;
  const dueOrOverdueCount = hasSnapshotValues ? countFromSnapshot : derived.dueOrOverdueCount;
  const outstanding = due + overdue;

  let state = "clear";
  if (overdue > 0) state = "overdue";
  else if (outstanding > 0) state = "due";

  return {
    paid,
    due,
    overdue,
    outstanding,
    dueOrOverdueCount,
    recentPayments: sortedPayments.slice(0, 5),
    state,
  };
}

export function summarizeTenantMaintenance(requests = [], workOrders = []) {
  const requestRows = Array.isArray(requests) ? requests : [];
  const workOrderRows = Array.isArray(workOrders) ? workOrders : [];

  return {
    activeRequests: requestRows.filter((row) => !isSettledMaintenanceStatus(row?.status)).length,
    activeWorkOrders: workOrderRows.filter((row) => !isSettledWorkOrderStatus(row?.status)).length,
    resolvedRequests: requestRows.filter((row) => isSettledMaintenanceStatus(row?.status)).length,
  };
}

export function partitionTenantDocuments(documents = [], { recentDays = 30, now = new Date() } = {}) {
  const safeNow = parseDate(now) || new Date();
  const threshold = safeNow.getTime() - recentDays * 24 * 60 * 60 * 1000;
  const rows = [...(Array.isArray(documents) ? documents : [])].sort((a, b) => {
    const aTime = parseDate(a?.created_at)?.getTime() || 0;
    const bTime = parseDate(b?.created_at)?.getTime() || 0;
    return bTime - aTime;
  });

  const recent = [];
  const older = [];

  for (const row of rows) {
    const createdAt = parseDate(row?.created_at);
    if (createdAt && createdAt.getTime() >= threshold) recent.push(row);
    else older.push(row);
  }

  return {
    recent,
    older,
    total: rows.length,
  };
}
