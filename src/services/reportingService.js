import { supabase } from "../lib/supabase";
import { createNotifications } from "./notificationService";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function getWeeklyPortfolioSummary(accountId) {
  if (!accountId) throw new Error("Missing accountId");
  const { data, error } = await supabase.rpc("portfolio_weekly_summary", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load weekly summary");
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? {
    occupancy_rate: 0,
    open_requests: 0,
    waiting_over_48h: 0,
    overdue_balance: 0,
  };
}

export async function getAccountReportSettings(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase
    .from("account_report_settings")
    .select("account_id, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour, timezone")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw friendly(error, "Failed to load report settings");
  return (
    data ?? {
      account_id: accountId,
      weekly_summary_enabled: false,
      weekly_summary_day: 1,
      weekly_summary_hour: 8,
      timezone: "Europe/Warsaw",
    }
  );
}

export async function upsertAccountReportSettings({
  accountId,
  weeklySummaryEnabled,
  weeklySummaryDay,
  weeklySummaryHour,
  timezone,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const payload = {
    account_id: accountId,
    weekly_summary_enabled: Boolean(weeklySummaryEnabled),
    weekly_summary_day: Number.isFinite(Number(weeklySummaryDay)) ? Number(weeklySummaryDay) : 1,
    weekly_summary_hour: Number.isFinite(Number(weeklySummaryHour)) ? Number(weeklySummaryHour) : 8,
    timezone: timezone || "Europe/Warsaw",
  };

  const { data, error } = await supabase
    .from("account_report_settings")
    .upsert(payload, { onConflict: "account_id" })
    .select("account_id, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour, timezone")
    .single();

  if (error) throw friendly(error, "Failed to save report settings");
  return data;
}

async function getManagerRecipientIds(accountId) {
  const { data, error } = await supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId);
  if (error) throw error;

  return Array.from(
    new Set(
      (data || [])
        .filter((r) => ["owner", "admin", "staff"].includes(String(r?.role || "").toLowerCase()))
        .map((r) => r.user_id)
        .filter(Boolean)
    )
  );
}

export async function sendWeeklySummaryNow(accountId) {
  if (!accountId) throw new Error("Missing accountId");

  const [summary, recipients] = await Promise.all([
    getWeeklyPortfolioSummary(accountId),
    getManagerRecipientIds(accountId),
  ]);

  if (recipients.length === 0) return { summary, sent: 0 };

  const body = [
    `Occupancy: ${summary.occupancy_rate ?? 0}%`,
    `Open requests: ${summary.open_requests ?? 0}`,
    `Waiting >48h: ${summary.waiting_over_48h ?? 0}`,
    `Overdue balance: ${Number(summary.overdue_balance ?? 0).toLocaleString()} PLN`,
  ].join("\n");

  await createNotifications({
    accountId,
    recipientUserIds: recipients,
    type: "weekly_portfolio_summary",
    title: "Weekly Portfolio Summary",
    body,
    entityType: "account",
    entityId: accountId,
    linkPath: "/portfolio-health",
    metadata: {
      occupancy_rate: summary.occupancy_rate ?? 0,
      open_requests: summary.open_requests ?? 0,
      waiting_over_48h: summary.waiting_over_48h ?? 0,
      overdue_balance: Number(summary.overdue_balance ?? 0),
    },
  });

  return { summary, sent: recipients.length };
}
