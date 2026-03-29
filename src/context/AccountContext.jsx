// src/context/AccountContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { rootListAccounts } from "../services/rootAccountService";
import { finalizeSelfServeLandlordAccount } from "../services/selfServeSignupService";
import { canAccessRootTelemetry, getRootTelemetryAccessMode } from "../utils/telemetryAccess";
import { assertFeature, hasFeature, normalizePlan } from "../lib/entitlements";

const AccountContext = createContext(null);

/* ======================
   PROVIDER
   ====================== */

export function AccountProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [isRootOperator, setIsRootOperator] = useState(false);

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
      setIsRootOperator(false);
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
      setIsRootOperator(false);

      /* ======================
         1) NORMAL PATH: account_members
         ====================== */
      async function queryMemberships(fields) {
        return supabase
          .from("account_members")
          .select(
            `
            role,
            accounts (
              ${fields}
            )
          `
          )
          .eq("user_id", user.id);
      }

      let memberships = null;
      let membershipErr = null;
      const fieldsPriority = [
        "id,name,is_root,is_disabled,subscription_plan,subscription_status,billing_locked_at",
        "id,name,is_root,is_disabled,subscription_plan,subscription_status",
        "id,name,is_root,is_disabled",
        "id,name,is_root",
        "id,name",
      ];
      for (const fields of fieldsPriority) {
        const res = await queryMemberships(fields);
        memberships = res.data;
        membershipErr = res.error;
        if (!membershipErr) break;
        if (membershipErr.code !== "42703") break;
      }

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
        const membershipAccounts = memberships
          .filter((m) => m.accounts?.id)
          .map((m) => ({
            id: m.accounts.id,
            name: m.accounts.name,
            is_root: Boolean(m.accounts.is_root),
            is_disabled: Boolean(m.accounts.is_disabled),
            subscription_plan: m.accounts.subscription_plan || null,
            subscription_status: m.accounts.subscription_status || null,
            billing_locked_at: m.accounts.billing_locked_at || null,
            role: m.role, // 🔐 SINGLE SOURCE OF TRUTH
          }));
        const rootMembership = membershipAccounts.find((a) => a.is_root);
        const rootOperator = Boolean(rootMembership);
        setIsRootOperator(rootOperator);
        const membershipById = new Map(membershipAccounts.map((a) => [a.id, a]));

        let accs = membershipAccounts;
        if (rootOperator && rootMembership?.id) {
          try {
            const rootRows = await rootListAccounts(rootMembership.id);
            accs = (rootRows ?? []).map((r) => {
              const existing = membershipById.get(r.id);
              return {
                id: r.id,
                name: r.name,
                is_root: Boolean(r.is_root),
                is_disabled: Boolean(r.is_disabled),
                subscription_plan: existing?.subscription_plan || null,
                subscription_status: existing?.subscription_status || null,
                billing_locked_at: existing?.billing_locked_at || null,
                // Root operator can switch into any account; treat as owner-level in UI permissions.
                role: "owner",
              };
            });
          } catch (e) {
            console.warn("root_list_accounts failed, using membership-only accounts:", e);
          }
        }

        if (!rootOperator) {
          accs = accs.filter((a) => !a.is_disabled);
        }

        setAccounts(accs);

        const stored = localStorage.getItem("activeAccountId");
        const validStored = stored && accs.some((a) => a.id === stored);
        const nextId = rootOperator
          ? (validStored ? stored : accs[0]?.id ?? null)
          : (accs[0]?.id ?? null);
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
         3) NO CONTEXT FOUND
         In SaaS mode accounts are invite-driven and should not be auto-created
         by client inserts (RLS-safe default).
         ====================== */
      const autoBootstrapEnabled = String(import.meta.env.VITE_ENABLE_AUTO_ACCOUNT_BOOTSTRAP || "").toLowerCase() === "true";
      const signupIntent = String(user?.user_metadata?.signup_intent || "").toLowerCase();
      if (signupIntent === "landlord_owner") {
        try {
          const row = await finalizeSelfServeLandlordAccount(
            user?.user_metadata?.signup_account_name || user?.email || ""
          );

          const newId = row?.account_id || null;
          const newName = row?.account_name || user?.user_metadata?.signup_account_name || user?.email || "My Account";
          if (newId) {
            setAccounts([{
              id: newId,
              name: newName,
              is_root: false,
              is_disabled: false,
              subscription_plan: "starter",
              subscription_status: "trialing",
              billing_locked_at: null,
              role: "owner",
            }]);
            setActiveAccountId(newId);
            localStorage.setItem("activeAccountId", newId);
            setAccountLoading(false);
            return;
          }
        } catch (e) {
          console.error("Self-serve landlord bootstrap failed:", e);
          if (!cancelled) {
            setAccountLoading(false);
            setAuthzError(e?.message || "Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
          }
          return;
        }
      }

      if (!autoBootstrapEnabled) {
        setAccountLoading(false);
        setAuthzError("Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
        return;
      }

      // Optional legacy/dev fallback only when explicitly enabled.
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
          setAuthzError("Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
        }
        return;
      }

      const { error: memberError } = await supabase.from("account_members").insert({
        account_id: account.id,
        user_id: user.id,
        role: "owner",
      });

      if (memberError) {
        console.error("Account member bootstrap failed:", memberError);
        if (!cancelled) {
          setAccountLoading(false);
          setAuthzError("Skontaktuj się z administratorem lub zaakceptuj zaproszenie.");
        }
        return;
      }

      if (cancelled) return;

      setAccounts([{
        id: account.id,
        name: account.name,
        is_root: false,
        subscription_plan: account.subscription_plan || "starter",
        subscription_status: account.subscription_status || null,
        billing_locked_at: account.billing_locked_at || null,
        role: "owner",
      }]);
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

  const activePlan = useMemo(() => {
    if (isRootOperator) return "pro";
    return normalizePlan(activeAccount?.subscription_plan);
  }, [activeAccount?.subscription_plan, isRootOperator]);

  const activeSubscriptionStatus = activeAccount?.subscription_status || null;
  const isBillingLocked = Boolean(activeAccount?.billing_locked_at);

  const hasEntitlement = useMemo(
    () => (feature) => hasFeature(activePlan, feature),
    [activePlan],
  );
  const assertEntitlement = useMemo(
    () => (feature) => assertFeature(activePlan, feature),
    [activePlan],
  );

  const rootTelemetryAccessMode = useMemo(
    () => getRootTelemetryAccessMode({ isRootOperator, activeRole, user }),
    [activeRole, isRootOperator, user],
  );
  const canAccessTelemetry = rootTelemetryAccessMode !== "denied";

  /* ======================
     ACTIONS
     ====================== */

  function switchAccount(accountId) {
    if (!accounts?.length) return;
    if (!isRootOperator) return;
    if (!accounts.some((a) => a.id === accountId)) return;
    setActiveAccountId(accountId);
  }

  /* ======================
     CONTEXT
     ====================== */

  return (
    <AccountContext.Provider
      value={{
        accounts,
        isRootOperator,
        activeAccount,
        activeAccountId,
        switchAccount,
        accountLoading,

        activeRole,
        activePlan,
        activeSubscriptionStatus,
        isBillingLocked,
        hasEntitlement,
        assertEntitlement,
        canAccessTelemetry,
        rootTelemetryAccessMode,
        isRootTelemetryAdmin: rootTelemetryAccessMode === "root",

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
