import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("database security hardening contracts", () => {
  it("keeps security anomaly alert writes authenticated and non-spoofable", () => {
    const baseSql = readSource("supabase/security_anomaly_alerts.sql");
    const workflowSql = readSource("supabase/security_anomaly_alert_workflow.sql");

    for (const sql of [baseSql, workflowSql]) {
      expect(sql).toContain("auth.role() is distinct from 'service_role'");
      expect(sql).toContain("raise exception 'Not authenticated' using errcode = '42501';");
      expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
      expect(sql).toContain("auth.role() is distinct from 'service_role' or v_dedupe_key = ''");
      expect(sql).toContain("revoke all on function public.upsert_security_anomaly_alert");
      expect(sql).toContain("from anon");
      expect(sql).toContain("to service_role");
    }
  });

  it("keeps invitation acceptance single-use under concurrency and uses opaque tokens", () => {
    const invitationSql = readSource("supabase/account_invitations_saas.sql");

    expect(invitationSql).toContain("v_token := encode(gen_random_bytes(32), 'hex');");
    expect(invitationSql).toContain("for update;");
    expect(invitationSql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(invitationSql).toContain("grant execute on function public.check_account_invitation_eligibility");
  });

  it("removes anonymous execution from self-service account creation", () => {
    const signupSql = readSource("supabase/self_serve_landlord_signup.sql");

    expect(signupSql).toContain(
      "revoke execute on function public.create_self_serve_landlord_account(text, boolean) from anon;",
    );
    expect(signupSql).toContain(
      "grant execute on function public.create_self_serve_landlord_account(text, boolean) to authenticated;",
    );
  });

  it("serializes rate-limit attempts and caps notification fan-out", () => {
    const rateLimitSql = readSource("supabase/api_rate_limits.sql");
    const notificationsSql = readSource("supabase/create_notifications.sql");

    expect(rateLimitSql).toContain("pg_advisory_xact_lock");
    expect(rateLimitSql).toContain("coalesce(p_account_id::text, 'global')");
    expect(notificationsSql).toContain("contractors_account_user_id_active_idx");
    expect(notificationsSql).toContain("tenants_account_user_id_idx");
    expect(notificationsSql).toContain("if v_recipient_count > 250 then");
    expect(notificationsSql).toContain("'recipient_count_exceeded'");
  });

  it("keeps SQL denied-event scrubbing aligned with app-side PII fields", () => {
    const deniedEventSql = readSource("supabase/security_denied_event_stream.sql");

    for (const key of [
      "fileName",
      "originalFilename",
      "storagePath",
      "firstName",
      "first_name",
      "lastName",
      "last_name",
      "phoneNumber",
      "phone_number",
      "contactPhone",
      "contact_phone",
      "propertyAddress",
      "property_address",
    ]) {
      expect(deniedEventSql).toContain(`- '${key}'`);
    }
  });

  it("keeps role lookup volatile so authorization checks are never planner-cached", () => {
    const roleSql = readSource("supabase/account_role_for_custom_roles.sql");

    expect(roleSql).toContain("language sql\nvolatile\nsecurity definer");
  });

  it("keeps DocuSeal webhook secrets out of URLs", () => {
    const webhookSource = readSource("supabase/functions/handle-signature-webhook/index.ts");
    const runbook = readSource("docs/runbooks/signature-provider-webhook-setup.md");

    expect(webhookSource).toContain('req.headers.get("x-docuseal-secret")');
    expect(webhookSource).not.toContain('searchParams.get("secret")');
    expect(runbook).toContain("X-Docuseal-Secret");
    expect(runbook).not.toContain("secret=<DOCUSEAL_WEBHOOK_SECRET>");
  });
});
