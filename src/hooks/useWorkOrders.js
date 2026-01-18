// src/hooks/useWorkOrders.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { fetchWorkOrders } from "../services/workOrderService";

export function useWorkOrders({
  enabled = true,
  propertyId = null,
  maintenanceRequestId = null,
} = {}) {
  const { activeAccountId } = useAccount();

  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !activeAccountId || !propertyId) {
      setLoading(false);
      return;
    }

    let channel;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchWorkOrders({
          accountId: activeAccountId,
          propertyId,
          maintenanceRequestId,
        });
        setWorkOrders(data);
      } catch (e) {
        setError(e);
        setWorkOrders([]);
      } finally {
        setLoading(false);
      }
    }

    load();

    channel = supabase
      .channel(`work-orders-${activeAccountId}-${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `account_id=eq.${activeAccountId}`,
        },
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, propertyId, maintenanceRequestId]);

  return { workOrders, loading, error, reload: () => {} };
}
