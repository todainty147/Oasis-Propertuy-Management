// src/services/expectedChargeService.js
// Manage expected_charges lifecycle: generate, list, post to Finance, cancel.
// Posting to Finance goes via post_expected_charge RPC → create_payment.
// Ledger entries are never written here.

import { supabase } from "../lib/supabase";

/**
 * List expected charges for an account.
 */
export async function listExpectedCharges({ accountId, rentPlanId, propertyId, tenantId, status } = {}) {
  let q = supabase
    .from("expected_charges")
    .select("*")
    .eq("account_id", accountId)
    .order("due_date", { ascending: true });

  if (rentPlanId) q = q.eq("rent_plan_id", rentPlanId);
  if (propertyId) q = q.eq("property_id", propertyId);
  if (tenantId)   q = q.eq("tenant_id", tenantId);
  if (status)     q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(`listExpectedCharges: ${error.message}`);
  return data ?? [];
}

/**
 * Generate a single expected charge from an approved calculation run.
 * Does NOT write to payments or ledger_entries.
 */
export async function generateExpectedCharge({
  accountId, rentPlanId, tenantId, propertyId,
  chargeType, periodStart, periodEnd, dueDate,
  amount, currency, calculationRunId, notes,
}) {
  const { data, error } = await supabase.rpc("generate_expected_charge", {
    p_account_id:         accountId,
    p_rent_plan_id:       rentPlanId,
    p_tenant_id:          tenantId,
    p_property_id:        propertyId,
    p_charge_type:        chargeType,
    p_period_start:       periodStart,
    p_period_end:         periodEnd,
    p_due_date:           dueDate,
    p_amount:             amount,
    p_currency:           currency,
    p_calculation_run_id: calculationRunId ?? null,
    p_notes:              notes ?? null,
  });
  if (error) throw new Error(`generateExpectedCharge: ${error.message}`);
  return data;
}

/**
 * Post a scheduled expected charge to the Finance payments table.
 * This is the ONLY approved path to create a payment from an expected charge.
 * Returns the newly created payment record.
 */
export async function postExpectedCharge({ accountId, expectedChargeId }) {
  const { data, error } = await supabase.rpc("post_expected_charge", {
    p_account_id:         accountId,
    p_expected_charge_id: expectedChargeId,
  });
  if (error) throw new Error(`postExpectedCharge: ${error.message}`);
  return data;
}

/**
 * Return a summary of overdue expected charges (scheduled, past due date).
 * Used by Finance page to surface arrears from the rent engine.
 */
export async function getOverdueExpectedChargesSummary({ accountId }) {
  const { data, error } = await supabase
    .from("expected_charges")
    .select("id, amount, currency, due_date, tenant_id, property_id")
    .eq("account_id", accountId)
    .eq("status", "scheduled")
    .lt("due_date", new Date().toISOString().slice(0, 10))
    .order("due_date", { ascending: true });

  if (error) throw new Error(`getOverdueExpectedChargesSummary: ${error.message}`);

  const rows = data ?? [];
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return {
    count:       rows.length,
    totalAmount,
    currency:    rows[0]?.currency ?? "GBP",
    charges:     rows,
  };
}

/**
 * Cancel a scheduled expected charge (cannot cancel posted/superseded charges).
 */
export async function cancelExpectedCharge({ accountId, expectedChargeId, notes }) {
  const { data, error } = await supabase.rpc("cancel_expected_charge", {
    p_account_id:         accountId,
    p_expected_charge_id: expectedChargeId,
    p_notes:              notes ?? null,
  });
  if (error) throw new Error(`cancelExpectedCharge: ${error.message}`);
  return data;
}
