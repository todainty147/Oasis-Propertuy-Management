// src/hooks/useProperties.js
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

/* ======================
   PROPERTIES HOOK
   ====================== */

function mapPropertyRow(p) {
  return {
    id: p.id,
    address: p.address,
    city: p.city,
    size: p.size ?? "",
    rent: Number(p.rent ?? 0),
    tenantId: p.tenant_id ?? null,
    createdAt: p.created_at,
  };
}

export function useProperties({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId, clearTenant } = useTenant();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const loadAccountProperties = useCallback(async () => {
    const { data, error } = await supabase
      .from("properties")
      .select(`
        id,
        address,
        city,
        size,
        rent,
        tenant_id,
        created_at
      `)
      .eq("account_id", activeAccountId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setProperties((data ?? []).map(mapPropertyRow));
  }, [activeAccountId]);

  const loadProperties = useCallback(async () => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 🔹 TENANT SELECTED → resolve tenant.property_id first
      if (activeTenantId) {
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("property_id")
          .eq("id", activeTenantId)
          .eq("account_id", activeAccountId)
          .maybeSingle();

        if (tenantError || !tenant?.property_id) {
          clearTenant();
          await loadAccountProperties();
          return;
        }

        const { data, error } = await supabase
          .from("properties")
          .select(`
            id,
            address,
            city,
            size,
            rent,
            tenant_id,
            created_at
          `)
          .eq("id", tenant.property_id)
          .eq("account_id", activeAccountId);

        if (error) throw error;

        setProperties((data ?? []).map(mapPropertyRow));
      }

      // 🔹 NO TENANT → all properties for account
      else {
        await loadAccountProperties();
      }
    } catch (err) {
      setError(err);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeTenantId, clearTenant, enabled, loadAccountProperties]);

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    let channel;

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
  }, [enabled, activeAccountId, loadProperties]);

  return { properties, loading, error, refetch: loadProperties };
}
