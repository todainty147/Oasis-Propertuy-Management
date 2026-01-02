import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useTenants({
  enabled = true,
  accountId = null, // ✅ REQUIRED
} = {}) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setTenants([]);
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
        .eq("account_id", accountId) // ✅ MULTI-TENANT FILTER
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setTenants(mapTenants(data));
      }

      setLoading(false);
    }

    loadTenants();

    /* ======================
       REALTIME (ACCOUNT-SCOPED)
       ====================== */
    channel = supabase
      .channel(`tenants:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenants",
          filter: `account_id=eq.${accountId}`, // ✅ CRITICAL
        },
        loadTenants
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, accountId]); // ✅ STABLE DEP ARRAY

  return { tenants, loading, error };
}

/* ======================
   MAPPER
   ====================== */

function mapTenants(rows = []) {
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone,
    propertyId: t.property_id,
    createdAt: t.created_at,
  }));
}
