import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useRealtimeTables } from "./useRealtimeTables";
import {
  createTenant as createTenantRecord,
  updateTenant as updateTenantRecord,
  deleteTenant as deleteTenantRecord,
} from "../services/tenantService";

export function useTenants({ enabled = true } = {}) {
  const { activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  /* ======================
     LOAD TENANTS
     ====================== */

  async function loadTenants() {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

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

  useEffect(() => {
    if (!enabled || !activeAccountId) {
      setLoading(false);
      return;
    }

    loadTenants();
  }, [enabled, activeAccountId, activeTenantId]);

  useRealtimeTables({
    enabled: enabled && !!activeAccountId,
    subscriptions: [
      {
        channel: `tenants:${activeAccountId}`,
        table: "tenants",
        filter: `account_id=eq.${activeAccountId}`,
      },
    ],
    onChange: loadTenants,
  });

  async function createTenant(payload) {
    if (!activeAccountId) throw new Error("Brak aktywnego konta");
    return createTenantRecord({
      accountId: activeAccountId,
      ...payload,
    });
  }

  async function updateTenant(id, payload) {
    return updateTenantRecord(id, payload);
  }

  async function deleteTenant(id) {
    return deleteTenantRecord(id);
  }

  return {
    tenants,
    loading,
    error,

    // Canonical tenant mutations now flow through the shared service.
    createTenant,
    updateTenant,
    deleteTenant,
  };
}
