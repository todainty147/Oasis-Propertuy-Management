import { supabase } from "../lib/supabase";

/**
 * Atomically write a finance-tracking activation for a property.
 *
 * Fix 6 boundary date rule:
 *   - New import (called within import flow): caller may pass the import-completion
 *     date as coverageStart.
 *   - Existing import activated later: default to today (current date).
 *   - Historic import timestamps must NEVER be auto-used; caller must not pass them.
 *   - An earlier-than-today date requires the user to have confirmed all intervening
 *     payments are recorded (the UI enforces this; the RPC validates the attestation).
 *
 * @param {{
 *   accountId: string,
 *   propertyId: string,
 *   coverageStart: string,          // ISO date "YYYY-MM-DD" — must be <= today
 *   openingBalanceMinor: number,    // signed integer, minor units (pence/grosz)
 *   attestsProspectiveCompleteness: true,  // must be true — caller must set this explicitly
 *   note?: string
 * }} params
 * @returns {Promise<string>} The new activation record ID
 */
export async function activateTenancyFinanceTracking({
  accountId,
  propertyId,
  coverageStart,
  openingBalanceMinor,
  attestsProspectiveCompleteness,
  note = null,
}) {
  if (!accountId || !propertyId) throw new Error("Missing accountId or propertyId");
  if (!coverageStart) throw new Error("coverageStart is required");
  if (attestsProspectiveCompleteness !== true) {
    throw new Error(
      "attestsProspectiveCompleteness must be explicitly true — " +
      "the user must confirm all future payments will be recorded in Tenaqo"
    );
  }

  const { data, error } = await supabase.rpc("activate_tenancy_finance_tracking", {
    p_account_id:                       accountId,
    p_property_id:                      propertyId,
    p_coverage_start:                   coverageStart,
    p_opening_balance_minor:            openingBalanceMinor ?? 0,
    p_attests_prospective_completeness: true,
    p_note:                             note,
  });

  if (error) throw new Error(error.message ?? "Failed to activate finance tracking");

  const id = Array.isArray(data) ? data[0] : data;
  if (!id) throw new Error("Activation RPC returned no ID");
  return id;
}

/**
 * Return the FinanceCoverageState for a specific property.
 * Used by the Finance page and activation drawer to decide what to show.
 *
 * @param {{ accountId: string, propertyId: string }} params
 * @returns {Promise<import("../types/finance.js").FinanceCoverageState>}
 */
export async function getFinanceCoverageState({ accountId, propertyId }) {
  if (!accountId || !propertyId) throw new Error("Missing accountId or propertyId");

  const { data, error } = await supabase.rpc("get_finance_coverage_state", {
    p_account_id:  accountId,
    p_property_id: propertyId,
  });

  if (error) throw new Error(error.message ?? "Failed to fetch finance coverage state");

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("get_finance_coverage_state returned no data");
  return result;
}

/**
 * Fix 6: Return the default boundary date for a property activation.
 *
 * Rules (from brief Fix 6):
 *   - If activating within a new import flow → caller provides the import-completion
 *     date (today or the import-completion date, whichever applies).
 *   - If activating an existing import later → today.
 *   - Historic import timestamps must NEVER be auto-used.
 *
 * This function implements the "existing import activated later → today" rule.
 * The import-completion-date variant is handled at the call site (within the import flow).
 *
 * @returns {string} ISO date string "YYYY-MM-DD" for today
 */
export function defaultActivationBoundaryDate() {
  return new Date().toISOString().slice(0, 10);
}
