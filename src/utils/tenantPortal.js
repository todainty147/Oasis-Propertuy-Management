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

function timestampValue(...values) {
  for (const value of values) {
    const parsed = parseDate(value);
    if (parsed) return parsed.toISOString();
  }
  return null;
}

function normalizeHighlight(value) {
  const key = normalize(value);
  if (key === "action_required") return "action_required";
  if (key === "current") return "current";
  return "standard";
}

function compareTenantDocumentPriority(a, b) {
  const aHighlight = normalizeHighlight(a?.tenant_highlight);
  const bHighlight = normalizeHighlight(b?.tenant_highlight);
  const highlightWeight = {
    action_required: 0,
    current: 1,
    standard: 2,
  };

  const highlightDelta = (highlightWeight[aHighlight] ?? 9) - (highlightWeight[bHighlight] ?? 9);
  if (highlightDelta !== 0) return highlightDelta;

  const rankDelta = safeNumber(a?.tenant_highlight_rank || 100) - safeNumber(b?.tenant_highlight_rank || 100);
  if (rankDelta !== 0) return rankDelta;

  const aUpdated = parseDate(a?.tenant_highlight_updated_at || a?.updated_at || a?.created_at)?.getTime() || 0;
  const bUpdated = parseDate(b?.tenant_highlight_updated_at || b?.updated_at || b?.created_at)?.getTime() || 0;
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;

  const aCreated = parseDate(a?.created_at)?.getTime() || 0;
  const bCreated = parseDate(b?.created_at)?.getTime() || 0;
  return bCreated - aCreated;
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

function isActiveMaintenanceStatus(status) {
  return !isSettledMaintenanceStatus(status);
}

function isActiveWorkOrderStatus(status) {
  return !isSettledWorkOrderStatus(status);
}

function findFocusRequest(requestRows, workOrderRows) {
  const linkedRequestIds = new Set(
    workOrderRows
      .map((row) => row?.maintenance_request_id)
      .filter(Boolean)
      .map(String),
  );

  const activeWithWorkOrder = requestRows.find((row) =>
    isActiveMaintenanceStatus(row?.status) && linkedRequestIds.has(String(row?.id || "")),
  );
  if (activeWithWorkOrder) return activeWithWorkOrder;

  const activeRequest = requestRows.find((row) => isActiveMaintenanceStatus(row?.status));
  if (activeRequest) return activeRequest;

  return requestRows[0] || null;
}

function findFocusWorkOrder(focusRequest, workOrderRows) {
  if (!focusRequest) return workOrderRows.find((row) => isActiveWorkOrderStatus(row?.status)) || workOrderRows[0] || null;
  const requestId = String(focusRequest?.id || "");
  return (
    workOrderRows.find((row) => String(row?.maintenance_request_id || "") === requestId && isActiveWorkOrderStatus(row?.status)) ||
    workOrderRows.find((row) => String(row?.maintenance_request_id || "") === requestId) ||
    workOrderRows.find((row) => isActiveWorkOrderStatus(row?.status)) ||
    workOrderRows[0] ||
    null
  );
}

function milestoneState({ complete = false, current = false, blocked = false } = {}) {
  if (blocked) return "blocked";
  if (current) return "current";
  if (complete) return "complete";
  return "upcoming";
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

export function buildTenantMaintenanceProgress(requests = [], workOrders = []) {
  const requestRows = Array.isArray(requests) ? requests : [];
  const workOrderRows = Array.isArray(workOrders) ? workOrders : [];
  const focusRequest = findFocusRequest(requestRows, workOrderRows);
  const focusWorkOrder = findFocusWorkOrder(focusRequest, workOrderRows);

  if (!focusRequest && !focusWorkOrder) {
    return {
      hasItems: false,
      title: "",
      currentStepKey: "tenantDashboard.progress.noActiveStep",
      milestones: [],
    };
  }

  const requestStatus = normalize(focusRequest?.status || "");
  const workOrderStatus = normalize(focusWorkOrder?.status || "");
  const hasWorkOrder = Boolean(focusWorkOrder?.id);
  const hasScheduledVisit = Boolean(focusWorkOrder?.scheduled_at);
  const isBlocked = workOrderStatus === "blocked" || requestStatus === "waiting";
  const isCompleted =
    ["resolved", "closed"].includes(requestStatus) ||
    workOrderStatus === "completed";
  const isCancelled = workOrderStatus === "cancelled";
  const isInProgress =
    requestStatus === "in_progress" ||
    ["in_progress", "blocked", "completed", "cancelled"].includes(workOrderStatus);
  const workOrderActuallyStarted = ["in_progress", "blocked", "completed", "cancelled"].includes(workOrderStatus);

  const reviewed = requestStatus !== "open" || hasWorkOrder || isCompleted || isCancelled;
  const assigned = hasWorkOrder;
  const scheduled = hasScheduledVisit || ["in_progress", "blocked", "completed"].includes(workOrderStatus);

  const milestones = [
    {
      key: "reported",
      labelKey: "tenantDashboard.progress.reported",
      bodyKey: "tenantDashboard.progress.reportedBody",
      at: timestampValue(focusRequest?.created_at, focusWorkOrder?.created_at),
      state: "complete",
    },
    {
      key: "reviewed",
      labelKey: "tenantDashboard.progress.reviewed",
      bodyKey: "tenantDashboard.progress.reviewedBody",
      at: reviewed ? timestampValue(focusRequest?.updated_at, focusRequest?.created_at) : null,
      state: milestoneState({
        complete: reviewed,
        current: !reviewed,
      }),
    },
    {
      key: "assigned",
      labelKey: "tenantDashboard.progress.assigned",
      bodyKey: "tenantDashboard.progress.assignedBody",
      at: assigned ? timestampValue(focusWorkOrder?.assigned_at, focusWorkOrder?.created_at) : null,
      state: milestoneState({
        complete: assigned,
        current: reviewed && !assigned && !isCompleted && !isCancelled,
      }),
    },
    {
      key: "scheduled",
      labelKey: "tenantDashboard.progress.scheduled",
      bodyKey: "tenantDashboard.progress.scheduledBody",
      at: scheduled ? timestampValue(focusWorkOrder?.scheduled_at, focusWorkOrder?.updated_at, focusWorkOrder?.created_at) : null,
      state: milestoneState({
        complete: scheduled,
        current: assigned && !scheduled && !isInProgress && !isCompleted && !isCancelled,
        blocked: isBlocked && assigned && !isCompleted && !isCancelled,
      }),
    },
    {
      key: "in_progress",
      labelKey: "tenantDashboard.progress.inProgress",
      bodyKey: "tenantDashboard.progress.inProgressBody",
      at: isInProgress ? timestampValue(focusWorkOrder?.updated_at, focusRequest?.updated_at) : null,
      state: milestoneState({
        complete: workOrderActuallyStarted || isCompleted,
        current: isInProgress && !workOrderActuallyStarted && !isCompleted && !isCancelled,
        blocked: isBlocked && !isCompleted && !isCancelled,
      }),
    },
    {
      key: isCancelled ? "cancelled" : "completed",
      labelKey: isCancelled ? "tenantDashboard.progress.cancelled" : "tenantDashboard.progress.completed",
      bodyKey: isCancelled ? "tenantDashboard.progress.cancelledBody" : "tenantDashboard.progress.completedBody",
      at: isCompleted || isCancelled
        ? timestampValue(focusWorkOrder?.updated_at, focusRequest?.updated_at)
        : null,
      state: milestoneState({
        complete: isCompleted || isCancelled,
      }),
    },
  ];

  const currentMilestone =
    milestones.find((row) => row.state === "blocked") ||
    milestones.find((row) => row.state === "current") ||
    [...milestones].reverse().find((row) => row.state === "complete") ||
    milestones[0];

  return {
    hasItems: true,
    requestId: focusRequest?.id || focusWorkOrder?.maintenance_request_id || null,
    workOrderId: focusWorkOrder?.id || null,
    title: focusRequest?.title || "",
    currentStepKey: currentMilestone?.labelKey || "tenantDashboard.progress.noActiveStep",
    milestones,
  };
}

export function partitionTenantDocuments(documents = [], { recentDays = 30, now = new Date() } = {}) {
  const safeNow = parseDate(now) || new Date();
  const threshold = safeNow.getTime() - recentDays * 24 * 60 * 60 * 1000;
  const rows = [...(Array.isArray(documents) ? documents : [])].sort(compareTenantDocumentPriority);

  const recent = [];
  const older = [];
  const attention = [];
  const current = [];
  const standard = [];

  for (const row of rows) {
    const highlight = normalizeHighlight(row?.tenant_highlight);
    const createdAt = parseDate(row?.created_at);
    if (highlight === "action_required") attention.push(row);
    else if (highlight === "current") current.push(row);
    else standard.push(row);
    if (createdAt && createdAt.getTime() >= threshold) recent.push(row);
    else older.push(row);
  }

  return {
    attention: attention.sort(compareTenantDocumentPriority),
    current: current.sort(compareTenantDocumentPriority),
    standard: standard.sort(compareTenantDocumentPriority),
    recent: recent.sort(compareTenantDocumentPriority),
    older: older.sort(compareTenantDocumentPriority),
    total: rows.length,
  };
}
