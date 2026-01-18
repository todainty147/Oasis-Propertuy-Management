// src/hooks/useMaintenanceRequests.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";

export function useMaintenanceRequests({
  enabled = true,
  propertyId = null,
  limit = 50,
} = {}) {
  const { activeAccountId } = useAccount();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const filters = useMemo(() => {
    return {
      accountId: activeAccountId,
      propertyId,
      limit,
    };
  }, [activeAccountId, propertyId, limit]);

  useEffect(() => {
    if (!enabled || !filters.accountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function load() {
      setLoading(true);
      setError(null);

      let q = supabase
        .from("maintenance_requests")
        .select(
          `
          id,
          account_id,
          property_id,
          reported_by_tenant_id,
          title,
          description,
          priority,
          status,
          created_at,
          updated_at
        `
        )
        .eq("account_id", filters.accountId)
        .order("created_at", { ascending: false })
        .limit(filters.limit);

      if (filters.propertyId) {
        q = q.eq("property_id", filters.propertyId);
      }

      const { data, error } = await q;

      if (error) {
        setError(error);
        setItems([]);
      } else {
        setItems(data ?? []);
      }

      setLoading(false);
    }

    load();

    // Realtime: keep list in sync
    channel = supabase
      .channel("maintenance-requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "maintenance_requests",
          filter: `account_id=eq.${filters.accountId}`,
        },
        () => load()
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, filters]);

  return { requests: items, loading, error };
}
