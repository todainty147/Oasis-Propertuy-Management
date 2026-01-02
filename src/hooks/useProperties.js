import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* ======================
   PROPERTIES HOOK
   ====================== */

export function useProperties({
  enabled = true,
  accountId = null, // ✅ PASSED IN
} = {}) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function loadProperties() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("properties")
        .select(`
          id,
          address,
          city,
          status,
          tenant_id,
          created_at,
          rent
        `)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setProperties(
          (data ?? []).map((p) => ({
            id: p.id,
            address: p.address,
            city: p.city,
            status: p.status,
            tenantId: p.tenant_id,
            rent: Number(p.rent ?? 0),
            createdAt: p.created_at,
          }))
        );
      }

      setLoading(false);
    }

    loadProperties();

    channel = supabase
      .channel("properties-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter: `account_id=eq.${accountId}`,
        },
        loadProperties
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, accountId]);

  return { properties, loading, error };
}
