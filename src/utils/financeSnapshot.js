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

function getPropertyFinanceRows(snapshot = {}) {
  return Array.isArray(snapshot?.property_finance) ? snapshot.property_finance : [];
}

export function getPropertyOverdueRemaining(snapshot = {}) {
  return getPropertyFinanceRows(snapshot).reduce((sum, row) => {
    const status = normalize(row?.paymentStatus ?? row?.payment_status);
    const remaining = safeNumber(row?.remaining);
    return status === "overdue" && remaining > 0 ? sum + remaining : sum;
  }, 0);
}

export function getFinanceOverdueAmount(snapshot = {}) {
  const rows = getPropertyFinanceRows(snapshot);
  if (rows.length > 0) {
    // Prefer the property-level running balances because they are the source of
    // truth for Finance UI allocation. If a future snapshot returns only a
    // partial property_finance list, this intentionally reports only those rows
    // instead of taking a stale-high aggregate.
    return getPropertyOverdueRemaining(snapshot);
  }

  // Keep the aggregate only as a legacy fallback for older snapshots that do
  // not include per-property running balances.
  return safeNumber(snapshot?.overdue_income);
}

export function getFinancePropertyBalanceMap(snapshot = {}) {
  const rows = getPropertyFinanceRows(snapshot);
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
