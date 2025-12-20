import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePayments({ enabled = true } = {}) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    let channel;

    async function loadPayments() {
      setLoading(true);

      const { data, error } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          status,
          due_date,
          paid_at,
          property_id,
          tenant_id,
          properties (
            address
          ),
          tenants (
            name
          )
        `)
        .order("due_date", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setPayments(mapPayments(data));
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

function mapPayments(rows) {
  return rows.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    status: p.status,
    dueDate: p.due_date,
    paidAt: p.paid_at,
    propertyId: p.property_id,
    tenantId: p.tenant_id,
    propertyAddress: p.properties?.address ?? "-",
    tenantName: p.tenants?.name ?? "-",
  }));
}
