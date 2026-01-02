// src/hooks/usePayments.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePayments({ enabled = true } = {}) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
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
          amount,
          status,
          due_date,
          paid_at,
          tenant_id,
          property_id,
          tenants (
            id,
            name
          ),
          properties (
            id,
            address
          )
        `)
        .order("due_date", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setPayments(
          data.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            status: p.status,
            dueDate: p.due_date,
            paidAt: p.paid_at,
            tenantId: p.tenant_id,
            propertyId: p.property_id,

            // ✅ DISPLAY FIELDS (THIS FIXES YOUR ISSUE)
            tenantName: p.tenants?.name ?? "—",
            propertyAddress: p.properties?.address ?? "—",
          }))
        );
      }

      setLoading(false);
    }

    loadPayments();

    channel = supabase
      .channel("payments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        loadPayments
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { payments, loading, error };
}
