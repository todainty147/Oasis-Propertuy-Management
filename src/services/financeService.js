import { supabase } from "../lib/supabase";
import {
  logOperationalLatencySample,
  logSecurityRelevantFailure,
  logSlowOperationalTelemetry,
  startOperationalTimer,
} from "./securityFailureLogger";
import {
  EMPTY_FINANCE_SNAPSHOT,
  firstRpcRow,
  parseFinanceSnapshotRow,
} from "./rpcContracts";

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

export async function getFinanceSnapshot(accountId, tenantId = null) {
  if (!accountId) throw new Error("Missing accountId");
  const startedAt = startOperationalTimer();
  const thresholdMs = 1200;

  const { data, error } = await supabase.rpc("finance_snapshot", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
  });

  if (error && isMissingBackendObject(error)) {
    return { ...EMPTY_FINANCE_SNAPSHOT };
  }
  if (error) {
    logSecurityRelevantFailure("finance_snapshot", {
      error,
      context: { accountId, tenantId },
    });
    throw friendly(error, "Failed to load finance snapshot");
  }

  const durationMs = startOperationalTimer() - startedAt;
  logOperationalLatencySample("finance_snapshot", {
    accountId,
    surface: "finance",
    durationMs,
    targetMs: thresholdMs,
    context: { hasTenantScope: Boolean(tenantId) },
  });
  logSlowOperationalTelemetry("finance_snapshot", {
    accountId,
    surface: "finance",
    durationMs,
    thresholdMs,
    context: { hasTenantScope: Boolean(tenantId) },
  });
  return parseFinanceSnapshotRow(firstRpcRow(data));
}
