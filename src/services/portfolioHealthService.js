import { supabase } from "../lib/supabase";
import { formatCurrencyAmount } from "../utils/currency";
import { logSecurityRelevantFailure } from "./securityFailureLogger";
import {
  EMPTY_PORTFOLIO_HEALTH_SNAPSHOT,
  firstRpcRow,
  parsePortfolioHealthSnapshotRow,
} from "./rpcContracts";

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

export async function getPortfolioHealthSnapshot(accountId, tenantId = null) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("portfolio_health_snapshot", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
  });

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

  return parsePortfolioHealthSnapshotRow(firstRpcRow(data));
}

export async function getPortfolioAttentionItems(accountId, tenantId = null, limit = 10) {
  if (!accountId) throw new Error("Missing accountId");
  if (portfolioAttentionItemsUnavailable) return [];

  const { data, error } = await supabase.rpc("portfolio_attention_items", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
    p_limit: limit,
  });

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
  return Array.isArray(data) ? data : [];
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
