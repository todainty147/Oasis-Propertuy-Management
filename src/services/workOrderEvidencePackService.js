import { supabase } from "../lib/supabase.js";

/**
 * Fetches the Work Order Evidence Pack payload via the authorized
 * get_work_order_evidence_pack SECURITY DEFINER RPC.
 *
 * Uses the authenticated Supabase client only — never the admin/service_role client.
 * Authorization is enforced server-side by user_can_manage_account(p_account_id).
 *
 * Returns the JSONB payload suitable for generateMaintenancePackPdf.
 */
export async function getWorkOrderEvidencePack({ accountId, workOrderId }) {
  const { data, error } = await supabase.rpc("get_work_order_evidence_pack", {
    p_account_id:    accountId,
    p_work_order_id: workOrderId,
  });
  if (error) throw new Error(error.message || "Failed to load work order evidence pack");
  return data;
}
