import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useTenants({ enabled = true } = {}) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    let channel;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, email, phone, property_id, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
      } else {
        setError(null);
        setTenants(
          data.map((t) => ({
            id: t.id,
            name: t.name,
            email: t.email,
            phone: t.phone,
            propertyId: t.property_id,
          }))
        );
      }

      setLoading(false);
    }

    load();

    channel = supabase
      .channel("tenants-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants" },
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { tenants, loading, error };
}
