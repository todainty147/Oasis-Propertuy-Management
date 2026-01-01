import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setActiveAccountId(null);
      setAccountLoading(false);
      return;
    }

    async function loadAccount() {
      setAccountLoading(true);

      const { data, error } = await supabase
        .from("account_members")
        .select("account_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!error && data) {
        setActiveAccountId(data.account_id);
      }

      setAccountLoading(false);
    }

    loadAccount();
  }, [user, authLoading]);

  return (
    <AccountContext.Provider
      value={{
        activeAccountId,
        accountLoading,
        setActiveAccountId, // future use
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return ctx;
}
