import { supabase } from "../lib/supabase";

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  if (["mortgage", "tax", "insurance", "utilities", "vacancy_loss", "other"].includes(value)) {
    return value;
  }
  return "other";
}

function toDateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

export async function listPropertyOperatingExpenses({
  accountId,
  propertyId,
  limit = 50,
} = {}) {
  if (!accountId || !propertyId) return [];

  const { data, error } = await supabase
    .from("property_operating_expenses")
    .select("id, account_id, property_id, category, expense_date, amount, notes, created_by, created_at, updated_at")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("expense_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function createPropertyOperatingExpense({
  accountId,
  propertyId,
  category,
  expenseDate,
  amount,
  notes = "",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");
  if (!expenseDate) throw new Error("Missing expense date");

  const nextAmount = Number(amount);
  if (!Number.isFinite(nextAmount) || nextAmount < 0) {
    throw new Error("Invalid expense amount");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("property_operating_expenses")
    .insert({
      account_id: accountId,
      property_id: propertyId,
      category: normalizeCategory(category),
      expense_date: toDateOnly(expenseDate),
      amount: nextAmount,
      notes: String(notes || "").trim() || null,
      created_by: user?.id || null,
    })
    .select("id, account_id, property_id, category, expense_date, amount, notes, created_by, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function getPropertyFinancialProfile({ accountId, propertyId } = {}) {
  if (!accountId || !propertyId) return null;

  const { data, error } = await supabase
    .from("property_financial_profiles")
    .select("property_id, account_id, estimated_market_value, target_cap_rate, notes, created_at, updated_at")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data || null;
}

export async function upsertPropertyFinancialProfile({
  accountId,
  propertyId,
  estimatedMarketValue = null,
  targetCapRate = null,
  notes = "",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");

  const nextValue =
    estimatedMarketValue === "" || estimatedMarketValue == null
      ? null
      : Number(estimatedMarketValue);
  const nextCapRate =
    targetCapRate === "" || targetCapRate == null
      ? null
      : Number(targetCapRate);

  if (nextValue != null && (!Number.isFinite(nextValue) || nextValue < 0)) {
    throw new Error("Invalid estimated market value");
  }
  if (nextCapRate != null && (!Number.isFinite(nextCapRate) || nextCapRate < 0)) {
    throw new Error("Invalid target cap rate");
  }

  const { data, error } = await supabase
    .from("property_financial_profiles")
    .upsert(
      {
        property_id: propertyId,
        account_id: accountId,
        estimated_market_value: nextValue,
        target_cap_rate: nextCapRate,
        notes: String(notes || "").trim() || null,
      },
      { onConflict: "property_id" },
    )
    .select("property_id, account_id, estimated_market_value, target_cap_rate, notes, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}
