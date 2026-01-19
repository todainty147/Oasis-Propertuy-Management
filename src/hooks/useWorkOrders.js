// src/hooks/useWorkOrders.js
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { fetchWorkOrders } from "../services/workOrderService";

export function useWorkOrders({
  enabled = true,
  propertyId = null,
  maintenanceRequestId = null,
  limit = 50,
} = {}) {
  const { activeAccountId } = useAccount();

  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled || !activeAccountId || !propertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchWorkOrders({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId,
        limit,
      });
      setWorkOrders(data);
    } catch (e) {
      setError(e);
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, activeAccountId, propertyId, maintenanceRequestId, limit]);

  useEffect(() => {
    if (!enabled || !activeAccountId || !propertyId) {
      setLoading(false);
      return;
    }

    let channel;

    load();

    // ✅ Filter realtime by account + property to avoid reload spam
    channel = supabase
      .channel(`work-orders-${activeAccountId}-${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `account_id=eq.${activeAccountId},property_id=eq.${propertyId}`,
        },
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, propertyId, load]);

  return { workOrders, loading, error, reload: load };
}

