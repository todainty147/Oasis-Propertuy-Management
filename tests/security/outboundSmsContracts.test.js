import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("outbound sms contracts", () => {
  it("keeps outbound sms events in repo bootstrap/apply order", () => {
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");
    const sql = readSource("supabase/outbound_sms_events.sql");

    expect(bootstrapSource).toContain("outbound_sms_events.sql");
    expect(applySource).toContain('"outbound_sms_events.sql"');
    expect(sql).toContain("create table if not exists public.outbound_sms_events");
    expect(sql).toContain("recipient_phone text not null");
    expect(sql).toContain("provider text not null default 'twilio'");
    expect(sql).toContain("lower(trim(status)) in ('queued', 'sent', 'failed', 'skipped')");
  });

  it("ships a Twilio-backed outbound sms sender for rent reminders and maintenance alerts", () => {
    const smsFn = readSource("supabase/functions/send-sms-notifications/index.ts");
    const deployScript = readSource("scripts/deployCronFunctions.js");

    expect(smsFn).toContain('import twilio from "npm:twilio"');
    expect(smsFn).toContain('const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")');
    expect(smsFn).toContain('const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")');
    expect(smsFn).toContain('const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER")');
    expect(smsFn).toContain("outbound_sms_events");
    expect(smsFn).toContain("rent_reminder_sms");
    expect(smsFn).toContain("maintenance_alert_sms");
    expect(smsFn).toContain("RENT_REMINDER_TYPES");
    expect(smsFn).toContain("MAINTENANCE_ALERT_TYPES");
    expect(smsFn).toContain("notifications");

    expect(deployScript).toContain('"send-sms-notifications"');
  });
});
