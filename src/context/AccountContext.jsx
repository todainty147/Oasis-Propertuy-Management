import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccounts([]);
      setActiveAccountId(null);
      setAccountLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOrCreateAccount() {
      setAccountLoading(true);

      const { data: memberships, error } = await supabase
        .from("account_members")
        .select(`
          account_id,
          role,
          accounts (
            id,
            name,
            created_at
          )
        `)
        .eq("user_id", user.id);

      if (error) {
        console.error(error);
        setAccountLoading(false);
        return;
      }

      if (memberships.length > 0) {
        if (cancelled) return;

        const accs = memberships.map((m) => ({
          id: m.accounts.id,
          name: m.accounts.name,
          role: m.role,
        }));

        setAccounts(accs);
        setActiveAccountId(accs[0].id);
        setAccountLoading(false);
        return;
      }
const { data: account, error: accountError } = await supabase
  .from("accounts")
  .insert({
    name: user.email ?? "Moje konto",
  })
  .select()
  .single();


      if (accountError) {
        console.error(accountError);
        setAccountLoading(false);
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
      setAccountLoading(false);
    }

    loadOrCreateAccount();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const activeAccount = accounts.find(
  (a) => a.id === activeAccountId
);

const role = activeAccount?.role ?? null;

  return (
    <AccountContext.Provider
      value={{ accounts, activeAccountId, setActiveAccountId, accountLoading, role, }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used inside AccountProvider");
  }
  return ctx;
}
