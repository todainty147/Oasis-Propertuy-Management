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
      setPayments([]);
      setLoading(false);
      return;
    }

    let channel;

    async function loadPayments() {
      setLoading(true);
      setError(null);

      let query = supabase
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
          properties ( id, address )
        `)
        .eq("account_id", activeAccountId)
        .order("due_date", { ascending: false });

      // ✅ TENANT FILTER
      if (activeTenantId) {
        query = query.eq("tenant_id", activeTenantId);
      }

      const { data, error } = await query;

      if (error) {
        setError(error);
      } else {
        setPayments(
          (data ?? []).map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            status: p.status,
            dueDate: p.due_date,
            paidAt: p.paid_at,
            tenantId: p.tenant_id,
            propertyId: p.property_id,
            tenantName: p.tenants?.name ?? "—",
            propertyAddress: p.properties?.address ?? "—",
          }))
        );
      }

      setLoading(false);
    }

    loadPayments();

    channel = supabase
      .channel(`payments-${activeAccountId}`)
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
  }, [enabled, activeAccountId, activeTenantId]); // ✅ DEPENDENCY

  return { payments, loading, error };
}
