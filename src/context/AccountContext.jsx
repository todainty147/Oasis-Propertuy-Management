import { createContext, useContext, useEffect, useState } from "react";
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

  /* ======================
     LOAD ACCOUNTS
     ====================== */

  useEffect(() => {
    if (authLoading) return;

    // 🔒 Logged out
    if (!user) {
      setAccounts([]);
      setActiveAccountId(null);
      setAccountLoading(false);
      localStorage.removeItem("activeAccountId");
      return;
    }

    let cancelled = false;

    async function loadAccounts() {
      setAccountLoading(true);

      const { data: memberships, error } = await supabase
        .from("account_members")
        .select(`
          role,
          accounts (
            id,
            name
          )
        `)
        .eq("user_id", user.id);

      if (error) {
        console.error("Account membership load failed:", error);
        setAccountLoading(false);
        return;
      }

      if (cancelled) return;

      // ✅ HAS ACCOUNTS
      if (memberships.length > 0) {
        const accs = memberships.map((m) => ({
          id: m.accounts.id,
          name: m.accounts.name,
          role: m.role, // 🔐 SINGLE SOURCE OF TRUTH
        }));

        setAccounts(accs);

        const stored = localStorage.getItem("activeAccountId");
        const validStored =
          stored && accs.some((a) => a.id === stored);

        setActiveAccountId(validStored ? stored : accs[0].id);
        setAccountLoading(false);
        return;
      }

      // ✅ FIRST ACCOUNT (edge case)
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          name: user.email ?? "Moje konto",
        })
        .select()
        .single();

      if (accountError) {
        console.error("Account creation failed:", accountError);
        setAccountLoading(false);
        return;
      }

      await supabase.from("account_members").insert({
        account_id: account.id,
        user_id: user.id,
        role: "owner",
      });

      if (cancelled) return;

      setAccounts([
        { id: account.id, name: account.name, role: "owner" },
      ]);
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

  const activeAccount = accounts.find(
    (a) => a.id === activeAccountId
  );

  const activeRole = activeAccount?.role ?? null;

  /* ======================
     ACTIONS
     ====================== */

  function switchAccount(accountId) {
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
    throw new Error(
      "useAccount must be used inside <AccountProvider>"
    );
  }
  return ctx;
}
