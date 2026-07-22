import { BALANCE_REASON_COPY } from "../types/finance";

/**
 * Extracts governed balance fields from a property_finance snapshot row.
 * State-first: all numeric/status fields are gated on balanceState === "known".
 *
 * MAY NOT: recalculate expected rent; sum raw payments; infer status from
 * `remaining`; turn unknown into zero; override reasonCode; derive lifecycle
 * state locally.
 *
 * Returns a flat object safe to spread into surface-level display logic.
 *
 * @param {object|null} snapshotRow — a parsed property_finance row from finance_snapshot
 * @returns {{ isKnown: boolean, outstandingMinor: number|null, paymentStatus: string,
 *             isOverdue: boolean, isClear: boolean, reasonCode: string|null,
 *             reasonPrimary: string|null, paid: number|null, remaining: number|null }}
 */
export function selectPropertyBalance(snapshotRow) {
  const balanceState = snapshotRow?.balanceState ?? "unknown_payment_history";
  const isKnown = balanceState === "known";

  if (!snapshotRow || !isKnown) {
    const reasonCode = snapshotRow?.reasonCode ?? "PAYMENT_HISTORY_NOT_IMPORTED";
    return {
      balanceState: snapshotRow?.balanceState ?? "unknown_payment_history",
      isKnown: false,
      outstandingMinor: null,
      paymentStatus: "unknown",
      isOverdue: false,
      isClear: false,
      reasonCode,
      reasonPrimary:
        BALANCE_REASON_COPY[reasonCode]?.primary ?? "Balance unavailable",
      paid: null,
      remaining: null,
    };
  }

  const outstandingMinor = snapshotRow.outstandingMinor ?? null;
  const paymentStatus = String(snapshotRow.paymentStatus ?? "").toLowerCase();

  return {
    balanceState,
    isKnown: true,
    outstandingMinor,
    paymentStatus,
    isOverdue: paymentStatus === "overdue",
    isClear: paymentStatus === "paid" || outstandingMinor === 0,
    reasonCode: null,
    reasonPrimary: null,
    paid: snapshotRow.paid ?? null,
    remaining: snapshotRow.remaining ?? null,
  };
}

/**
 * Finds the property_finance row matching a property ID in the snapshot array.
 * Returns null when not found (treat as unknown — not as zero).
 */
export function findPropertyBalanceRow(propertyFinanceRows, propertyId) {
  if (!Array.isArray(propertyFinanceRows) || !propertyId) return null;
  return (
    propertyFinanceRows.find(
      (row) =>
        String(row?.propertyId ?? row?.property_id ?? "") === String(propertyId),
    ) ?? null
  );
}

const AUTHORITY_UNAVAILABLE = {
  attributed: false,
  attributionState: "authority_unavailable",
  balance: null,
  reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE",
};

/**
 * Tenant-facing balance — authority unavailable under current finance model.
 *
 * finance_snapshot is property-scoped. While payments are filtered by tenant_id,
 * the expected obligation (rent × months), coverage_start, opening_balance_minor
 * and lease_end_date remain property-level values. The result is "property
 * obligation minus this tenant's payments" — not a tenancy balance. See ARCH-FIN-01.
 *
 * Scope validation is computed for diagnostic use only. A validated scope proves
 * the RPC was called under the correct tenant identity; it does NOT prove the
 * obligation calculation belongs to that tenancy. Balance rendering is never enabled.
 *
 * @param {Array} propertyFinanceRows — parsed property_finance rows from useFinance()
 * @param {string|null} activeTenantId — the logged-in tenant's own ID from TenantContext
 *
 * Always returns:
 *   { attributed: false, attributionState: "authority_unavailable",
 *     balance: null, reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE",
 *     scopeValidated: boolean }
 */
export function selectTenantBalance(propertyFinanceRows, activeTenantId = null) {
  let scopeValidated = false;

  if (
    activeTenantId &&
    Array.isArray(propertyFinanceRows) &&
    propertyFinanceRows.length === 1
  ) {
    const row = propertyFinanceRows[0];
    if (row.scopeTenancyId && String(row.scopeTenancyId) === String(activeTenantId)) {
      scopeValidated = true;
    }
  }

  return { ...AUTHORITY_UNAVAILABLE, scopeValidated };
}
