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
      expect(sql).toContain(
        "v_dedupe_key := v_alert_type || ':' || coalesce(p_actor_user_id::text, 'account') || ':' || coalesce(p_entity_id::text, 'na');",
      );
      expect(sql).not.toContain("auth.role() is distinct from 'service_role' or v_dedupe_key = ''");
      expect(sql).not.toContain("trim(coalesce(p_dedupe_key, ''))");
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

  it("exposes target account localization to root account switching", () => {
    const invitationSql = readSource("supabase/account_invitations_saas.sql");
    const baselineSql = readSource("supabase/baseline_schema.sql");

    for (const sql of [invitationSql, baselineSql]) {
      expect(sql).toContain("country_code");
      expect(sql).toContain("currency");
      expect(sql).toContain("language");
      expect(sql).toContain("a.country_code");
      expect(sql).toContain("a.currency");
      expect(sql).toContain("a.language");
    }
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

  it("keeps Supabase linter security remediations wired into repo SQL apply", () => {
    const applyScript = readSource("scripts/dbApplyRepoSql.js");
    const hardeningSql = readSource("supabase/supabase_linter_security_hardening.sql");
    const finalHardeningMigration = readSource("supabase/migrations/20260611003000_supabase_linter_final_hardening.sql");

    expect(applyScript).toContain('"supabase_linter_security_hardening.sql"');
    expect(applyScript).toContain('"hmrc_mtd_e1_uk_property_compliance.sql",\n  "provenance_events.sql",\n  "migrations/20260622000000_provenance_hash_chain_backfill.sql",\n  "provenance_finance_cutover.sql",\n  "provenance_explain_balance.sql",\n  "provenance_document_service.sql",\n  "evidence_provenance_stub.sql",\n  "supabase_linter_security_hardening.sql"');
    expect(hardeningSql).toContain(
      "alter view if exists public.work_orders_pending_cancellation set (security_invoker = true);",
    );
    expect(hardeningSql).toContain("select e.extrelocatable");
    expect(hardeningSql).toContain("execute 'alter extension pg_net set schema extensions';");
    expect(hardeningSql).toContain("does not support SET SCHEMA");
    expect(hardeningSql).toContain("alter function %s set search_path to public, auth, extensions");
    expect(hardeningSql).toContain("revoke execute on function %s from public");
    expect(hardeningSql).toContain("revoke execute on function %s from anon");
    expect(hardeningSql).toContain("'record_api_rate_limit_attempt'");
    expect(hardeningSql).toContain("'handle_new_user'");
    expect(hardeningSql).toContain("revoke execute on function %s from authenticated");
    expect(hardeningSql).toContain("grant execute on function %s to service_role");
    expect(hardeningSql).toContain(
      "grant execute on function public.record_auth_rate_limit_attempt(text, text) to anon;",
    );
    expect(hardeningSql).toContain(
      "grant execute on function public.submit_public_rental_application(text, jsonb) to anon;",
    );
    expect(hardeningSql).toContain("'edge_store_marketplace_job_trades'");
    expect(hardeningSql).toContain("'record_document_scan_result'");
    expect(finalHardeningMigration).toContain("alter function %s set search_path to public, auth, extensions");
    expect(finalHardeningMigration).toContain("revoke execute on function %s from public");
    expect(finalHardeningMigration).toContain("revoke execute on function %s from anon");
    expect(finalHardeningMigration).toContain(
      "grant execute on function public.record_auth_rate_limit_attempt(text, text) to anon;",
    );
    expect(finalHardeningMigration).toContain(
      "grant execute on function public.submit_public_rental_application(text, jsonb) to anon;",
    );
    expect(finalHardeningMigration).toContain("'edge_store_marketplace_job_trades'");
    expect(finalHardeningMigration).toContain("'record_document_scan_result'");
    expect(finalHardeningMigration).toContain("grant execute on function %s to service_role");
  });

  it("serializes rate-limit attempts and caps notification fan-out", () => {
    const rateLimitSql = readSource("supabase/api_rate_limits.sql");
    const notificationsSql = readSource("supabase/create_notifications.sql");
    const devicePushSql = readSource("supabase/device_push_tokens.sql");

    expect(rateLimitSql).toContain("pg_advisory_xact_lock");
    expect(rateLimitSql).toContain("coalesce(p_account_id::text, 'global')");
    expect(notificationsSql).toContain("contractors_account_user_id_active_idx");
    expect(notificationsSql).toContain("tenants_account_user_id_idx");
    expect(notificationsSql).toContain("if v_recipient_count > 250 then");
    expect(notificationsSql).toContain("'recipient_count_exceeded'");
    expect(devicePushSql).toContain("drop policy if exists \"device_push_tokens: user manages own\"");
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

  it("keeps billing event visibility scoped and direct billing writes denied", () => {
    const billingSql = readSource("supabase/20260315_billing.sql");
    const stripeWebhook = readSource("supabase/functions/stripe-webhook/index.ts");

    expect(billingSql).toContain(
      "add column if not exists account_id uuid references public.accounts(id) on delete set null;",
    );
    expect(billingSql).toContain("payload #>> '{data,object,metadata,account_id}'");
    expect(billingSql).toContain("payload #>> '{data,object,customer}' = bc.stripe_customer_id");
    expect(billingSql).toContain('create policy "billing_events_select_managers"');
    expect(billingSql).toContain("public.user_can_manage_account(billing_events.account_id)");
    for (const policy of [
      "billing_customers_no_direct_write",
      "billing_subscriptions_no_direct_write",
      "billing_events_no_direct_write",
    ]) {
      expect(billingSql).toContain(`"${policy}"`);
      expect(billingSql).toContain("using (false)");
      expect(billingSql).toContain("with check (false)");
    }
    expect(stripeWebhook).toContain("let resolvedAccountId: string | null = null;");
    expect(stripeWebhook).toContain("account_id: resolvedAccountId");
  });

  it("requires account authorization before completing preventive maintenance tasks", () => {
    const preventiveSql = readSource("supabase/preventive_maintenance.sql");
    const serviceSource = readSource("src/services/preventiveMaintenanceService.js");

    expect(preventiveSql).toContain(
      "drop function if exists public.complete_preventive_maintenance_task(uuid, timestamptz);",
    );
    expect(preventiveSql).toContain("p_account_id uuid");
    expect(preventiveSql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(preventiveSql).toContain("and account_id = p_account_id");
    expect(preventiveSql).toContain(
      "grant execute on function public.complete_preventive_maintenance_task(uuid, uuid, timestamptz) to authenticated;",
    );
    expect(serviceSource).toContain("p_account_id: accountId");
  });

  it("keeps tenant-scoped operational snapshots from using raw account scope", () => {
    const dashboardSql = readSource("supabase/dashboard_snapshot.sql");
    const hubSql = readSource("supabase/dashboard_hub_extras.sql");
    const portfolioSql = readSource("supabase/portfolio_attention_items.sql");

    for (const sql of [dashboardSql, hubSql, portfolioSql]) {
      expect(sql).toContain("tenant_auth as (");
      expect(sql).toContain("public.assert_tenant_scope_access(p_account_id, p_tenant_id)");
      expect(sql).toContain("public.assert_manage_account_access(p_account_id)");
      expect(sql).not.toContain("else p_account_id\n      end as account_id,\n      public.assert_tenant_scope_access");
    }

    expect(dashboardSql).toContain("where p.account_id = a.account_id");
    expect(dashboardSql).toContain("where r.account_id = a.account_id");
    expect(dashboardSql).toContain("where w.account_id = a.account_id");
    expect(hubSql).toContain("where t.account_id = a.account_id");
    expect(portfolioSql).toContain("left join properties pr on pr.id = p.property_id and pr.account_id = a.account_id");
    expect(portfolioSql).toContain("drop function if exists public.portfolio_attention_items(uuid, uuid, integer);");
    expect(portfolioSql).toContain("property_id uuid");
    expect(portfolioSql).toContain("op.property_id");
    expect(portfolioSql).toContain("dp.property_id");
  });

  it("keeps signature provider URLs HTTPS-only and sandbox status authenticated-only", () => {
    const signatureSql = readSource("supabase/document_signature_readiness.sql");
    const sandboxSql = readSource("supabase/account_sandbox_profiles.sql");

    expect(signatureSql).toContain("document_signature_provider_settings_base_url_https");
    expect(signatureSql).toContain("check (provider_base_url is null or provider_base_url ~* '^https://')");
    expect(signatureSql).toContain("Signature provider base URL must use HTTPS");
    expect(sandboxSql).toContain("revoke execute on function public.get_account_sandbox_status(uuid) from anon;");
    expect(sandboxSql).toContain("grant execute on function public.get_account_sandbox_status(uuid) to authenticated;");
  });

  it("documents maintenance expense fact internals as trigger-only helpers", () => {
    const maintenanceSql = readSource("supabase/maintenance_expense_facts.sql");

    expect(maintenanceSql).toContain("maintenance_expenses_work_order_idx");
    expect(maintenanceSql).toContain("tg_set_updated_at_maintenance_budgets");
    expect(maintenanceSql).toContain("execute function public.tg_set_updated_at_maintenance_budgets();");
    expect(maintenanceSql).toContain(
      "revoke all on function public.sync_work_order_expense_fact(uuid) from authenticated;",
    );
  });

  it("keeps third-pass account scoping guards on table mutations and detail queries", () => {
    const leaseService = readSource("src/services/leaseService.js");
    const tenantService = readSource("src/services/tenantService.js");
    const tenantHook = readSource("src/hooks/useTenants.js");
    const tenantDetails = readSource("src/pages/TenantDetails.jsx");
    const maintenanceService = readSource("src/services/maintenanceDashboardService.js");

    expect(leaseService).toContain('query = query.update(payload).eq("id", id).eq("account_id", accountId);');
    expect(leaseService).toContain('throw new Error("Lease end date must be on or after the start date")');
    expect(leaseService).toContain("parsed.toISOString().slice(0, 10) !== raw");

    expect(tenantService).toContain("export async function updateTenant(accountId, id, data)");
    expect(tenantService).toContain("export async function deleteTenant(accountId, id)");
    expect(tenantService).toContain('.eq("account_id", accountId)');
    expect(tenantHook).toContain("return updateTenantRecord(activeAccountId, id, payload);");
    expect(tenantHook).toContain("return deleteTenantRecord(activeAccountId, id);");
    expect(tenantDetails).toContain("await updateTenant(activeAccountId, tenant.id");

    expect(maintenanceService).toContain('.from("work_order_attachments")');
    expect(maintenanceService).toContain('.from("work_order_financials")');
    expect(maintenanceService).toContain('.eq("account_id", accountId)');
  });

  it("keeps third-pass SQL hardening for triggers, packet views, anomaly dedupe, and automation config", () => {
    const operationsSql = readSource("supabase/operations_foundations.sql");
    const documentPacketsSql = readSource("supabase/document_packets.sql");
    const anomalySql = readSource("supabase/security_anomaly_alerts.sql");
    const automationSql = readSource("supabase/automation_playbooks.sql");
    const auditWiringSql = readSource("supabase/security_audit_event_wiring.sql");

    expect(operationsSql).toContain(
      "create or replace function public.tg_capture_payment_events()\nreturns trigger\nlanguage plpgsql\nset search_path = public",
    );
    expect(documentPacketsSql).toContain("and account_id = v_packet.account_id");
    expect(anomalySql).toContain(
      "v_dedupe_key := v_alert_type || ':' || coalesce(p_actor_user_id::text, 'account') || ':' || coalesce(p_entity_id::text, 'na');",
    );
    expect(anomalySql).not.toContain("trim(coalesce(p_dedupe_key, ''))");
    expect(automationSql).toContain("automation_rule_settings_config_object_check");
    expect(automationSql).toContain("check (jsonb_typeof(config) = 'object')");
    expect(auditWiringSql).toContain("nullif(v_doc->>'account_id', '')::uuid");
  });
});
