import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* ======================
   TENANTS HOOK
   ====================== */

export function useTenants({
  enabled = true,
  accountId = null, // ✅ REQUIRED (passed from App)
} = {}) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function loadTenants() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("tenants")
        .select(`
          id,
          name,
          email,
          phone,
          property_id,
          created_at
        `)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setTenants(
          (data ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            email: t.email,
            phone: t.phone,
            propertyId: t.property_id,
            createdAt: t.created_at,
          }))
        );
      }

      setLoading(false);
    }

    loadTenants();

    /* ======================
       REALTIME (SCOPED)
       ====================== */
    channel = supabase
      .channel(`tenants-realtime-${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenants",
          filter: `account_id=eq.${accountId}`,
        },
        loadTenants
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, accountId]);

  return { tenants, loading, error };
}
