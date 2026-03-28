import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useRealtimeTables } from "./useRealtimeTables";
import {
  createTenant as createTenantRecord,
  listAccountTenants,
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

    try {
      const data = await listAccountTenants(activeAccountId);
      setTenants(activeTenantId ? data.filter((tenant) => tenant.id === activeTenantId) : data);
    } catch (error) {
      setError(error);
      setTenants([]);
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
