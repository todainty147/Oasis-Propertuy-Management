// src/hooks/usePayments.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

export function usePayments({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function loadPayments() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id,
          amount,
          status,
          due_date,
          paid_at,
          tenant_id,
          property_id,
          tenants ( name ),
          properties ( address )
        `
        )
        .eq("account_id", activeAccountId)
        .order("due_date", { ascending: false });

      if (error) {
        setError(error);
        setPayments([]);
        setLoading(false);
        return;
      }

      const mapped = (data ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount ?? 0),
        status: p.status, // DB status (paid/due/overdue/void) OR legacy labels
        dueDate: p.due_date, // keep as ISO string/date
        paidAt: p.paid_at, // keep as ISO string/date
        tenantId: p.tenant_id,
        propertyId: p.property_id,
        tenantName: p.tenants?.name ?? "—",
        propertyAddress: p.properties?.address ?? "—",
      }));

      // ✅ TENANT SWITCH FILTER (unchanged behavior)
      setPayments(
        activeTenantId ? mapped.filter((p) => p.tenantId === activeTenantId) : mapped
      );

      setLoading(false);
    }

    loadPayments();

    channel = supabase
      .channel("payments-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `account_id=eq.${activeAccountId}`,
        },
        loadPayments
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, activeTenantId]);

  return { payments, loading, error };
}
