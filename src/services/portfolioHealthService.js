import { supabase } from "../lib/supabase";
import { formatCurrencyAmount } from "../utils/currency";
import {
  financeAmountForProperty,
  getFinanceOverdueAmount,
  getFinanceTotalOutstanding,
  hasUnactivatedTenancies,
  safeNumber,
} from "../utils/financeSnapshot";
import { getFinanceSnapshot } from "./financeService";
import {
  logOperationalLatencySample,
  logSecurityRelevantFailure,
  logSlowOperationalTelemetry,
  startOperationalTimer,
} from "./securityFailureLogger";
import {
  EMPTY_PORTFOLIO_HEALTH_SNAPSHOT,
  firstRpcRow,
  parsePortfolioAttentionItemRow,
  parsePortfolioHealthSnapshotRow,
  parseRpcRows,
} from "./rpcContracts";
import {
  buildSnapshotCacheKey,
  getSnapshotCacheValue,
  setSnapshotCacheValue,
} from "./snapshotCache";

let portfolioAttentionItemsUnavailable = false;

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

/**
 * FIN-GATE-01 bounded transformer (P2 + P4).
 *
 * Atomically gates ALL financial sibling fields on the portfolio health snapshot
 * object using the state-first gated financeSnapshot authority.  Mutates `snapshot`
 * in place; always called as a unit — independent field-by-field patches are prohibited.
 *
 * Fields covered:
 *   overdue_amount        — gated overdue sum (known-state rows only)
 *   outstanding_amount    — gated outstanding sum (replaces SQL Math.max with phantom total)
 *   arrearsAgingState     — explicit availability flag read by the page component
 *   overdue_0_7_amount    — suppressed to null when any unactivated tenancy exists
 *   overdue_8_30_amount   — suppressed to null when any unactivated tenancy exists
 *   overdue_30_plus_amount — suppressed to null when any unactivated tenancy exists
 *
 * Page-level invariant:
 *   When arrearsAgingState === "available": overdue total === sum of displayed aging buckets.
 *   When arrearsAgingState === "unavailable_unknown_balances": no numeric aging buckets
 *   are displayed — the page renders the neutral unavailability copy instead.
 *
 * Removal condition: remove the outstanding_amount and arrears-bucket suppression
 * blocks when portfolio_health_snapshot SQL joins acc_outstanding_total and all
 * three aging bucket CTEs to tenancy_finance_activations (E-170 authority-layer gate).
 */
export function applyFinanceGateToPortfolioSnapshot(snapshot, financeSnapshot) {
  const overdueAmount = getFinanceOverdueAmount(financeSnapshot);
  const anyUnknown = hasUnactivatedTenancies(financeSnapshot);

  // P2 — overdue headline (existing correct behavior, kept explicit)
  snapshot.overdue_amount = overdueAmount;

  // P2 — outstanding: replace SQL lease-date proxy (Math.max was picking the
  // larger of an ungated SQL value and the gated overdue, exposing phantom
  // accumulation).  Use the gated sum of known-state remaining amounts.
  snapshot.outstanding_amount = getFinanceTotalOutstanding(financeSnapshot);

  // P4 — arrears aging state: explicit flag the page reads INSTEAD of
  // attempting to render numeric values when buckets cannot be trusted.
  snapshot.arrearsAgingState = anyUnknown ? "unavailable_unknown_balances" : "available";

  // P4 — arrears aging buckets: atomically suppress all three when any tenancy
  // lacks activation.  The SQL GREATEST() expression in the 30+ bucket and the
  // raw payment-bucket CTEs for 0–7 and 8–30 days include unknown-tenancy rows;
  // they cannot be trusted when anyUnknown is true.
  if (anyUnknown) {
    snapshot.overdue_0_7_amount = null;
    snapshot.overdue_8_30_amount = null;
    snapshot.overdue_30_plus_amount = null;
  }
}

export async function getPortfolioHealthSnapshot(accountId, tenantId = null, { forceRefresh = false } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const cacheKey = buildSnapshotCacheKey("portfolio_health_snapshot", { accountId, tenantId });
  if (!forceRefresh) {
    const cached = getSnapshotCacheValue(cacheKey);
    if (cached) return cached;
  }

  const thresholdMs = 1500;

  const portfolioRequest = (async () => {
    const requestStartedAt = startOperationalTimer();
    const result = await supabase.rpc("portfolio_health_snapshot", {
      p_account_id: accountId,
      p_tenant_id: tenantId,
    });

    return {
      ...result,
      durationMs: startOperationalTimer() - requestStartedAt,
    };
  })();

  const [portfolioResult, financeSnapshot] = await Promise.all([
    portfolioRequest,
    getFinanceSnapshot(accountId, tenantId, { forceRefresh }).catch(() => null),
  ]);

  const { data, error, durationMs } = portfolioResult;

  if (error && isMissingBackendObject(error)) {
    return { ...EMPTY_PORTFOLIO_HEALTH_SNAPSHOT };
  }
  if (error) {
    logSecurityRelevantFailure("portfolio_health_snapshot", {
      error,
      context: { accountId, tenantId },
    });
    throw friendly(error, "Failed to load portfolio health snapshot");
  }

  logOperationalLatencySample("portfolio_health_snapshot", {
    accountId,
    surface: "portfolio_health",
    durationMs,
    targetMs: thresholdMs,
    context: { hasTenantScope: Boolean(tenantId) },
  });
  logSlowOperationalTelemetry("portfolio_health_snapshot", {
    accountId,
    surface: "portfolio_health",
    durationMs,
    thresholdMs,
    context: { hasTenantScope: Boolean(tenantId) },
  });
  const snapshot = parsePortfolioHealthSnapshotRow(firstRpcRow(data));
  if (financeSnapshot) {
    // FIN-GATE-01 P2+P4: bounded transformer — atomically gates ALL financial
    // sibling fields on tenancy_finance_activations via the gated financeSnapshot.
    applyFinanceGateToPortfolioSnapshot(snapshot, financeSnapshot);
  }
  return setSnapshotCacheValue(cacheKey, snapshot);
}

export async function getPortfolioAttentionItems(accountId, tenantId = null, limit = 10) {
  if (!accountId) throw new Error("Missing accountId");
  if (portfolioAttentionItemsUnavailable) return [];

  const [{ data, error }, financeSnapshot] = await Promise.all([
    supabase.rpc("portfolio_attention_items", {
      p_account_id: accountId,
      p_tenant_id: tenantId,
      p_limit: limit,
    }),
    getFinanceSnapshot(accountId, tenantId).catch(() => null),
  ]);

  if (error && isMissingBackendObject(error)) {
    portfolioAttentionItemsUnavailable = true;
    return [];
  }
  if (error) {
    logSecurityRelevantFailure("portfolio_attention_items", {
      error,
      context: { accountId, tenantId, limit },
    });
    throw friendly(error, "Failed to load portfolio attention items");
  }

  return parseRpcRows(data || [], parsePortfolioAttentionItemRow, "portfolio attention items")
    .map((item) => {
      if (String(item?.item_type || "").toLowerCase() !== "overdue_payment") return item;
      return {
        ...item,
        amount: financeAmountForProperty(financeSnapshot, item.property_id, item.amount),
      };
    });
}

export function mapPortfolioAttentionItems(items = [], t) {
  return (items || []).map((item) => {
    const type = String(item?.item_type || "").toLowerCase();
    if (type === "lease_expired") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.leaseExpired"),
        subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/tenants",
      };
    }
    if (type === "lease_expiring_soon") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.leaseExpiringSoon"),
        subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/tenants",
      };
    }
    if (type === "lease_renewal_in_progress") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.leaseRenewalInProgress"),
        subtitle: `${item.tenant_label || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/tenants",
      };
    }
    if (type === "vacant") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.vacant"),
        subtitle: item.property_label || "—",
        to: item.link_path || "/properties?status=vacant",
      };
    }
    if (type === "vacant_long") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.vacantLong"),
        subtitle: `${item.property_label || "—"} (${item.days_vacant || 0}d)`,
        to: item.link_path || "/properties?status=vacant&aging=14d",
      };
    }
    if (type === "overdue_payment") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.overduePayment"),
        subtitle: formatCurrencyAmount(item.amount || 0),
        to: item.link_path || "/finance?status=overdue",
      };
    }
    if (type === "due_soon_payment") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.dueSoon"),
        subtitle: formatCurrencyAmount(item.amount || 0),
        to: item.link_path || "/finance?status=due&range=7d",
      };
    }
    if (type === "triage_over_24h") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.triageOver24h"),
        subtitle: `${item.request_title || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/maintenance-inbox?status=open",
      };
    }
    if (type === "contractor_ack_overdue") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.contractorAckOverdue"),
        subtitle: `${item.request_title || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/attention-center",
      };
    }
    if (type === "stalled_in_progress_repair") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.stalledRepair"),
        subtitle: `${item.request_title || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/attention-center",
      };
    }
    if (type === "long_running_repair") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.longRunningRepair"),
        subtitle: `${item.request_title || "—"} • ${item.property_label || "—"}`,
        to: item.link_path || "/attention-center",
      };
    }
    if (type === "repeated_repairs_property") {
      return {
        key: item.item_key,
        title: t("portfolio.attention.repeatRepairs"),
        subtitle: item.property_label || "—",
        to: item.link_path || "/attention-center",
      };
    }
    return {
      key: item.item_key,
      title: t("portfolio.attention.highPriority"),
      subtitle: item.request_title || "—",
      to: item.link_path || "/maintenance-inbox?priority=high,critical",
    };
  });
}
