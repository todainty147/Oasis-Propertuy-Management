import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useProperties({ enabled = true } = {}) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      // ⛔ do nothing when disabled
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
       REALTIME
       ====================== */
    channel = supabase
      .channel("properties-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "properties" },
        () => {
          loadProperties();
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { properties, loading, error };
}

/* ======================
   MAPPER
   ====================== */

function mapProperties(rows) {
  return rows.map((p) => ({
    id: p.id,
    address: p.address,
    city: p.city,
    status: p.status,        // still okay (Option A overrides later)
    tenantId: p.tenant_id,
    rent: Number(p.rent ?? 0), // ✅ safe numeric rent
    createdAt: p.created_at,
  }));
}
