import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useProperties({ enabled = true } = {}) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let channel;

    async function loadProperties() {
      setLoading(true);

      const { data, error } = await supabase
        .from("properties")
        .select(`
          id,
          address,
          city,
          status,
          tenant_id,
          created_at
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
    status: p.status,
    tenantId: p.tenant_id,
  }));
}
