// src/hooks/useTenants.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

export function useTenants({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
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
        .eq("account_id", activeAccountId)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error);
        setTenants([]);
      } else {
        const mapped = data.map((t) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phone,
          propertyId: t.property_id,
          createdAt: t.created_at,
        }));

        // ✅ TENANT SWITCH FILTER (THE MISSING PIECE)
        setTenants(
          activeTenantId
            ? mapped.filter((t) => t.id === activeTenantId)
            : mapped
        );
      }

      setLoading(false);
    }

    loadTenants();

    channel = supabase
      .channel("tenants-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenants",
          filter: `account_id=eq.${activeAccountId}`,
        },
        loadTenants
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, activeTenantId]);

  return { tenants, loading, error };
}
