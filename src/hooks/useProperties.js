// src/hooks/useProperties.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

/* ======================
   PROPERTIES HOOK
   ====================== */

export function useProperties({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    let channel;

    async function loadProperties() {
      setLoading(true);
      setError(null);

      try {
        // 🔹 TENANT SELECTED → resolve tenant.property_id first
        if (activeTenantId) {
          const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("property_id")
            .eq("id", activeTenantId)
            .single();

          if (tenantError || !tenant?.property_id) {
            setProperties([]);
            setLoading(false);
            return;
          }

          const { data, error } = await supabase
            .from("properties")
            .select(`
              id,
              address,
              city,
              rent,
              created_at
            `)
            .eq("id", tenant.property_id);

          if (error) throw error;

          setProperties(
            (data ?? []).map((p) => ({
              id: p.id,
              address: p.address,
              city: p.city,
              rent: Number(p.rent ?? 0),
              createdAt: p.created_at,
            }))
          );
        }

        // 🔹 NO TENANT → all properties for account
        else {
          const { data, error } = await supabase
            .from("properties")
            .select(`
              id,
              address,
              city,
              rent,
              created_at
            `)
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false });

          if (error) throw error;

          setProperties(
            (data ?? []).map((p) => ({
              id: p.id,
              address: p.address,
              city: p.city,
              rent: Number(p.rent ?? 0),
              createdAt: p.created_at,
            }))
          );
        }
      } catch (err) {
        setError(err);
        setProperties([]);
      } finally {
        setLoading(false);
      }
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
          filter: `account_id=eq.${activeAccountId}`,
        },
        loadProperties
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, activeTenantId]);

  return { properties, loading, error };
}
