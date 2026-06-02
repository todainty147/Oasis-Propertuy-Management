import { supabase } from "../lib/supabase";
import {
  calculateUpgradePlanTotals,
  estimateUpgradeImpact,
  suggestUpgradePath,
} from "../lib/ecoUpgradePlanner";

export async function listEcoUpgradeOptions() {
  const { data, error } = await supabase
    .from("eco_upgrade_options")
    .select("*")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getPropertyEpcProfile({ accountId, propertyId }) {
  if (!accountId || !propertyId) return null;
  const { data, error } = await supabase
    .from("property_epc_profiles")
    .select("*")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function upsertPropertyEpcProfile(payload = {}) {
  const row = {
    account_id: payload.accountId || payload.account_id,
    property_id: payload.propertyId || payload.property_id,
    current_epc_band: payload.currentEpcBand || payload.current_epc_band || null,
    current_epc_score: payload.currentEpcScore === "" ? null : payload.currentEpcScore ?? payload.current_epc_score ?? null,
    target_epc_band: payload.targetEpcBand || payload.target_epc_band || "C",
    target_epc_score: payload.targetEpcScore === "" ? null : payload.targetEpcScore ?? payload.target_epc_score ?? null,
    property_type: payload.propertyType || payload.property_type || null,
    heating_type: payload.heatingType || payload.heating_type || null,
    insulation_notes: payload.insulationNotes || payload.insulation_notes || null,
    last_epc_date: payload.lastEpcDate || payload.last_epc_date || null,
    epc_certificate_document_id: payload.epcCertificateDocumentId || payload.epc_certificate_document_id || null,
  };
  if (!row.account_id || !row.property_id) {
    throw new Error("Account and property are required to save an EPC profile.");
  }

  const existing = await getPropertyEpcProfile({ accountId: row.account_id, propertyId: row.property_id });
  const query = existing?.id
    ? supabase.from("property_epc_profiles").update(row).eq("id", existing.id).eq("account_id", row.account_id)
    : supabase.from("property_epc_profiles").insert(row);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function listEcoUpgradePlans({ accountId, propertyId } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("property_eco_upgrade_plans")
    .select("*, property_eco_upgrade_plan_items(*, eco_upgrade_options(*)), property_epc_profiles(*)")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getEcoUpgradePlan(planId) {
  if (!planId) return null;
  const { data, error } = await supabase
    .from("property_eco_upgrade_plans")
    .select("*, property_eco_upgrade_plan_items(*, eco_upgrade_options(*)), property_epc_profiles(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function normalizePlanPayload(payload = {}) {
  const items = payload.items || payload.property_eco_upgrade_plan_items || [];
  const impact = estimateUpgradeImpact(payload.profile || payload.property_epc_profiles || {}, items);
  return {
    account_id: payload.accountId || payload.account_id,
    property_id: payload.propertyId || payload.property_id,
    epc_profile_id: payload.epcProfileId || payload.epc_profile_id || null,
    status: payload.status || "draft",
    target_band: payload.targetBand || payload.target_band || impact.targetBand || "C",
    estimated_total_cost: Number(payload.estimatedTotalCost ?? payload.estimated_total_cost ?? impact.estimatedTotalCost) || 0,
    estimated_epc_points_gain: Number(payload.estimatedEpcPointsGain ?? payload.estimated_epc_points_gain ?? impact.estimatedEpcPointsGain) || 0,
    estimated_result_band: payload.estimatedResultBand || payload.estimated_result_band || impact.estimatedResultBand || null,
    notes: payload.notes || null,
  };
}

export async function createEcoUpgradePlan(payload = {}) {
  const row = normalizePlanPayload(payload);
  const { data, error } = await supabase.from("property_eco_upgrade_plans").insert(row).select().single();
  if (error) throw error;
  await writeEcoUpgradeAuditEvent({
    accountId: row.account_id,
    propertyId: row.property_id,
    planId: data.id,
    eventType: "eco_plan_created",
  });
  return data;
}

export async function updateEcoUpgradePlan(planId, payload = {}) {
  const { data, error } = await supabase
    .from("property_eco_upgrade_plans")
    .update(normalizePlanPayload(payload))
    .eq("id", planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertEcoUpgradePlanItem(planId, payload = {}) {
  const plan = await getEcoUpgradePlan(planId);
  const row = {
    id: payload.id || undefined,
    account_id: payload.accountId || payload.account_id || plan.account_id,
    plan_id: planId,
    upgrade_option_id: payload.upgradeOptionId || payload.upgrade_option_id || null,
    selected: payload.selected !== false,
    estimated_cost: payload.estimatedCost ?? payload.estimated_cost ?? null,
    estimated_epc_points_gain: payload.estimatedEpcPointsGain ?? payload.estimated_epc_points_gain ?? null,
    priority: payload.priority || "medium",
    linked_work_order_id: payload.linkedWorkOrderId || payload.linked_work_order_id || null,
    linked_document_id: payload.linkedDocumentId || payload.linked_document_id || null,
    completed_at: payload.completedAt || payload.completed_at || null,
    notes: payload.notes || null,
  };
  const { data, error } = await supabase
    .from("property_eco_upgrade_plan_items")
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  await recalculateEcoUpgradePlan(planId);
  return data;
}

export async function recalculateEcoUpgradePlan(planId) {
  const plan = await getEcoUpgradePlan(planId);
  if (!plan) return null;
  const items = (plan.property_eco_upgrade_plan_items || []).map((item) => ({
    ...item,
    ...item.eco_upgrade_options,
    estimated_cost: item.estimated_cost,
    estimated_epc_points_gain: item.estimated_epc_points_gain,
  }));
  const profile = plan.property_epc_profiles || { target_epc_band: plan.target_band };
  const impact = estimateUpgradeImpact(profile, items);
  const { data, error } = await supabase
    .from("property_eco_upgrade_plans")
    .update({
      estimated_total_cost: impact.estimatedTotalCost,
      estimated_epc_points_gain: impact.estimatedEpcPointsGain,
      estimated_result_band: impact.estimatedResultBand,
    })
    .eq("id", planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSuggestedEcoUpgradePlan({ accountId, propertyId, profile, targetBand = "C" }) {
  const options = await listEcoUpgradeOptions();
  const suggestion = suggestUpgradePath(profile, options, targetBand);
  const plan = await createEcoUpgradePlan({
    accountId,
    propertyId,
    epcProfileId: profile?.id || null,
    targetBand,
    estimatedTotalCost: suggestion.impact.estimatedTotalCost,
    estimatedEpcPointsGain: suggestion.impact.estimatedEpcPointsGain,
    estimatedResultBand: suggestion.impact.estimatedResultBand,
  });
  for (const item of suggestion.items) {
    await upsertEcoUpgradePlanItem(plan.id, {
      accountId,
      upgradeOptionId: item.id || null,
      selected: true,
      estimatedCost: item.estimated_cost,
      estimatedEpcPointsGain: item.estimated_epc_points_gain,
      priority: "medium",
    });
  }
  return getEcoUpgradePlan(plan.id);
}

export function summarizeEcoUpgradePortfolio({ profiles = [], plans = [] } = {}) {
  const byProperty = new Map(profiles.map((profile) => [String(profile.property_id), profile]));
  const selectedPlanItems = plans.flatMap((plan) => plan.property_eco_upgrade_plan_items || []);
  const totals = calculateUpgradePlanTotals(selectedPlanItems);
  return {
    belowEpcE: profiles.filter((profile) => ["F", "G"].includes(String(profile.current_epc_band || "").toUpperCase())).length,
    atEpcE: profiles.filter((profile) => String(profile.current_epc_band || "").toUpperCase() === "E").length,
    belowPlanningTargetC: profiles.filter((profile) => !["A", "B", "C"].includes(String(profile.current_epc_band || "").toUpperCase())).length,
    estimatedUpgradeCost: totals.estimatedTotalCost,
    highPriorityUpgrades: totals.highPriorityUpgrades,
    completedUpgrades: totals.completedUpgrades,
    propertyCount: byProperty.size,
  };
}

export async function createEcoUpgradeWorkOrderLink(planItemId, { workOrderId = null, notes = "" } = {}) {
  const { data: item, error: loadError } = await supabase
    .from("property_eco_upgrade_plan_items")
    .select("*, property_eco_upgrade_plans!inner(account_id, property_id)")
    .eq("id", planItemId)
    .single();
  if (loadError) throw loadError;

  // Safe stub: the maintenance work-order creation UI can prefill from this item.
  // When a real work order exists, this links it back to the plan item.
  const { data, error } = await supabase
    .from("property_eco_upgrade_plan_items")
    .update({
      linked_work_order_id: workOrderId,
      notes: notes || item.notes || "Upgrade / energy efficiency work order handoff prepared.",
    })
    .eq("id", planItemId)
    .select()
    .single();
  if (error) throw error;
  await writeEcoUpgradeAuditEvent({
    accountId: item.account_id,
    propertyId: item.property_eco_upgrade_plans?.property_id,
    planId: item.plan_id,
    eventType: "eco_work_order_linked",
    metadata: { plan_item_id: planItemId, work_order_id: workOrderId },
  });
  return data;
}

export async function writeEcoUpgradeAuditEvent({
  accountId,
  propertyId = null,
  planId = null,
  eventType,
  metadata = {},
} = {}) {
  if (!accountId || !eventType) return null;
  const { data, error } = await supabase
    .from("property_eco_upgrade_audit_events")
    .insert({
      account_id: accountId,
      property_id: propertyId,
      plan_id: planId,
      event_type: eventType,
      metadata,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
