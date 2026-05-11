// src/context/AccountContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { rootListAccounts } from "../services/rootAccountService";
import { finalizeSelfServeLandlordAccount } from "../services/selfServeSignupService";
import { canAccessRootTelemetry, getRootTelemetryAccessMode } from "../utils/telemetryAccess";
import { getPermissionKeysForRole } from "../utils/permissions";
import { assertFeature, hasFeature, isLockedPlan, normalizePlan } from "../lib/entitlements";
import { getMyOaGrantStatus } from "../services/operatorAgencyService";
import { getAccountActiveEntitlement } from "../services/founderOfferService";

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
  const [accountVersion, setAccountVersion] = useState(0);

  // ✅ Tenant portal path (no account_members required)
  const [tenantContext, setTenantContext] = useState(null); // { account_id, tenant_id, status }

  // ✅ Contractor portal path (no account_members required)
  const [contractorContext, setContractorContext] = useState(null); // { account_id }

  const [authzError, setAuthzError] = useState(null);
  const [oaGrantStatus, setOaGrantStatus] = useState(null); // { paymentStatus, checkoutUrl, ... }
  const [founderEntitlement, setFounderEntitlement] = useState(null);

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
            role_id,
            accounts (
              ${fields}
            )
          `
          )
          .eq("user_id", user.id);
      }

      let memberships = null;
      let membershipErr = null;
      let successFields = null;
      const fieldsPriority = [
        // Full schema (live DB with all migrations)
        "id,name,is_root,is_disabled,subscription_plan,subscription_status,billing_locked_at,trial_ends_at,trial_source,country_code,currency,language",
        // Without localisation cols (older live DB)
        "id,name,is_root,is_disabled,subscription_plan,subscription_status,billing_locked_at,trial_ends_at,trial_source",
        // Without trial_source but with localisation (local dev DB post-currency migration)
        "id,name,is_root,is_disabled,subscription_plan,subscription_status,billing_locked_at,country_code,currency,language",
        // Without localisation cols (local dev DB pre-currency migration)
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
        if (!membershipErr) { successFields = fields; break; }
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

      if (successFields && !successFields.includes("subscription_plan")) {
        console.warn(
          "AccountContext: loaded accounts without subscription_plan — billing entitlements will default to 'starter'. Schema may need migration.",
          { successFields },
        );
      }

      if (cancelled) return;

      // ✅ HAS ACCOUNTS (owner/admin/staff)
      if (memberships?.length > 0) {
        // roleId is present when the membership uses a custom role (narrower than
        // the legacy role). If the RPC fails for a custom-role member, we fail
        // closed (return []) rather than expanding to the broader legacy role
        // permissions — a transient error must not grant UI access the custom
        // role intentionally withholds. For legacy-role members (roleId = null)
        // the fallback to getPermissionKeysForRole is safe and correct.
        async function loadPermissionKeys(accountId, role, roleId) {
          const legacyFallback = getPermissionKeysForRole(role);
          try {
            const { data, error } = await supabase.rpc("account_member_permission_keys", {
              p_account_id: accountId,
            });

            if (error) {
              if (roleId) {
                console.warn("account_member_permission_keys failed for custom-role account — failing closed:", error);
                return [];
              }
              console.warn("account_member_permission_keys failed, falling back to legacy permissions:", error);
              return legacyFallback;
            }

            if (!Array.isArray(data)) return roleId ? [] : legacyFallback;

            const normalized = data
              .map((key) => String(key ?? "").trim().toLowerCase())
              .filter(Boolean);

            return Array.from(new Set(normalized));
          } catch (error) {
            if (roleId) {
              console.warn("account_member_permission_keys threw for custom-role account — failing closed:", error);
              return [];
            }
            console.warn("account_member_permission_keys threw, falling back to legacy permissions:", error);
            return legacyFallback;
          }
        }

        const membershipPermissionKeys = await Promise.all(
          memberships.map(async (m) => {
            const accountId = m.accounts?.id;
            if (!accountId) return [null, []];
            return [accountId, await loadPermissionKeys(accountId, m.role, m.role_id || null)];
          }),
        );
        const permissionKeysByAccountId = new Map(membershipPermissionKeys.filter(([accountId]) => accountId));

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
            trial_ends_at: m.accounts.trial_ends_at || null,
            trial_source: m.accounts.trial_source || null,
            country_code: m.accounts.country_code || "PL",
            currency:     m.accounts.currency     || "PLN",
            language:     m.accounts.language     || "pl",
            role: m.role, // 🔐 SINGLE SOURCE OF TRUTH
            role_id: m.role_id || null,
            permissionKeys: permissionKeysByAccountId.get(m.accounts.id) || getPermissionKeysForRole(m.role),
          }));
        const rootMembership = membershipAccounts.find(
          (a) => a.is_root && String(a.role || "").toLowerCase() === "owner",
        );
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
                trial_ends_at: existing?.trial_ends_at || null,
                trial_source: existing?.trial_source || null,
                country_code: existing?.country_code || "PL",
                currency:     existing?.currency     || "PLN",
                language:     existing?.language     || "pl",
                // Keep root support switching distinct from normal landlord roles.
                // Dedicated root/support surfaces still key off isRootOperator, while
                // ordinary CRUD screens should reflect the target account's real role.
                role: existing?.role || "root_support",
                role_id: existing?.role_id || null,
                permissionKeys: existing?.permissionKeys || [],
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
         2) TENANT + CONTRACTOR paths
         Run in parallel: tenant RLS errors must not block the contractor path
         and vice versa. Tenant takes priority when both match.
         ====================== */
      const [tenantRes, contractorRes] = await Promise.allSettled([
        supabase
          .from("tenants")
          .select("id, account_id, status, archived_at")
          .eq("user_id", user.id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("work_orders")
          .select("id, account_id")
          .eq("contractor_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const tenantRow = tenantRes.status === "fulfilled" && !tenantRes.value.error
        ? tenantRes.value.data
        : null;
      const contractorRow = contractorRes.status === "fulfilled" && !contractorRes.value.error
        ? contractorRes.value.data
        : null;

      const tenantErr = tenantRes.status === "rejected"
        ? tenantRes.reason
        : (tenantRes.value?.error ?? null);
      const contractorErr = contractorRes.status === "rejected"
        ? contractorRes.reason
        : (contractorRes.value?.error ?? null);

      if (tenantErr) console.warn("Tenant context lookup (non-fatal):", tenantErr);
      if (contractorErr) console.warn("Contractor context lookup (non-fatal):", contractorErr);

      // Explicit dual-role guard — makes the priority decision visible and observable
      if (tenantRow?.account_id && contractorRow?.account_id) {
        console.warn(
          "AccountContext: user matches both tenant and contractor — tenant portal takes priority.",
          { tenantAccountId: tenantRow.account_id, contractorAccountId: contractorRow.account_id },
        );
      }

      // ✅ Tenant found -> allow tenant portal
      if (tenantRow?.account_id) {
        setTenantContext({
          tenant_id: tenantRow.id,
          account_id: tenantRow.account_id,
          status: tenantRow.status,
        });

        setAccounts([]);

        const stored = localStorage.getItem("activeAccountId");
        const useStored = stored && stored === tenantRow.account_id;
        const nextId = useStored ? stored : tenantRow.account_id;
        setActiveAccountId(nextId);
        localStorage.setItem("activeAccountId", nextId);

        setAccountLoading(false);
        return;
      }

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
          const signupSandboxMode = String(user?.user_metadata?.signup_sandbox_mode || "").toLowerCase() === "true";
          const row = await finalizeSelfServeLandlordAccount(
            user?.user_metadata?.signup_account_name || user?.email || "",
            { sandboxMode: signupSandboxMode },
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
              sandbox_mode: row?.sandbox_mode || "production",
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
  }, [user, authLoading, accountVersion]);

  /* ======================
     OA GRANT STATUS
     Fetch lazily when active account changes. Root operators skip this.
     ====================== */

  useEffect(() => {
    if (!activeAccountId || isRootOperator) {
      setOaGrantStatus(null);
      return;
    }
    let cancelled = false;
    getMyOaGrantStatus(activeAccountId)
      .then((status) => { if (!cancelled) setOaGrantStatus(status); })
      .catch(() => { if (!cancelled) setOaGrantStatus(null); });
    return () => { cancelled = true; };
  }, [activeAccountId, isRootOperator]);

  /* Founder entitlement — load alongside OA grant status */
  useEffect(() => {
    if (!activeAccountId) {
      setFounderEntitlement(null);
      return;
    }
    let cancelled = false;
    getAccountActiveEntitlement(activeAccountId)
      .then((ent) => { if (!cancelled) setFounderEntitlement(ent); })
      .catch(() => { if (!cancelled) setFounderEntitlement(null); });
    return () => { cancelled = true; };
  }, [activeAccountId]);

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

  // Trial derived values
  const trialEndsAt = activeAccount?.trial_ends_at ?? null;
  const isInTrial = useMemo(
    () => Boolean(trialEndsAt && new Date(trialEndsAt) > new Date()),
    [trialEndsAt],
  );
  const isTrialExpired = useMemo(
    () => Boolean(trialEndsAt && new Date(trialEndsAt) <= new Date()),
    [trialEndsAt],
  );
  const trialDaysLeft = useMemo(() => {
    if (!isInTrial || !trialEndsAt) return 0;
    return Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
  }, [isInTrial, trialEndsAt]);

  const activePlan = useMemo(() => {
    // Root operators are always operator_agency
    if (isRootOperator) return "operator_agency";

    // OA grant states take precedence over trial and Stripe
    const oaStatus = oaGrantStatus?.paymentStatus;
    if (oaStatus === "active") return "operator_agency";
    if (["draft", "pending_checkout", "pending_payment"].includes(oaStatus || ""))
      return "operator_agency_pending";
    if (oaStatus === "expired") return "oa_contract_expired";

    const stripeStatus = activeAccount?.subscription_status;
    const rawPlan = normalizePlan(activeAccount?.subscription_plan);

    // Active Stripe subscription
    if (["active", "trialing"].includes(stripeStatus)) return rawPlan;

    // Past due — let SQL decide grace vs lock; frontend shows plan with a warning
    if (stripeStatus === "past_due") return rawPlan;

    // OASIS trial
    if (isInTrial) return rawPlan;
    if (isTrialExpired) return "trial_expired";

    // Grandfathered / no trial
    return rawPlan;
  }, [isRootOperator, oaGrantStatus, activeAccount, isInTrial, isTrialExpired]);

  const isOaPending = activePlan === "operator_agency_pending";
  const oaCheckoutUrl = isOaPending && !oaGrantStatus?.checkoutExpired
    ? oaGrantStatus?.checkoutUrl ?? null
    : null;

  // Combined account access state used to show the correct wall or banner
  const accountAccessState = useMemo(() => {
    if (isRootOperator) return "active";
    if (activePlan === "trial_expired") return "locked_trial";
    if (activePlan === "oa_contract_expired") return "locked_oa_expired";
    if (activePlan === "operator_agency_pending") return "oa_pending_payment";
    if (activePlan === "billing_locked") return "billing_locked";
    if (isInTrial && trialDaysLeft <= 7) return "trial_warning";
    return "active";
  }, [activePlan, isRootOperator, isInTrial, trialDaysLeft]);

  const activeSubscriptionStatus = activeAccount?.subscription_status || null;
  const isBillingLocked = Boolean(activeAccount?.billing_locked_at);

  // Currency / localisation — derived from account settings, fall back to safe defaults
  const activeCurrency    = activeAccount?.currency     || "PLN";
  const activeCountryCode = activeAccount?.country_code || "PL";
  const activeLanguage    = activeAccount?.language     || "pl";
  const activePermissionKeys = useMemo(() => {
    if (Array.isArray(activeAccount?.permissionKeys)) return activeAccount.permissionKeys;
    return getPermissionKeysForRole(activeRole);
  }, [activeAccount?.permissionKeys, activeRole]);
  const activePermissionContext = useMemo(
    () => ({
      role: activeRole,
      permissionKeys: activePermissionKeys,
    }),
    [activePermissionKeys, activeRole],
  );

  // Founder entitlement derived values
  const isFounder              = founderEntitlement !== null;
  const founderEffectivePlan   = founderEntitlement?.effective_plan ?? null;
  const founderBilledPlan      = founderEntitlement?.billed_plan ?? null;
  const founderEndsAt          = founderEntitlement?.ends_at ?? null;
  const founderAiMonthlyLimit  = founderEntitlement?.monthly_ai_credit_limit ?? null;
  const founderPosition        = founderEntitlement?.metadata?.founder_position ?? null;

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

  function reloadAccounts() {
    setAccountVersion((v) => v + 1);
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
        reloadAccounts,
        accountLoading,

        activeRole,
        activePermissionKeys,
        activePermissionContext,
        activePlan,
        accountAccessState,
        activeSubscriptionStatus,
        isBillingLocked,
        hasEntitlement,
        assertEntitlement,
        canAccessTelemetry,
        rootTelemetryAccessMode,
        isRootTelemetryAdmin: rootTelemetryAccessMode === "root",

        // Trial
        trialEndsAt,
        isInTrial,
        isTrialExpired,
        trialDaysLeft,

        // OA grant
        oaGrantStatus,
        isOaPending,
        oaCheckoutUrl,

        // Founder entitlement
        isFounder,
        founderEffectivePlan,
        founderBilledPlan,
        founderEndsAt,
        founderAiMonthlyLimit,
        founderPosition,

        tenantContext,
        contractorContext,

        // Localisation
        activeCurrency,
        activeCountryCode,
        activeLanguage,

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
