// src/services/advancedRentService.js
//
// Service layer for all Epic 2 advanced rent models.
// Every write goes through Supabase RLS — no raw admin access from client.
// No direct ledger writes here; expected charges post through post_expected_charge().

import { getSupabaseClient } from "./supabaseClient";

function supabase() { return getSupabaseClient(); }

// ─────────────────────────────────────────────────────────────────────────────
// Model 1: Split Rent
// ─────────────────────────────────────────────────────────────────────────────

export async function listSplitsForPlan(rentPlanId) {
  const { data, error } = await supabase()
    .from("rent_splits")
    .select("*")
    .eq("rent_plan_id", rentPlanId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function saveSplit({ accountId, rentPlanId, tenantId, splitType, splitPercentage, fixedAmount, overrideReason }) {
  // Supersede any existing active split for this tenant+plan
  await supabase()
    .from("rent_splits")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("rent_plan_id", rentPlanId)
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  const { data, error } = await supabase()
    .from("rent_splits")
    .insert({
      account_id:      accountId,
      rent_plan_id:    rentPlanId,
      tenant_id:       tenantId,
      split_type:      splitType,
      split_percentage: splitPercentage ?? null,
      fixed_amount:    fixedAmount ?? null,
      override_reason: overrideReason ?? null,
      status:          "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSplit(splitId) {
  const { error } = await supabase()
    .from("rent_splits")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", splitId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model 2: Room-Based Rent
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoomsForProperty(accountId, propertyId) {
  const { data, error } = await supabase()
    .from("property_rooms")
    .select("*")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .neq("status", "inactive")
    .order("room_label");
  if (error) throw error;
  return data ?? [];
}

export async function createRoom({ accountId, propertyId, roomLabel, roomType = "single", floor, maxOccupants = 1, amenities }) {
  const { data, error } = await supabase()
    .from("property_rooms")
    .insert({
      account_id:    accountId,
      property_id:   propertyId,
      room_label:    roomLabel,
      room_type:     roomType,
      floor:         floor ?? null,
      max_occupants: maxOccupants,
      amenities:     amenities ?? null,
      status:        "available",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomStatus(roomId, status) {
  const { error } = await supabase()
    .from("property_rooms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
}

export async function listRoomAssignments(accountId, propertyId) {
  const { data, error } = await supabase()
    .from("room_rent_assignments")
    .select("*, property_rooms(room_label, room_type, status)")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function saveRoomAssignment({ accountId, rentPlanId, propertyId, roomId, tenantId, amount, currency, billingFrequency, prorationPolicy, effectiveFrom }) {
  // Supersede existing active assignment for same room+tenant
  await supabase()
    .from("room_rent_assignments")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  const { data, error } = await supabase()
    .from("room_rent_assignments")
    .insert({
      account_id:       accountId,
      rent_plan_id:     rentPlanId ?? null,
      property_id:      propertyId,
      room_id:          roomId,
      tenant_id:        tenantId ?? null,
      amount,
      currency:         currency ?? "GBP",
      billing_frequency: billingFrequency ?? "monthly",
      proration_policy: prorationPolicy ?? "actual_days_in_month",
      effective_from:   effectiveFrom,
      status:           "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model 3: Variable Utilities
// ─────────────────────────────────────────────────────────────────────────────

export async function listUtilityCharges(accountId, { propertyId, tenantId, status } = {}) {
  let q = supabase()
    .from("utility_charges")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  if (tenantId)   q = q.eq("tenant_id", tenantId);
  if (status)     q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveUtilityCharge({ accountId, rentPlanId, propertyId, tenantId, utilityType, calculationMethod, unitRate, standingCharge, previousReading, currentReading, readingStartDate, readingEndDate, invoiceAmount, splitMethod, splitRatio, amountCalculated, currency, evidenceNote, overrideReason }) {
  const { data, error } = await supabase()
    .from("utility_charges")
    .insert({
      account_id:          accountId,
      rent_plan_id:        rentPlanId ?? null,
      property_id:         propertyId ?? null,
      tenant_id:           tenantId ?? null,
      utility_type:        utilityType,
      calculation_method:  calculationMethod,
      unit_rate:           unitRate ?? null,
      standing_charge:     standingCharge ?? 0,
      previous_reading:    previousReading ?? null,
      current_reading:     currentReading ?? null,
      reading_start_date:  readingStartDate ?? null,
      reading_end_date:    readingEndDate ?? null,
      invoice_amount:      invoiceAmount ?? null,
      split_method:        splitMethod ?? null,
      split_ratio:         splitRatio ?? null,
      amount_calculated:   amountCalculated ?? null,
      currency:            currency ?? "GBP",
      evidence_note:       evidenceNote ?? null,
      override_reason:     overrideReason ?? null,
      status:              "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveUtilityCharge(chargeId, amountCalculated) {
  const { data, error } = await supabase()
    .from("utility_charges")
    .update({ status: "approved", amount_calculated: amountCalculated, updated_at: new Date().toISOString() })
    .eq("id", chargeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model 4: Rent Increase Workflow
// ─────────────────────────────────────────────────────────────────────────────

export async function proposeRentIncrease({ accountId, currentPlanId, newPlan }) {
  // Create a new draft plan that supersedes the current one when activated
  const { data, error } = await supabase()
    .from("rent_plans")
    .insert({
      account_id:            accountId,
      property_id:           newPlan.property_id ?? null,
      tenant_id:             newPlan.tenant_id ?? null,
      market:                newPlan.market ?? "generic",
      currency:              newPlan.currency ?? "GBP",
      billing_frequency:     newPlan.billing_frequency ?? "monthly",
      base_rent_amount:      newPlan.base_rent_amount,
      due_day:               newPlan.due_day ?? 1,
      start_date:            newPlan.effective_date,
      proration_policy:      newPlan.proration_policy ?? "actual_days_in_month",
      deposit_policy:        newPlan.deposit_policy ?? "market_default",
      deposit_amount:        newPlan.deposit_amount ?? null,
      utilities_policy:      newPlan.utilities_policy ?? "rent_only",
      rounding_policy:       newPlan.rounding_policy ?? "nearest_penny",
      status:                "proposed",
      supersedes_id:         currentPlanId,
      change_reason:         newPlan.change_reason ?? null,
      notice_required:       newPlan.notice_required ?? false,
      effective_date:        newPlan.effective_date ?? null,
      notes:                 newPlan.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markNoticeServed(planId, { method }) {
  const { data, error } = await supabase()
    .from("rent_plans")
    .update({
      status:           "notice_pending",
      notice_served_at: new Date().toISOString(),
      notice_method:    method,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveRentIncrease(planId) {
  const { data, error } = await supabase()
    .from("rent_plans")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Activate goes through the existing activate_rent_plan() RPC which handles superseding
export async function activateRentIncrease(accountId, planId) {
  const { data, error } = await supabase().rpc("activate_rent_plan", {
    p_account_id:   accountId,
    p_rent_plan_id: planId,
  });
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model 5: Discounts and Promotions
// ─────────────────────────────────────────────────────────────────────────────

export async function listAdjustments(accountId, { rentPlanId, tenantId, status } = {}) {
  let q = supabase()
    .from("rent_adjustments")
    .select("*")
    .eq("account_id", accountId)
    .order("start_date", { ascending: false });
  if (rentPlanId) q = q.eq("rent_plan_id", rentPlanId);
  if (tenantId)   q = q.eq("tenant_id", tenantId);
  if (status)     q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveAdjustment({ accountId, rentPlanId, tenantId, propertyId, adjustmentType, amount, percentage, appliesToChargeType, startDate, endDate, reason }) {
  const { data, error } = await supabase()
    .from("rent_adjustments")
    .insert({
      account_id:              accountId,
      rent_plan_id:            rentPlanId ?? null,
      tenant_id:               tenantId ?? null,
      property_id:             propertyId ?? null,
      adjustment_type:         adjustmentType,
      amount:                  amount ?? 0,
      percentage:              percentage ?? null,
      applies_to_charge_type:  appliesToChargeType ?? "rent",
      start_date:              startDate,
      end_date:                endDate ?? null,
      reason,
      status:                  "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function activateAdjustment(adjustmentId) {
  const { data, error } = await supabase()
    .from("rent_adjustments")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", adjustmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelAdjustment(adjustmentId) {
  const { error } = await supabase()
    .from("rent_adjustments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", adjustmentId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model 6: STR Nightly
// ─────────────────────────────────────────────────────────────────────────────

export async function listStrBookings(accountId, { propertyId, status } = {}) {
  let q = supabase()
    .from("str_booking_charges")
    .select("*")
    .eq("account_id", accountId)
    .order("check_in_date", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  if (status)     q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveStrBooking({ accountId, propertyId, market, currency, bookingReference, platform, checkInDate, checkOutDate, nights, nightlyRate, cleaningFee, platformFee, serviceFee, discountAmount, taxAmount, totalAmount, notes }) {
  const { data, error } = await supabase()
    .from("str_booking_charges")
    .insert({
      account_id:       accountId,
      property_id:      propertyId ?? null,
      market:           market ?? "generic",
      currency:         currency ?? "GBP",
      booking_reference: bookingReference ?? null,
      platform:         platform ?? null,
      check_in_date:    checkInDate,
      check_out_date:   checkOutDate,
      nights,
      nightly_rate:     nightlyRate,
      cleaning_fee:     cleaningFee ?? 0,
      platform_fee:     platformFee ?? 0,
      service_fee:      serviceFee ?? 0,
      discount_amount:  discountAmount ?? 0,
      tax_amount:       taxAmount ?? 0,
      total_amount:     totalAmount,
      status:           "draft",
      notes:            notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function confirmStrBooking(bookingId) {
  const { data, error } = await supabase()
    .from("str_booking_charges")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelStrBooking(bookingId) {
  const { error } = await supabase()
    .from("str_booking_charges")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) throw error;
}
