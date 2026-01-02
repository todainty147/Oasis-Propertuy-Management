import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePayments({
  enabled = true,
  accountId = null, // ✅ REQUIRED
} = {}) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setPayments([]);
      setLoading(false);
      return;
    }

    let channel;

    async function loadPayments() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("payments")
        .select(`
          id,
          property_id,
          tenant_id,
          amount,
          status,
          due_date,
          paid_at,
          created_at
        `)
        .eq("account_id", accountId) // ✅ MULTI-TENANT FILTER
        .order("due_date", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setPayments(mapPayments(data));
      }

      setLoading(false);
    }

    loadPayments();

    /* ======================
       REALTIME (ACCOUNT-SCOPED)
       ====================== */
    channel = supabase
      .channel(`payments:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `account_id=eq.${accountId}`, // ✅ CRITICAL
        },
        loadPayments
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, accountId]); // ✅ STABLE DEP ARRAY

  return { payments, loading, error };
}

/* ======================
   MAPPER
   ====================== */

function mapPayments(rows = []) {
  return rows.map((p) => ({
    id: p.id,
    propertyId: p.property_id,
    tenantId: p.tenant_id,
    amount: Number(p.amount ?? 0),
    status: p.status,
    dueDate: p.due_date,
    paidAt: p.paid_at,
    createdAt: p.created_at,
  }));
}
