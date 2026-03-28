import { supabase } from "../lib/supabase";
import { parseContractorRatingRow } from "./rpcContracts";

function isMissingRatingsTableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("could not find the table 'public.contractor_ratings'") ||
    msg.includes("relation \"contractor_ratings\" does not exist")
  );
}

function friendly(err, fallback) {
  if (isMissingRatingsTableError(err)) {
    return new Error(
      "Brak tabeli contractor_ratings w bazie. Uruchom skrypt supabase/contractor_ratings.sql i odśwież API schema cache w Supabase."
    );
  }
  return new Error(err?.message ?? fallback);
}

export async function getContractorRatingByWorkOrder(workOrderId) {
  if (!workOrderId) return null;
  const { data, error } = await supabase
    .from("contractor_ratings")
    .select("id, account_id, work_order_id, contractor_user_id, rating, comment, rated_by, created_at, updated_at")
    .eq("work_order_id", workOrderId)
    .maybeSingle();
  if (error) throw friendly(error, "Nie udało się pobrać oceny wykonawcy");
  return data ? parseContractorRatingRow(data) : null;
}

export async function upsertContractorRating({
  accountId,
  workOrderId,
  contractorUserId = null,
  rating,
  comment = null,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");
  const n = Number(rating);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    throw new Error("Ocena musi być w zakresie 1-5");
  }

  const payload = {
    account_id: accountId,
    work_order_id: workOrderId,
    contractor_user_id: contractorUserId || null,
    rating: Math.round(n),
    comment: comment?.trim() || null,
  };

  const { data, error } = await supabase
    .from("contractor_ratings")
    .upsert(payload, { onConflict: "work_order_id" })
    .select("id, account_id, work_order_id, contractor_user_id, rating, comment, rated_by, created_at, updated_at")
    .single();

  if (error) throw friendly(error, "Nie udało się zapisać oceny wykonawcy");
  return parseContractorRatingRow(data);
}
