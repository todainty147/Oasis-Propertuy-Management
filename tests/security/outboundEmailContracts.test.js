import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("outbound email contracts", () => {
  it("keeps outbound email events in repo bootstrap/apply order", () => {
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");
    const sql = readSource("supabase/outbound_email_events.sql");

    expect(bootstrapSource).toContain("outbound_email_events.sql");
    expect(applySource).toContain('"outbound_email_events.sql"');
    expect(sql).toContain("create table if not exists public.outbound_email_events");
    expect(sql).toContain("template_key text not null");
    expect(sql).toContain("recipient_email text not null");
    expect(sql).toContain("status text not null");
    expect(sql).toContain("lower(trim(status)) in ('queued', 'sent', 'failed', 'skipped')");
  });

  it("logs invite emails and reminder emails through Resend-backed edge functions", () => {
    const inviteFn = readSource("supabase/functions/invite-user/index.ts");
    const reminderFn = readSource("supabase/functions/send-reminder-emails/index.ts");
    const resetFn = readSource("supabase/functions/send-password-reset-email/index.ts");
    const deployScript = readSource("scripts/deployCronFunctions.js");
    const invitationService = readSource("src/services/invitationService.js");
    const passwordResetService = readSource("src/services/passwordResetService.js");
    const resetPage = readSource("src/pages/ResetPassword.jsx");

    expect(inviteFn).toContain('const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")');
    expect(inviteFn).toContain('mode?: "create" | "resend"');
    expect(inviteFn).toContain("function normalizeAppUrl(value: string)");
    expect(inviteFn).toContain('const appBaseUrl = normalizeAppUrl(APP_URL) || normalizeAppUrl(req.headers.get("origin") || "")');
    expect(inviteFn).toContain('const redirectTo = appBaseUrl ? `${appBaseUrl}/invite?token=${token}` : ""');
    expect(inviteFn).toContain("logEmailEvent");
    expect(inviteFn).toContain("outbound_email_events");
    expect(inviteFn).toContain('templateKey: mode === "resend" ? "account_invitation_resend" : "account_invitation"');

    expect(reminderFn).toContain("createClient");
    expect(reminderFn).toContain("outbound_email_events");
    expect(reminderFn).toContain("operational_reminder_summary");
    expect(reminderFn).toContain('const OASIS_REMINDERS_FROM = Deno.env.get("OASIS_REMINDERS_FROM")');
    expect(reminderFn).toContain("notifications");
    expect(reminderFn).toContain("REMINDER_TYPES");

    expect(resetFn).toContain('type: "recovery"');
    expect(resetFn).toContain("outbound_email_events");
    expect(resetFn).toContain('template_key: "password_reset"');
    expect(resetFn).toContain('const OASIS_PASSWORD_RESETS_FROM =');
    expect(resetFn).toContain('const redirectTo = appBaseUrl ? `${appBaseUrl}/reset-password?flow=recovery` : ""');
    expect(resetFn).toContain('https://api.resend.com/emails');

    expect(deployScript).toContain('"send-reminder-emails"');
    expect(invitationService).toContain('mode: "resend"');
    expect(invitationService).toContain("sendInviteViaEdge");
    expect(passwordResetService).toContain("/functions/v1/send-password-reset-email");
    expect(resetPage).toContain("requestPasswordResetEmail(clean)");
  });
});
