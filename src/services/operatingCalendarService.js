// src/services/operatingCalendarService.js
import { supabase } from "../lib/supabase";
import { financeAmountForProperty } from "../utils/financeSnapshot";
import { getFinanceSnapshot } from "./financeService";

export async function getOperatingCalendar({
  accountId,
  startDate,
  endDate,
  propertyId = null,
  sourceModule = null,
  urgency = null,
  status = null,
}) {
  if (!accountId) throw new Error("Missing accountId");

  const [{ data, error }, financeSnapshot] = await Promise.all([
    supabase.rpc("get_operating_calendar", {
      p_account_id:    accountId,
      p_start_date:    startDate,
      p_end_date:      endDate,
      p_property_id:   propertyId   ?? null,
      p_source_module: sourceModule ?? null,
      p_urgency:       urgency      ?? null,
      p_status:        status       ?? null,
    }),
    getFinanceSnapshot(accountId, null).catch(() => null),
  ]);

  if (error) throw error;
  return (data ?? []).map((item) => {
    if (item?.source_module !== "payment" || item?.status !== "overdue") return item;
    return {
      ...item,
      amount: financeAmountForProperty(financeSnapshot, item.property_id, item.amount),
    };
  });
}

export async function createCalendarItem({ accountId, title, dueDate, propertyId, notes, urgency, status }) {
  const { data, error } = await supabase
    .from("operating_calendar_items")
    .insert({
      account_id:  accountId,
      title,
      due_date:    dueDate,
      property_id: propertyId ?? null,
      notes:       notes      ?? null,
      urgency:     urgency    ?? "medium",
      status:      status     ?? "scheduled",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCalendarItem(id, { title, dueDate, propertyId, notes, urgency, status }) {
  const { data, error } = await supabase
    .from("operating_calendar_items")
    .update({
      title,
      due_date:    dueDate,
      property_id: propertyId ?? null,
      notes:       notes      ?? null,
      urgency:     urgency    ?? "medium",
      status:      status     ?? "scheduled",
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCalendarItem(id) {
  const { error } = await supabase
    .from("operating_calendar_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
