import { supabase } from "../lib/supabase";
import { parseRentShieldAssessmentRow, parseRpcRows } from "./rpcContracts";
import { normalizePaymentStatus, PAYMENT_STATUS } from "../utils/statuses";

const ASSESSMENT_SELECT = [
  "id", "account_id", "property_id", "period",
  "shield_score", "shield_tier",
  "arrears_amount", "days_overdue_p90",
  "ai_narrative", "generated_at", "prompt_version",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

// ── Score computation (deterministic, no AI) ──────────────────────────────────
//
// Inputs: payment rows for the property (any period).
// The score is a 0–100 operational estimate based on three factors:
//   1. Arrears ratio   → up to 50 penalty points
//   2. P90 days late   → up to 30 penalty points
//   3. Payment miss    → up to 20 penalty points
//
// This is not insurance, not credit scoring, not financial advice.

export function computeShieldMetrics(payments, today = new Date()) {
  if (!payments.length) {
    return { arrearsAmount: 0, daysOverdueP90: 0, paymentRate: 1, totalDue: 0, sampleSize: 0 };
  }

  let totalDue = 0;
  let arrearsAmount = 0;
  let paidCount = 0;
  const overdueDaysList = [];

  for (const p of payments) {
    const amount = Number(p.amount ?? 0);
    totalDue += amount;
    const status = normalizePaymentStatus(p.status);
    const dueDate = p.due_date ? new Date(`${String(p.due_date).slice(0, 10)}T00:00:00`) : null;

    const isPaid = status === PAYMENT_STATUS.PAID;
    const isOverdue = status === PAYMENT_STATUS.OVERDUE ||
      (status === PAYMENT_STATUS.PENDING && dueDate && dueDate < today);

    if (isPaid) {
      paidCount += 1;
    }
    if (isOverdue) {
      arrearsAmount += amount;
      if (dueDate) {
        const daysLate = Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / 86_400_000));
        overdueDaysList.push(daysLate);
      }
    }
  }

  const paymentRate = payments.length > 0 ? paidCount / payments.length : 1;
  const daysOverdueP90 = percentile90(overdueDaysList);
  const sampleSize = overdueDaysList.length;

  return { arrearsAmount, daysOverdueP90, paymentRate, totalDue, sampleSize };
}

function percentile90(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeShieldScore({ arrearsAmount, daysOverdueP90, paymentRate, totalDue }) {
  const arrearsPenalty  = Math.min(50, (arrearsAmount / Math.max(1, totalDue)) * 50);
  const overduePenalty  = Math.min(30, (daysOverdueP90 / 90) * 30);
  const missPenalty     = Math.min(20, (1 - paymentRate) * 20);
  const raw = 100 - arrearsPenalty - overduePenalty - missPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function classifyShieldTier(score) {
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  if (score >= 40) return "elevated";
  return "critical";
}

export function currentPeriodKey(date = new Date()) {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

// ── Period helpers ────────────────────────────────────────────────────────────

export function periodKeyToDateRange(period, today = new Date()) {
  // period is YYYY-MM (e.g. "2024-09")
  const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    // Fallback: last 12 months from today
    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() - 12);
    return { from: cutoff.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  }
  const [, y, m] = match;
  const from = `${y}-${m}-01`;
  // For the current month use month-to-date; otherwise use full calendar month
  const periodStart = new Date(`${y}-${m}-01T00:00:00`);
  const isCurrentMonth =
    today.getFullYear() === Number(y) && today.getMonth() + 1 === Number(m);
  const to = isCurrentMonth
    ? today.toISOString().slice(0, 10)
    : new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);
  return { from, to };
}

// ── Payment data fetch ────────────────────────────────────────────────────────

export async function fetchPropertyPayments(accountId, propertyId, { dateFrom = null, dateTo = null } = {}) {
  if (!accountId || !propertyId) return [];

  let query = supabase
    .from("payments")
    .select("id, amount, status, due_date, paid_at")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("due_date", { ascending: false });

  if (dateFrom) query = query.gte("due_date", dateFrom);
  if (dateTo)   query = query.lte("due_date", dateTo);

  const { data, error } = await query;

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data ?? [];
}

// ── Assessment CRUD ───────────────────────────────────────────────────────────

export async function upsertRentShieldAssessment(accountId, propertyId, period, {
  shieldScore,
  shieldTier,
  arrearsAmount,
  daysOverdueP90,
}) {
  if (!accountId || !propertyId) throw new Error("Missing accountId or propertyId");

  const { data, error } = await supabase
    .rpc("upsert_rent_shield_assessment", {
      p_account_id: accountId,
      p_property_id: propertyId,
      p_period: period,
      p_shield_score: shieldScore,
      p_shield_tier: shieldTier,
      p_arrears_amount: arrearsAmount,
      p_days_overdue_p90: daysOverdueP90,
    })
    .single();

  if (error) throw error;
  return parseRentShieldAssessmentRow(data);
}

export async function computeAndSaveAssessment(accountId, propertyId, period) {
  const { from: dateFrom, to: dateTo } = periodKeyToDateRange(period);
  const payments = await fetchPropertyPayments(accountId, propertyId, { dateFrom, dateTo });
  const metrics  = computeShieldMetrics(payments);
  const score    = computeShieldScore(metrics);
  const tier     = classifyShieldTier(score);
  const saved    = await upsertRentShieldAssessment(accountId, propertyId, period, {
    shieldScore: score,
    shieldTier: tier,
    arrearsAmount: metrics.arrearsAmount,
    daysOverdueP90: metrics.daysOverdueP90,
  });
  // sampleSize is not persisted to DB; return alongside the saved row
  // so the caller can show a low-confidence indicator when sampleSize < 5 (L-025)
  return { ...saved, sampleSize: metrics.sampleSize };
}

export async function listRentShieldAssessments(accountId, { propertyId = null } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_rent_shield_assessments", {
      p_account_id:  accountId,
      p_property_id: propertyId || null,
      p_limit:       24,
    });

  if (error) {
    if (error.code === "PGRST202") return _listRentShieldAssessmentsDirect(accountId, { propertyId });
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseRentShieldAssessmentRow, "rent shield assessments");
}

async function _listRentShieldAssessmentsDirect(accountId, { propertyId = null } = {}) {
  let query = supabase
    .from("rent_shield_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("account_id", accountId)
    .order("period", { ascending: false })
    .limit(24);

  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseRentShieldAssessmentRow, "rent shield assessments");
}

export async function getLatestAssessmentByProperty(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("get_latest_assessments_by_property", { p_account_id: accountId });

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseRentShieldAssessmentRow, "rent shield assessments");
}
