import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const SCHEDULED_FUNCTIONS = [
  "sync-operational-automation",
  "send-reminder-emails",
  "send-sms-notifications",
  "cleanup-security-audit-exports",
  "cleanup-security-observability-events",
];

describe("scheduled Edge Function observability contracts", () => {
  it("keeps scheduled functions on the shared hosted-observability helper", () => {
    const helper = readSource("supabase/functions/_shared/scheduledObservability.ts");

    expect(helper).toContain("export function getCronAuthResult");
    expect(helper).toContain("export async function recordScheduledFunctionEvent");
    expect(helper).toContain('category: "scheduled_workflow"');
    expect(helper).toContain('source: "edge_function"');
    expect(helper).toContain("SENSITIVE_KEY_PATTERN");
    expect(helper).toContain("scrubMetadata");

    for (const fn of SCHEDULED_FUNCTIONS) {
      const source = readSource(`supabase/functions/${fn}/index.ts`);
      expect(source).toContain("../_shared/scheduledObservability.ts");
      expect(source).toContain("getCronAuthResult(req, CRON_SECRET)");
      expect(source).toContain("recordScheduledFunctionEvent(admin");
      expect(source).toContain(`surface: "${fn}"`);
      expect(source).toContain('reason: "cron_secret_not_configured"');
      expect(source).toContain('reason: "unauthorized_cron_invocation"');
      expect(source).toContain('reason: "unexpected_function_failure"');
    }
  });

  it("records provider and per-account failures for outbound scheduled senders", () => {
    const reminderSource = readSource("supabase/functions/send-reminder-emails/index.ts");
    const smsSource = readSource("supabase/functions/send-sms-notifications/index.ts");

    expect(reminderSource).toContain('reason: "account_processing_failed"');
    expect(reminderSource).toContain('reason: "provider_not_configured"');
    expect(reminderSource).toContain('reason: "provider_send_failed"');
    expect(reminderSource).toContain('code: "resend_not_configured"');
    expect(reminderSource).toContain("outbound_email_events");

    expect(smsSource).toContain('reason: "account_processing_failed"');
    expect(smsSource).toContain('reason: "provider_not_configured"');
    expect(smsSource).toContain('reason: "provider_send_failed"');
    expect(smsSource).toContain('code: "twilio_not_configured"');
    expect(smsSource).toContain("outbound_sms_events");
  });

  it("keeps scheduled cleanup functions visible without turning normal cleanup into denied events", () => {
    const auditCleanupSource = readSource("supabase/functions/cleanup-security-audit-exports/index.ts");
    const observabilityCleanupSource = readSource("supabase/functions/cleanup-security-observability-events/index.ts");

    expect(auditCleanupSource).toContain('kind: "workflow_signal"');
    expect(auditCleanupSource).toContain('outcome: "recorded"');
    expect(auditCleanupSource).toContain('reason: dryRun ? "expired_exports_detected" : "expired_exports_cleaned"');

    expect(observabilityCleanupSource).toContain('kind: "workflow_signal"');
    expect(observabilityCleanupSource).toContain('outcome: "recorded"');
    expect(observabilityCleanupSource).toContain('reason: "expired_observability_rows_detected"');
    expect(observabilityCleanupSource).toContain('reason: "expired_observability_rows_cleaned"');
  });
});
