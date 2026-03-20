import { supabase } from "../lib/supabase";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

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

  const { data, error } = await supabase.rpc("finance_snapshot", {
    p_account_id: accountId,
    p_tenant_id: tenantId,
  });

  if (error && isMissingBackendObject(error)) {
    return {
      total_income: 0,
      overdue_income: 0,
      due_soon_income: 0,
      outstanding_income: 0,
      property_finance: [],
    };
  }
  if (error) {
    logSecurityRelevantFailure("finance_snapshot", {
      error,
      context: { accountId, tenantId },
    });
    throw friendly(error, "Failed to load finance snapshot");
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? {
    total_income: 0,
    overdue_income: 0,
    due_soon_income: 0,
    outstanding_income: 0,
    property_finance: [],
  };
}
