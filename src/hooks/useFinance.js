// src/hooks/useFinance.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { getFinanceSnapshot } from "../services/financeService";

export function useFinance({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [summary, setSummary] = useState({
    totalIncome: 0,
    overdueIncome: 0,
    expectedIncome: 0,
  });

  const [payments, setPayments] = useState([]);
  const [propertyFinance, setPropertyFinance] = useState([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    async function loadFinance() {
      setLoading(true);

      try {
        const [snapshot, paymentsRes] = await Promise.all([
          getFinanceSnapshot(activeAccountId, activeTenantId || null),
          (() => {
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
                tenants ( id, name ),
                properties ( id, address, city, rent )
              `)
              .eq("account_id", activeAccountId)
              .order("due_date", { ascending: false });

            if (activeTenantId) {
              paymentsQuery = paymentsQuery.eq("tenant_id", activeTenantId);
            }

            return paymentsQuery;
          })(),
        ]);

        if (paymentsRes.error) throw paymentsRes.error;

        const mappedPayments = (paymentsRes.data ?? []).map((p) => ({
          id: p.id,
          amount: Number(p.amount ?? 0),
          status: p.status,
          dueDate: p.due_date,
          paidAt: p.paid_at,
          tenantId: p.tenant_id,
          propertyId: p.property_id,
          tenantName: p.tenants?.name ?? "—",
          propertyAddress: p.properties?.address ?? "—",
        }));

        setPayments(mappedPayments);
        setSummary({
          totalIncome: Number(snapshot?.total_income ?? 0),
          overdueIncome: Number(snapshot?.overdue_income ?? 0),
          expectedIncome: Number(snapshot?.expected_income ?? 0),
        });
        setPropertyFinance(Array.isArray(snapshot?.property_finance) ? snapshot.property_finance : []);
      } catch (error) {
        console.error(error);
        setPayments([]);
        setSummary({
          totalIncome: 0,
          overdueIncome: 0,
          expectedIncome: 0,
        });
        setPropertyFinance([]);
      } finally {
        setLoading(false);
      }
    }

    loadFinance();
  }, [enabled, activeAccountId, activeTenantId]);

  return {
    summary,
    payments,
    propertyFinance,
    loading,
  };
}
