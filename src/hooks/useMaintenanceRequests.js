// src/hooks/useMaintenanceRequests.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";

export function useMaintenanceRequests({
  enabled = true,
  propertyId = null,
  limit = 50,
  accountId = null, // ✅ optional override (future-proof)
} = {}) {
  const { activeAccountId } = useAccount();

  const effectiveAccountId = accountId ?? activeAccountId;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !effectiveAccountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function load() {
      if (!effectiveAccountId) return;
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
        .eq("account_id", effectiveAccountId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (propertyId) {
        q = q.eq("property_id", propertyId);
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

    // ✅ Realtime: narrow scope when propertyId is provided
    const channelName = `maintenance-requests:${effectiveAccountId}:${propertyId ?? "all"}`;

    const filter = propertyId
      ? `account_id=eq.${effectiveAccountId}&property_id=eq.${propertyId}`
      : `account_id=eq.${effectiveAccountId}`;

    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "maintenance_requests",
          filter,
        },
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, effectiveAccountId, propertyId, limit]);

  return { requests: items, loading, error };
}
