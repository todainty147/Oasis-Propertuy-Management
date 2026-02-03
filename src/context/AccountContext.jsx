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

  // ✅ Tenant portal path (no account_members required)
  const [tenantContext, setTenantContext] = useState(null); // { account_id, tenant_id, status }

  // ✅ Contractor portal path (no account_members required)
  const [contractorContext, setContractorContext] = useState(null); // { account_id }

  const [authzError, setAuthzError] = useState(null);

  /* ======================
     LOAD ACCOUNTS / TENANT / CONTRACTOR CONTEXT
     ====================== */

  useEffect(() => {
    if (authLoading) return;

    // 🔒 Logged out
    if (!user) {
      setAccounts([]);
      setActiveAccountId(null);
      setTenantContext(null);
      setContractorContext(null);
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
      setContractorContext(null);

      /* ======================
         1) NORMAL PATH: account_members
         ====================== */
      const { data: memberships, error: membershipErr } = await supabase
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

      if (membershipErr) {
        console.error("Account membership load failed:", membershipErr);
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

        const nextId = validStored ? stored : accs[0]?.id ?? null;
        setActiveAccountId(nextId);

        if (nextId) localStorage.setItem("activeAccountId", nextId);

        setAccountLoading(false);
        return;
      }

      /* ======================
         2) TENANT PATH: tenants.user_id mapping
         IMPORTANT: tenantErr MUST NOT block contractor path
         ====================== */
      let tenantRow = null;

      const { data: tRow, error: tenantErr } = await supabase
        .from("tenants")
        .select("id, account_id, status, archived_at")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tenantErr) {
        // Non-fatal: contractors can hit tenant RLS errors
        console.warn("Tenant context lookup failed (non-fatal):", tenantErr);
      } else {
        tenantRow = tRow;
      }

      if (cancelled) return;

      // ✅ Tenant found -> allow tenant portal
      if (tenantRow?.account_id) {
        setTenantContext({
          tenant_id: tenantRow.id,
          account_id: tenantRow.account_id,
          status: tenantRow.status,
        });

        // Tenant users: no membership list / no switching (for now)
        setAccounts([]);

        const stored = localStorage.getItem("activeAccountId");
        const useStored = stored && stored === tenantRow.account_id;

        const nextId = useStored ? stored : tenantRow.account_id;
        setActiveAccountId(nextId);
        localStorage.setItem("activeAccountId", nextId);

        setAccountLoading(false);
        return;
      }

      /* ======================
         2B) CONTRACTOR PATH: work_orders.contractor_user_id mapping
         IMPORTANT: contractorErr MUST NOT block landlord account creation
         ====================== */
      let contractorRow = null;

      const { data: cRow, error: contractorErr } = await supabase
        .from("work_orders")
        .select("id, account_id")
        .eq("contractor_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contractorErr) {
        // Non-fatal: if RLS blocks this, we still allow owner creation path
        console.warn("Contractor context lookup failed (non-fatal):", contractorErr);
      } else {
        contractorRow = cRow;
      }

      if (cancelled) return;

      // ✅ Contractor found -> allow contractor portal
      if (contractorRow?.account_id) {
        setContractorContext({
          account_id: contractorRow.account_id,
        });

        setAccounts([]);

        const stored = localStorage.getItem("activeAccountId");
        const useStored = stored && stored === contractorRow.account_id;

        const nextId = useStored ? stored : contractorRow.account_id;
        setActiveAccountId(nextId);
        localStorage.setItem("activeAccountId", nextId);

        setAccountLoading(false);
        return;
      }

      /* ======================
         3) FIRST ACCOUNT CREATION (landlord-only edge case)
         ====================== */
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

    loadAccounts().catch((e) => {
      console.error("AccountContext loadAccounts unhandled error:", e);
      if (!cancelled) {
        setAccountLoading(false);
        setAuthzError("Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
      }
    });

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

  const activeRole = useMemo(() => {
    if (activeAccount?.role) return activeAccount.role;

    if (tenantContext?.account_id && tenantContext.account_id === activeAccountId) {
      return "tenant";
    }

    if (contractorContext?.account_id && contractorContext.account_id === activeAccountId) {
      return "contractor";
    }

    return null;
  }, [activeAccount, tenantContext, contractorContext, activeAccountId]);

  /* ======================
     ACTIONS
     ====================== */

  function switchAccount(accountId) {
    // Tenant/contractor mode: no membership accounts to switch
    if (!accounts?.length) return;
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

        activeRole,

        tenantContext,
        contractorContext,

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
