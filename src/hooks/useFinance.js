// src/hooks/useFinance.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

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

      /* ======================
         PAYMENTS (TENANT AWARE)
         ====================== */
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
        .eq("account_id", activeAccountId);

      if (activeTenantId) {
        paymentsQuery = paymentsQuery.eq(
          "tenant_id",
          activeTenantId
        );
      }

      const { data: paymentRows, error } =
        await paymentsQuery;

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      /* ======================
         MAP PAYMENTS
         ====================== */
      const mappedPayments = paymentRows.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        dueDate: p.due_date,
        paidAt: p.paid_at,
        tenantId: p.tenant_id,
        propertyId: p.property_id,
        tenantName: p.tenants?.name ?? "—",
        propertyAddress:
          p.properties?.address ?? "—",
      }));

      setPayments(mappedPayments);

      /* ======================
         SUMMARY (FROM FILTERED PAYMENTS)
         ====================== */
      let totalIncome = 0;
      let overdueIncome = 0;
      let expectedIncome = 0;

      mappedPayments.forEach((p) => {
        if (p.status === "Opłacone") {
          totalIncome += p.amount;
        } else {
          expectedIncome += p.amount;
          overdueIncome += p.amount;
        }
      });

      setSummary({
        totalIncome,
        overdueIncome,
        expectedIncome,
      });

   /* ---------------------------
   PROPERTY BREAKDOWN (FIXED)
--------------------------- */
const byProperty = {};

for (const p of data) {
  const propertyId = p.tenants?.property_id;
  if (!propertyId) continue;

  if (!byProperty[propertyId]) {
    byProperty[propertyId] = {
      propertyId,
      address: p.properties?.address ?? "—",
      city: p.properties?.city ?? "",
      rent: 0,
      paid: 0,
      remaining: 0,
      paymentStatus: "Zaległe",
    };
  }

  byProperty[propertyId].rent += Number(p.amount);

  if (p.status === "Opłacone") {
    byProperty[propertyId].paid += Number(p.amount);
  } else {
    byProperty[propertyId].remaining += Number(p.amount);
  }
}

setPropertyFinance(Object.values(byProperty));
      setLoading(false);
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
