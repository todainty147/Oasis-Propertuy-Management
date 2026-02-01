// src/hooks/useActivityLog.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { fetchActivityLog } from "../services/activityLogService";

export function useActivityLog({
  enabled = true,
  entityType = null,
  entityId = null,
  propertyId = null,
  limit = 20,
} = {}) {
  const { activeAccountId } = useAccount();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const params = useMemo(
    () => ({
      accountId: activeAccountId,
      entityType,
      entityId,
      propertyId,
      limit,
    }),
    [activeAccountId, entityType, entityId, propertyId, limit]
  );

  useEffect(() => {
    if (!enabled || !params.accountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchActivityLog(params);
        setItems(data ?? []);
      } catch (e) {
        setError(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();

    // Realtime: keep in sync for this account
    channel = supabase
      .channel(`activity-log-${params.accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_log",
          filter: `account_id=eq.${params.accountId}`,
        },
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, params]);

  return { items, loading, error };
}
