// src/services/rentPlanService.js
// CRUD + lifecycle management for rent_plans and rent_charge_rules.
// Posting paths go through expectedChargeService.js, not here.

import { supabase } from "../lib/supabase";

function nullIfBlank(value) {
  return value === "" ? null : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rent Plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all rent plans for an account, ordered by created_at desc.
 * Optionally filtered by property or tenant.
 */
export async function listRentPlans({ accountId, propertyId, tenantId } = {}) {
  let q = supabase
    .from("rent_plans")
    .select(`
      *,
      rent_charge_rules (*)
    `)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (propertyId) q = q.eq("property_id", propertyId);
  if (tenantId)   q = q.eq("tenant_id", tenantId);

  const { data, error } = await q;
  if (error) throw new Error(`listRentPlans: ${error.message}`);
  return data ?? [];
}

/**
 * Get a single rent plan (with charge rules).
 */
export async function getRentPlan({ accountId, rentPlanId }) {
  const { data, error } = await supabase
    .from("rent_plans")
    .select(`*, rent_charge_rules (*)`)
    .eq("id", rentPlanId)
    .eq("account_id", accountId)
    .single();

  if (error) throw new Error(`getRentPlan: ${error.message}`);
  return data;
}

/**
 * Create a new rent plan (status = 'draft').
 * chargeRules is an optional array of rule shapes to upsert alongside.
 */
export async function createRentPlan({ accountId, plan, chargeRules = [] }) {
  const { data: created, error } = await supabase
    .from("rent_plans")
    .insert({
      account_id:        accountId,
      property_id:       plan.propertyId ?? null,
      tenant_id:         plan.tenantId ?? null,
      lease_id:          plan.leaseId ?? null,
      market:            plan.market ?? "generic",
      currency:          plan.currency ?? "GBP",
      billing_frequency: plan.billingFrequency ?? "monthly",
      base_rent_amount:  plan.baseRentAmount,
      due_day:           plan.dueDay ?? 1,
      start_date:        plan.startDate,
      end_date:          nullIfBlank(plan.endDate ?? null),
      proration_policy:  plan.prorationPolicy ?? "actual_days_in_month",
      deposit_policy:    plan.depositPolicy ?? "market_default",
      deposit_amount:    nullIfBlank(plan.depositAmount ?? null),
      utilities_policy:  plan.utilitiesPolicy ?? "rent_only",
      rounding_policy:   plan.roundingPolicy ?? "nearest_penny",
      notes:             nullIfBlank(plan.notes ?? null),
      status:            "draft",
    })
    .select()
    .single();

  if (error) throw new Error(`createRentPlan: ${error.message}`);

  if (chargeRules.length > 0) {
    await upsertChargeRules({ accountId, rentPlanId: created.id, rules: chargeRules });
  }

  return created;
}

/**
 * Update a draft rent plan. Active/superseded plans cannot be mutated —
 * supersede them with a new draft instead.
 */
export async function updateRentPlan({ accountId, rentPlanId, updates }) {
  const { data: existing } = await supabase
    .from("rent_plans")
    .select("status")
    .eq("id", rentPlanId)
    .eq("account_id", accountId)
    .single();

  if (existing?.status !== "draft") {
    throw new Error("Only draft rent plans can be edited. Create a new plan to supersede the active one.");
  }

  const { data, error } = await supabase
    .from("rent_plans")
    .update({
      property_id:       updates.propertyId,
      tenant_id:         updates.tenantId,
      lease_id:          updates.leaseId,
      market:            updates.market,
      currency:          updates.currency,
      billing_frequency: updates.billingFrequency,
      base_rent_amount:  updates.baseRentAmount,
      due_day:           updates.dueDay,
      start_date:        updates.startDate,
      end_date:          nullIfBlank(updates.endDate),
      proration_policy:  updates.prorationPolicy,
      deposit_policy:    updates.depositPolicy,
      deposit_amount:    nullIfBlank(updates.depositAmount),
      utilities_policy:  updates.utilitiesPolicy,
      rounding_policy:   updates.roundingPolicy,
      notes:             nullIfBlank(updates.notes),
      updated_at:        new Date().toISOString(),
    })
    .eq("id", rentPlanId)
    .eq("account_id", accountId)
    .select()
    .single();

  if (error) throw new Error(`updateRentPlan: ${error.message}`);
  return data;
}

/**
 * Activate a draft plan via the server-side RPC (handles supersession).
 */
export async function activateRentPlan({ accountId, rentPlanId }) {
  const { data, error } = await supabase.rpc("activate_rent_plan", {
    p_account_id:   accountId,
    p_rent_plan_id: rentPlanId,
  });
  if (error) throw new Error(`activateRentPlan: ${error.message}`);
  return data;
}

/**
 * End an active plan (marks it as 'ended' — not deleted).
 */
export async function endRentPlan({ accountId, rentPlanId }) {
  const { data, error } = await supabase
    .from("rent_plans")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("id", rentPlanId)
    .eq("account_id", accountId)
    .in("status", ["active", "draft"])
    .select()
    .single();

  if (error) throw new Error(`endRentPlan: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Charge Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert charge rules for a plan. Existing rules for the plan are replaced.
 */
export async function upsertChargeRules({ accountId, rentPlanId, rules }) {
  // Clear existing
  await supabase
    .from("rent_charge_rules")
    .delete()
    .eq("rent_plan_id", rentPlanId)
    .eq("account_id", accountId);

  if (!rules.length) return [];

  const rows = rules.map((r) => ({
    account_id:       accountId,
    rent_plan_id:     rentPlanId,
    charge_type:      r.chargeType,
    label:            r.label,
    amount:           r.amount,
    calculation_type: r.calculationType ?? "fixed",
    frequency:        r.frequency ?? "monthly",
    included_in_rent: r.includedInRent ?? false,
    taxable_flag:     r.taxable ?? false,
    effective_from:   r.effectiveFrom ?? null,
    effective_to:     r.effectiveTo ?? null,
    metadata:         r.metadata ?? {},
  }));

  const { data, error } = await supabase
    .from("rent_charge_rules")
    .insert(rows)
    .select();

  if (error) throw new Error(`upsertChargeRules: ${error.message}`);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculation Runs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a calculation run record (audit trail).
 */
export async function saveCalculationRun({
  accountId, rentPlanId, tenantId, propertyId,
  periodStart, periodEnd, calculationInput, calculationResult, warnings = [],
}) {
  const { data, error } = await supabase.rpc("save_calculation_run", {
    p_account_id:         accountId,
    p_rent_plan_id:       rentPlanId,
    p_tenant_id:          tenantId,
    p_property_id:        propertyId,
    p_period_start:       periodStart,
    p_period_end:         periodEnd,
    p_calculation_input:  calculationInput,
    p_calculation_result: calculationResult,
    p_warnings:           warnings,
  });
  if (error) throw new Error(`saveCalculationRun: ${error.message}`);
  return data;
}

/**
 * List calculation runs for a plan, newest first.
 */
export async function listCalculationRuns({ accountId, rentPlanId }) {
  const { data, error } = await supabase
    .from("rent_calculation_runs")
    .select("*")
    .eq("account_id", accountId)
    .eq("rent_plan_id", rentPlanId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`listCalculationRuns: ${error.message}`);
  return data ?? [];
}
