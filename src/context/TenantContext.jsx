// src/context/TenantContext.jsx
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "./AccountContext";

const TenantContext = createContext(null);

/* ======================
   PROVIDER
   ====================== */

export function TenantProvider({ children }) {
  const { activeAccountId, tenantContext, activeRole } = useAccount();

  const [searchParams, setSearchParams] = useSearchParams();

  // tenant from URL (?tenant=...)
  const tenantFromUrl = searchParams.get("tenant");

  // null = all tenants
  const [activeTenantId, setActiveTenantIdState] = useState(
    tenantFromUrl ?? null
  );

  // track account changes
  const prevAccountIdRef = useRef(activeAccountId);

  /* --------------------------------
     ACCOUNT CHANGE => RESET TENANT
     -------------------------------- */
  useEffect(() => {
    const prev = prevAccountIdRef.current;

    // first render OR no active account yet
    if (!activeAccountId) {
      prevAccountIdRef.current = activeAccountId;
      return;
    }

    // account switched
    if (prev && prev !== activeAccountId) {
      // clear state
      setActiveTenantIdState(null);

      // clear URL param
      const params = new URLSearchParams(searchParams);
      params.delete("tenant");
      setSearchParams(params, { replace: true });
    }

    prevAccountIdRef.current = activeAccountId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  /* ---------- URL → STATE ---------- */
  useEffect(() => {
    setActiveTenantIdState(tenantFromUrl ?? null);
  }, [tenantFromUrl]);

  useEffect(() => {
    const isTenant = String(activeRole ?? "").toLowerCase() === "tenant";
    if (!isTenant) return;
    if (tenantFromUrl) return;
    if (!tenantContext?.tenant_id) return;
    if (tenantContext.account_id !== activeAccountId) return;
    setActiveTenantIdState(tenantContext.tenant_id);
  }, [activeAccountId, activeRole, tenantContext, tenantFromUrl]);

  /* ---------- STATE → URL ---------- */
  function setActiveTenantId(id) {
    const params = new URLSearchParams(searchParams);

    if (id) params.set("tenant", id);
    else params.delete("tenant");

    setSearchParams(params, { replace: true });
  }

  function clearTenant() {
    setActiveTenantId(null);
  }

  return (
    <TenantContext.Provider
      value={{
        activeTenantId,
        setActiveTenantId,
        clearTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

/* ======================
   HOOK
   ====================== */

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used inside <TenantProvider>");
  }
  return ctx;
}
