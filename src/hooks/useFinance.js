// src/hooks/useFinance.js
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { getFinanceSnapshot } from "../services/financeService";
import { useRealtimeTables } from "./useRealtimeTables";

function safeNumber(value) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function useFinance({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [summary, setSummary] = useState({
    totalIncome: 0,
    overdueIncome: 0,
    dueSoonIncome: 0,
    outstandingIncome: 0,
  });

  const [payments, setPayments] = useState([]);
  const [propertyFinance, setPropertyFinance] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const loadFinance = useCallback(async ({ forceRefresh = false } = {}) => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let paymentsQuery = supabase
      .from("payments")
      .select(`
          id,
          amount,
          status,
          due_date,
          paid_at,
          tenant_id,
          property_id,
          notes,
          tenants ( id, name ),
          properties ( id, address, city, rent )
        `)
      .eq("account_id", activeAccountId)
      .order("due_date", { ascending: false });

    if (activeTenantId) {
      paymentsQuery = paymentsQuery.eq("tenant_id", activeTenantId);
    }

    const [snapshotResult, paymentsResult] = await Promise.allSettled([
      getFinanceSnapshot(activeAccountId, activeTenantId || null, { forceRefresh }),
      paymentsQuery,
    ]);

    const snapshotFailed = snapshotResult.status === "rejected";
    const paymentsSupabaseError = paymentsResult.status === "fulfilled" ? paymentsResult.value?.error : null;
    const paymentsFailed = paymentsResult.status === "rejected" || !!paymentsSupabaseError;
    const firstError = snapshotResult.reason ?? paymentsResult.reason ?? paymentsSupabaseError ?? null;

    setError(firstError);
    if (firstError) console.error("[useFinance]", firstError);

    if (!snapshotFailed) {
      const snapshot = snapshotResult.value;
      const propertyFinanceRows = Array.isArray(snapshot?.property_finance) ? snapshot.property_finance : [];
      const overdueFromProperties = propertyFinanceRows.reduce((sum, row) => {
        const status = String(row?.paymentStatus || row?.payment_status || "").toLowerCase();
        return status === "overdue" ? sum + safeNumber(row?.remaining) : sum;
      }, 0);
      const snapshotOverdue = safeNumber(snapshot?.overdue_income);

      setSummary({
        totalIncome: safeNumber(snapshot?.total_income),
        // Keep the property-level overdue fallback so current-cycle arrears do not disappear
        // if an older snapshot aggregate under-reports them.
        overdueIncome: Math.max(snapshotOverdue, overdueFromProperties),
        dueSoonIncome: safeNumber(snapshot?.due_soon_income),
        outstandingIncome: safeNumber(snapshot?.outstanding_income),
      });
      setPropertyFinance(propertyFinanceRows);
    }

    if (!paymentsFailed) {
      setPayments((paymentsResult.value.data ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount ?? 0),
        status: p.status,
        dueDate: p.due_date,
        paidAt: p.paid_at,
        tenantId: p.tenant_id,
        propertyId: p.property_id,
        notes: p.notes ?? null,
        propertyRent: Number(p.properties?.rent ?? 0),
        tenantName: p.tenants?.name ?? "—",
        propertyAddress: p.properties?.address ?? "—",
      })));
    }

    setLoading(false);
  }, [activeAccountId, activeTenantId, enabled]);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    loadFinance();
  }, [enabled, activeAccountId, activeTenantId, loadFinance]);

  useRealtimeTables({
    enabled: enabled && !!activeAccountId,
    subscriptions: [
      {
        channel: `finance-payments:${activeAccountId}`,
        table: "payments",
        filter: `account_id=eq.${activeAccountId}`,
      },
      {
        channel: `finance-properties:${activeAccountId}`,
        table: "properties",
        filter: `account_id=eq.${activeAccountId}`,
      },
      {
        channel: `finance-tenants:${activeAccountId}`,
        table: "tenants",
        filter: `account_id=eq.${activeAccountId}`,
      },
    ],
    onChange: () => loadFinance({ forceRefresh: true }),
  });

  return {
    summary,
    payments,
    propertyFinance,
    loading,
    error,
    reload: loadFinance,
  };
}
