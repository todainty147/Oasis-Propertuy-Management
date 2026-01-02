import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useProperties({
  enabled = true,
  accountId = null, // ✅ REQUIRED
} = {}) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setProperties([]);
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
        .eq("account_id", accountId) // ✅ MULTI-TENANT FILTER
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setProperties(mapProperties(data));
      }

      setLoading(false);
    }

    loadProperties();

    /* ======================
       REALTIME (ACCOUNT-SCOPED)
       ====================== */
    channel = supabase
      .channel(`properties:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter: `account_id=eq.${accountId}`, // ✅ IMPORTANT
        },
        loadProperties
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, accountId]); // ✅ STABLE DEP ARRAY

  return { properties, loading, error };
}

/* ======================
   MAPPER
   ====================== */

function mapProperties(rows = []) {
  return rows.map((p) => ({
    id: p.id,
    address: p.address,
    city: p.city,
    status: p.status,          // derived later if needed
    tenantId: p.tenant_id,
    rent: Number(p.rent ?? 0),
    createdAt: p.created_at,
  }));
}
