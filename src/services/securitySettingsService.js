import { supabase } from "../lib/supabase";

const DEFAULT_SECURITY_SETTINGS = {
  role_change_target_threshold: 3,
  role_change_account_threshold: 5,
  role_change_window_minutes: 30,
  document_delete_actor_threshold: 5,
  document_delete_account_threshold: 10,
  document_delete_window_minutes: 15,
  export_retention_days: 14,
  surface_security_alerts_in_command_center: true,
  security_command_center_min_severity: "urgent",
  security_command_center_include_suspicious: true,
};

function withDefaults(accountId, row = null) {
  return {
    account_id: accountId,
    ...DEFAULT_SECURITY_SETTINGS,
    ...(row || {}),
  };
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function getAccountSecuritySettings(accountId) {
  if (!accountId) return null;

  const { data, error } = await supabase
    .from("account_security_settings")
    .select(
      `
      account_id,
      role_change_target_threshold,
      role_change_account_threshold,
      role_change_window_minutes,
      document_delete_actor_threshold,
      document_delete_account_threshold,
      document_delete_window_minutes,
      export_retention_days,
      surface_security_alerts_in_command_center,
      security_command_center_min_severity,
      security_command_center_include_suspicious
    `,
    )
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    if (isMissingBackendObject(error)) {
      return withDefaults(accountId);
    }
    throw error;
  }

  return withDefaults(accountId, data);
}

export async function upsertAccountSecuritySettings(accountId, patch = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const payload = withDefaults(accountId, patch);
  const { data, error } = await supabase
    .from("account_security_settings")
    .upsert(payload, { onConflict: "account_id" })
    .select(
      `
      account_id,
      role_change_target_threshold,
      role_change_account_threshold,
      role_change_window_minutes,
      document_delete_actor_threshold,
      document_delete_account_threshold,
      document_delete_window_minutes,
      export_retention_days,
      surface_security_alerts_in_command_center,
      security_command_center_min_severity,
      security_command_center_include_suspicious
    `,
    )
    .single();

  if (error) {
    if (isMissingBackendObject(error)) {
      return payload;
    }
    throw error;
  }

  return withDefaults(accountId, data);
}
