import { createContext, useContext, useState } from "react";

const TenantContext = createContext(null);

/* ======================
   PROVIDER
   ====================== */

export function TenantProvider({ children }) {
  // null = all tenants
  const [activeTenantId, setActiveTenantId] = useState(null);

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
