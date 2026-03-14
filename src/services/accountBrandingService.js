import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function getAccountBranding(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase
    .from("account_branding")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw friendly(error, "Failed to load branding");
  return data ?? null;
}

export async function upsertAccountBranding(payload = {}) {
  if (!payload?.account_id) throw new Error("Missing account_id");
  const { data, error } = await supabase
    .from("account_branding")
    .upsert(payload, { onConflict: "account_id" })
    .select("*")
    .single();

  if (error) throw friendly(error, "Failed to save branding");
  return data;
}

