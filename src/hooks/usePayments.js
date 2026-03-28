// src/hooks/usePayments.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { listAccountPayments } from "../services/paymentService";

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

      try {
        const data = await listAccountPayments(activeAccountId);
        setPayments(
          activeTenantId ? data.filter((payment) => payment.tenantId === activeTenantId) : data,
        );
        setLoading(false);
      } catch (error) {
        setError(error);
        setPayments([]);
        setLoading(false);
      }
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
