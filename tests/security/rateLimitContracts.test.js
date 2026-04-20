import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("API rate limit contracts", () => {
  it("keeps SQL rate-limit primitives in bootstrap/apply/verify order", () => {
    const sql = readSource("supabase/api_rate_limits.sql");
    const bootstrap = readSource("scripts/dbBootstrap.js");
    const applyRepo = readSource("scripts/dbApplyRepoSql.js");
    const verify = readSource("scripts/dbVerify.js");

    expect(sql).toContain("create table if not exists public.api_rate_limit_events");
    expect(sql).toContain("create or replace function public.record_api_rate_limit_attempt");
    expect(sql).toContain("security_observability_events");
    expect(sql).toContain("'rate_limit_exceeded'");
    expect(sql).toContain("grant execute on function public.record_api_rate_limit_attempt");
    expect(bootstrap).toContain("api_rate_limits.sql");
    expect(applyRepo).toContain('"api_rate_limits.sql"');
    expect(verify).toContain("API rate-limit table");
    expect(verify).toContain("API rate-limit RPC");
  });

  it("protects externally visible Edge Functions through the shared limiter helper", () => {
    const helper = readSource("supabase/functions/_shared/rateLimit.ts");
    const inviteFn = readSource("supabase/functions/invite-user/index.ts");
    const resetFn = readSource("supabase/functions/send-password-reset-email/index.ts");
    const reminderFn = readSource("supabase/functions/send-reminder-emails/index.ts");
    const smsFn = readSource("supabase/functions/send-sms-notifications/index.ts");
    const sinkFn = readSource("supabase/functions/ingest-security-observability/index.ts");

    expect(helper).toContain("record_api_rate_limit_attempt");
    expect(helper).toContain("Too many attempts. Please try again later.");
    expect(helper).toContain("crypto.subtle.digest");

    expect(inviteFn).toContain('surface: "invite-user:account"');
    expect(inviteFn).toContain('surface: "invite-user:email"');
    expect(resetFn).toContain('surface: "send-password-reset-email:ip"');
    expect(resetFn).toContain('surface: "send-password-reset-email:email"');
    expect(reminderFn).toContain('surface: "send-reminder-emails:account"');
    expect(smsFn).toContain('surface: "send-sms-notifications:account"');
    expect(smsFn).toContain('surface: "send-sms-notifications:phone"');
    expect(sinkFn).toContain('surface: "ingest-security-observability"');

    for (const source of [inviteFn, resetFn, reminderFn, smsFn, sinkFn]) {
      expect(source).toContain("recordRateLimitAttempt");
      expect(source).toContain("buildRateLimitBody");
      expect(source).toContain("429");
    }
  });

  it("adds perimeter-style throttling and observability metadata to password reset", () => {
    const resetFn = readSource("supabase/functions/send-password-reset-email/index.ts");

    expect(resetFn).toContain("function getRequestIp");
    expect(resetFn).toContain('req.headers.get("cf-connecting-ip")');
    expect(resetFn).toContain('req.headers.get("x-real-ip")');
    expect(resetFn).toContain('req.headers.get("x-forwarded-for")?.split(",")[0]');
    expect(resetFn).toContain('surface: "send-password-reset-email:ip"');
    expect(resetFn).toContain("windowSeconds: 900");
    expect(resetFn).toContain("maxAttempts: 30");
    expect(resetFn).toContain('limit_scope: "request_ip"');
    expect(resetFn).toContain('flow: "password_reset"');
    expect(resetFn).toContain("trusted_origin_required: true");
    expect(resetFn).toContain("const correlationId = crypto.randomUUID()");
  });
});
