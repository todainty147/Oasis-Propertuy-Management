// src/hooks/usePayments.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { listAccountPayments } from "../services/paymentService";

export function usePayments({ enabled = true, accountId: accountIdProp = null } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const effectiveAccountId = accountIdProp ?? activeAccountId;

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !effectiveAccountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function loadPayments() {
      setLoading(true);
      setError(null);

      try {
        const data = await listAccountPayments(effectiveAccountId);
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
          filter: `account_id=eq.${effectiveAccountId}`,
        },
        loadPayments
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, effectiveAccountId, activeTenantId]);

  return { payments, loading, error };
}
