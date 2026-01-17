// src/context/AccountContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const AccountContext = createContext(null);

/* ======================
   PROVIDER
   ====================== */

export function AccountProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // ✅ NEW: allow tenant portal path (no account_members required)
  const [tenantContext, setTenantContext] = useState(null); // { account_id, tenant_id, status }
  const [authzError, setAuthzError] = useState(null);

  /* ======================
     LOAD ACCOUNTS / TENANT CONTEXT
     ====================== */

  useEffect(() => {
    if (authLoading) return;

    // 🔒 Logged out
    if (!user) {
      setAccounts([]);
      setActiveAccountId(null);
      setTenantContext(null);
      setAuthzError(null);
      setAccountLoading(false);
      localStorage.removeItem("activeAccountId");
      return;
    }

    let cancelled = false;

    async function loadAccounts() {
      setAccountLoading(true);
      setAuthzError(null);
      setTenantContext(null);

      /* ======================
         1) NORMAL PATH: account_members
         ====================== */
      const { data: memberships, error } = await supabase
        .from("account_members")
        .select(
          `
          role,
          accounts (
            id,
            name
          )
        `
        )
        .eq("user_id", user.id);

      if (error) {
        console.error("Account membership load failed:", error);
        if (!cancelled) {
          setAccountLoading(false);
          setAuthzError("Nie udało się załadować kont.");
        }
        return;
      }

      if (cancelled) return;

      // ✅ HAS ACCOUNTS (owner/admin/staff)
      if (memberships?.length > 0) {
        const accs = memberships
          .filter((m) => m.accounts?.id)
          .map((m) => ({
            id: m.accounts.id,
            name: m.accounts.name,
            role: m.role, // 🔐 SINGLE SOURCE OF TRUTH
          }));

        setAccounts(accs);

        const stored = localStorage.getItem("activeAccountId");
        const validStored = stored && accs.some((a) => a.id === stored);

        setActiveAccountId(validStored ? stored : accs[0]?.id ?? null);
        setAccountLoading(false);
        return;
      }

      /* ======================
         2) TENANT PATH: tenants.user_id mapping
         ====================== */
      const { data: tenantRow, error: tenantErr } = await supabase
        .from("tenants")
        .select("id, account_id, status, archived_at")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tenantErr) {
        console.error("Tenant context lookup failed:", tenantErr);
        if (!cancelled) {
          setAccountLoading(false);
          // Keep the existing UX message (matches your Polish string usage elsewhere)
          setAuthzError("Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
        }
        return;
      }

      if (cancelled) return;

      // ✅ Tenant found -> allow tenant portal
      if (tenantRow?.account_id) {
        setTenantContext({
          tenant_id: tenantRow.id,
          account_id: tenantRow.account_id,
          status: tenantRow.status,
        });

        // For tenant users, we don’t rely on accounts list/switcher yet.
        setAccounts([]);

        // Prefer stored activeAccountId ONLY if it matches tenant account
        const stored = localStorage.getItem("activeAccountId");
        const useStored = stored && stored === tenantRow.account_id;

        setActiveAccountId(useStored ? stored : tenantRow.account_id);
        localStorage.setItem("activeAccountId", tenantRow.account_id);

        setAccountLoading(false);
        return;
      }

      /* ======================
         3) FIRST ACCOUNT CREATION (landlord-only edge case)
         ====================== */
      // IMPORTANT: This can be undesirable for tenant users.
      // We only reach here if user is NOT a tenant and has NO memberships.
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          name: user.email ?? "Moje konto",
        })
        .select()
        .single();

      if (accountError) {
        console.error("Account creation failed:", accountError);
        if (!cancelled) {
          setAccountLoading(false);
          setAuthzError("Nie udało się utworzyć konta.");
        }
        return;
      }

      await supabase.from("account_members").insert({
        account_id: account.id,
        user_id: user.id,
        role: "owner",
      });

      if (cancelled) return;

      setAccounts([{ id: account.id, name: account.name, role: "owner" }]);
      setActiveAccountId(account.id);
      localStorage.setItem("activeAccountId", account.id);
      setAccountLoading(false);
    }

    loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  /* ======================
     PERSIST ACTIVE ACCOUNT
     ====================== */

  useEffect(() => {
    if (activeAccountId) {
      localStorage.setItem("activeAccountId", activeAccountId);
    }
  }, [activeAccountId]);

  /* ======================
     DERIVED
     ====================== */

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );

  // ✅ Role resolution:
  // - If member: use membership role
  // - If tenantContext matches activeAccountId: role = 'tenant'
  // - Else null
  const activeRole = useMemo(() => {
    if (activeAccount?.role) return activeAccount.role;
    if (tenantContext?.account_id && tenantContext.account_id === activeAccountId) {
      return "tenant";
    }
    return null;
  }, [activeAccount, tenantContext, activeAccountId]);

  /* ======================
     ACTIONS
     ====================== */

  function switchAccount(accountId) {
    // For tenant users, switching is not supported unless you later add a tenant-visible accounts list.
    // For now, keep the function for existing UI use.
    setActiveAccountId(accountId);
  }

  /* ======================
     CONTEXT
     ====================== */

  return (
    <AccountContext.Provider
      value={{
        accounts,
        activeAccountId,
        switchAccount,
        accountLoading,

        // 🔐 THIS IS WHAT PERMISSIONS USE
        activeRole,

        // ✅ NEW: tenant portal metadata (for later UI use)
        tenantContext,

        // ✅ NEW: if you want to show the existing message in a consistent place
        authzError,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

/* ======================
   HOOK
   ====================== */

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used inside <AccountProvider>");
  }
  return ctx;
}
