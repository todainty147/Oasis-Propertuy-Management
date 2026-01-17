import { supabase } from "../lib/supabase";

export async function getMyTenantAccount() {
  const { data: { user }, error: uErr } = await supabase.auth.getUser();
  if (uErr || !user) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select("account_id, id, status, archived_at")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
