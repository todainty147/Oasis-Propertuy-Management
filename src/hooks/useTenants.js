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

  /* ======================
     LOAD TENANTS
     ====================== */

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

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

        setTenants(
          activeTenantId
            ? mapped.filter((t) => t.id === activeTenantId)
            : mapped
        );
      }

      setLoading(false);
    }

    loadTenants();
  }, [enabled, activeAccountId, activeTenantId]);

  /* ======================
     CREATE TENANT ✅
     ====================== */

  async function createTenant({
    name,
    email,
    phone,
    propertyId,
  }) {
    if (!activeAccountId) {
      throw new Error("Brak aktywnego konta");
    }

    const { error } = await supabase.from("tenants").insert({
      account_id: activeAccountId,
      name,
      email,
      phone,
      property_id: propertyId,
    });

    if (error) {
      throw error;
    }

    // refresh list
    setTenants((prev) => prev); // optimistic noop
  }

  return {
    tenants,
    loading,
    error,

    // ✅ MUTATIONS
    createTenant,
  };
}
