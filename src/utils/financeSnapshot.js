export function safeNumber(value) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function propertyIdOf(row) {
  return row?.propertyId ?? row?.property_id ?? null;
}

export function getFinanceOverdueAmount(snapshot = {}) {
  const snapshotOverdue = safeNumber(snapshot?.overdue_income);
  const overdueFromProperties = Array.isArray(snapshot?.property_finance)
    ? snapshot.property_finance.reduce((sum, row) => {
      const status = normalize(row?.paymentStatus ?? row?.payment_status);
      return status === "overdue" ? sum + safeNumber(row?.remaining) : sum;
    }, 0)
    : 0;

  // Finance page treats property-level overdue balances as the fallback source of truth
  // because older aggregate snapshots can under-report current-cycle arrears.
  return Math.max(snapshotOverdue, overdueFromProperties);
}

export function getFinancePropertyBalanceMap(snapshot = {}) {
  const rows = Array.isArray(snapshot?.property_finance) ? snapshot.property_finance : [];
  const byProperty = new Map();

  for (const row of rows) {
    const propertyId = propertyIdOf(row);
    if (!propertyId) continue;

    const key = String(propertyId);
    const status = normalize(row?.paymentStatus ?? row?.payment_status);
    const existing = byProperty.get(key) || { remaining: 0, status: "pending" };

    byProperty.set(key, {
      remaining: existing.remaining + safeNumber(row?.remaining),
      status: status === "overdue" || existing.status === "overdue"
        ? "overdue"
        : status || existing.status,
    });
  }

  return byProperty;
}

export function financeAmountForProperty(snapshot = {}, propertyId, fallbackAmount = 0) {
  if (!propertyId) return safeNumber(fallbackAmount);
  const balance = getFinancePropertyBalanceMap(snapshot).get(String(propertyId));
  // Only overdue operational items are rewritten to Finance's live remaining
  // balance. Due-soon items intentionally keep their scheduled charge amount.
  if (!balance || balance.status !== "overdue" || balance.remaining <= 0) {
    return safeNumber(fallbackAmount);
  }
  return balance.remaining;
}
