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
    // State-first gate: only rows with a proven known balance may contribute.
    // Without this check the function relies on the RPC invariant that unknown-state
    // rows have remaining=null; an adversarial row with paymentStatus="overdue" and
    // a non-null remaining would otherwise leak into the aggregate.
    const balanceState = row?.balanceState ?? row?.balance_state ?? "";
    if (balanceState !== "known") return sum;
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

/**
 * FIN-GATE-01 helper — returns true if the snapshot contains any tenancy row
 * whose balanceState is not "known" (i.e. finance tracking not yet activated).
 * Used by the portfolio-health bounded-transformer to decide whether arrears
 * aging buckets from the SQL RPC can be trusted (they include unknown tenancies).
 */
export function hasUnactivatedTenancies(snapshot = {}) {
  return getPropertyFinanceRows(snapshot).some((row) => {
    const balanceState = row?.balanceState ?? row?.balance_state ?? "";
    return balanceState !== "known";
  });
}

/**
 * FIN-GATE-01 helper — sums the `remaining` amount for all known-state rows.
 * Provides the gated "total outstanding" figure for the Portfolio Health headline
 * without relying on the SQL acc_outstanding_total (which uses a lease-date proxy
 * and has no tenancy_finance_activations join).
 *
 * Removal condition: remove when portfolio_health_snapshot SQL joins
 * acc_outstanding_total to tenancy_finance_activations (E-170 authority-layer gate).
 */
export function getFinanceTotalOutstanding(snapshot = {}) {
  return getPropertyFinanceRows(snapshot).reduce((sum, row) => {
    const balanceState = row?.balanceState ?? row?.balance_state ?? "";
    if (balanceState !== "known") return sum;
    return sum + safeNumber(row?.remaining);
  }, 0);
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
