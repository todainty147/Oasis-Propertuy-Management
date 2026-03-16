// src/services/notificationService.js
import { supabase } from "../lib/supabase";
import { getAlertTaxonomy } from "../utils/alertTaxonomy";

/**
 * Thin wrapper around public.create_notifications RPC
 * Centralizes notification writes and enforces minimal validation.
 */
export async function createNotifications({
  accountId,
  recipientUserIds,
  type,
  title,
  body = null,
  entityType = null,
  entityId = null,
  linkPath = null,
  metadata = {},
}) {
  // Hard guard: don't call RPC with empty recipients
  if (!accountId) throw new Error("createNotifications: missing accountId");
  if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) return;
  if (!type) throw new Error("createNotifications: missing type");
  if (!title) throw new Error("createNotifications: missing title");

  const taxonomy = getAlertTaxonomy(type, metadata || {});
  const payload = {
    p_account_id: accountId,
    p_recipient_user_ids: recipientUserIds,
    p_type: type,
    p_title: title,
    p_body: body,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_link_path: linkPath,
    p_metadata: {
      ...(metadata ?? {}),
      alert_category: metadata?.alert_category || taxonomy.category,
      alert_severity: metadata?.alert_severity || taxonomy.severity,
    },
  };

  const { error } = await supabase.rpc("create_notifications", payload);

  if (error) {
    console.error("[notifications] RPC create_notifications failed:", {
      error,
      payload: {
        ...payload,
        // avoid logging potentially large metadata
        p_metadata: undefined,
      },
    });
    throw error;
  }
}
