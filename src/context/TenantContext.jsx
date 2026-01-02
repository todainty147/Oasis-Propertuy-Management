import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

const TenantContext = createContext(null);

/* ======================
   PROVIDER
   ====================== */

export function TenantProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // tenant from URL (?tenant=...)
  const tenantFromUrl = searchParams.get("tenant");

  // null = all tenants
  const [activeTenantId, setActiveTenantIdState] = useState(
    tenantFromUrl ?? null
  );

  /* ---------- URL → STATE ---------- */
  useEffect(() => {
    setActiveTenantIdState(tenantFromUrl ?? null);
  }, [tenantFromUrl]);

  /* ---------- STATE → URL ---------- */
  function setActiveTenantId(id) {
    const params = new URLSearchParams(searchParams);

    if (id) {
      params.set("tenant", id);
    } else {
      params.delete("tenant");
    }

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
    throw new Error(
      "useTenant must be used inside <TenantProvider>"
    );
  }
  return ctx;
}
