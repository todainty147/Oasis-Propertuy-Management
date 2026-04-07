import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("custom roles SQL contracts", () => {
  it("keeps the custom roles overlay in bootstrap and repo replay order", () => {
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(bootstrapSource).toContain("custom_staff_roles.sql");
    expect(applySource).toContain('"custom_staff_roles.sql"');
  });

  it("defines additive custom role tables without changing account_members yet", () => {
    const sql = readSource("supabase/custom_staff_roles.sql");

    expect(sql).toContain("create table if not exists public.roles");
    expect(sql).toContain("create table if not exists public.role_permissions");
    expect(sql).not.toContain("alter table public.account_members");
  });

  it("adds nullable account_members.role_id with safe backfill wiring", () => {
    const sql = readSource("supabase/custom_staff_roles_membership.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("add column if not exists role_id uuid");
    expect(sql).toContain("foreign key (role_id)");
    expect(sql).toContain("update public.account_members am");
    expect(sql).toContain("create or replace function public.sync_account_member_role_id()");
    expect(sql).toContain("create trigger trg_sync_account_member_role_id");
    expect(bootstrapSource).toContain("custom_staff_roles_membership.sql");
    expect(applySource).toContain('"custom_staff_roles_membership.sql"');
  });

  it("seeds default owner/admin/staff roles for every account", () => {
    const sql = readSource("supabase/custom_staff_roles_seed.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.ensure_default_system_account_roles(");
    expect(sql).toContain("perform public.ensure_system_account_role(p_account_id, 'owner'::public.account_role);");
    expect(sql).toContain("perform public.ensure_system_account_role(p_account_id, 'admin'::public.account_role);");
    expect(sql).toContain("perform public.ensure_system_account_role(p_account_id, 'staff'::public.account_role);");
    expect(sql).toContain("create trigger trg_seed_default_account_roles");
    expect(bootstrapSource).toContain("custom_staff_roles_seed.sql");
    expect(applySource).toContain('"custom_staff_roles_seed.sql"');
  });

  it("adds compatibility helpers for effective role and permission resolution", () => {
    const sql = readSource("supabase/custom_staff_roles_helpers.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.account_member_role_id_for(");
    expect(sql).toContain("create or replace function public.account_member_effective_role(");
    expect(sql).toContain("create or replace function public.account_member_has_permission(");
    expect(sql).toContain("v_role_id := public.account_member_role_id_for");
    expect(sql).toContain("v_effective_role := public.account_member_effective_role");
    expect(bootstrapSource).toContain("custom_staff_roles_helpers.sql");
    expect(applySource).toContain('"custom_staff_roles_helpers.sql"');
  });

  it("adds an rpc for resolving effective permission keys from role_permissions", () => {
    const sql = readSource("supabase/account_member_permission_keys.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.account_member_permission_keys(");
    expect(sql).toContain("from public.role_permissions rp");
    expect(sql).toContain("v_effective_role := public.account_member_effective_role");
    expect(bootstrapSource).toContain("account_member_permission_keys.sql");
    expect(applySource).toContain('"account_member_permission_keys.sql"');
  });

  it("adds management RPCs for listing, creating, editing, and assigning custom roles", () => {
    const sql = readSource("supabase/custom_staff_roles_management.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.list_account_roles(");
    expect(sql).toContain("create or replace function public.create_account_role(");
    expect(sql).toContain("create or replace function public.update_account_role_permissions(");
    expect(sql).toContain("create or replace function public.assign_account_member_role_id(");
    expect(sql).toContain("create or replace function public.list_account_members_for_role_assignment(");
    expect(sql).toContain("public.assert_manage_account_access(p_account_id)");
    expect(bootstrapSource).toContain("custom_staff_roles_management.sql");
    expect(applySource).toContain('"custom_staff_roles_management.sql"');
  });

  it("keeps custom role names from replacing the effective legacy role contract", () => {
    const sql = readSource("supabase/custom_staff_roles_helpers.sql");

    expect(sql).toContain("in ('owner', 'admin', 'staff', 'tenant', 'contractor')");
    expect(sql).toContain("else null");
    expect(sql).toContain("lower(am.role::text)");
  });

  it("replays shared account-role helper overrides after the custom-role helpers", () => {
    const sql = readSource("supabase/account_role_compatibility_helpers.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.has_account_role");
    expect(sql).toContain("public.account_member_effective_role(p_account_id, auth.uid())");
    expect(sql).toContain("create or replace function public.is_account_manager(p_account_id uuid)");
    expect(sql).toContain("create or replace function public.is_account_manager(p_account_id uuid, p_user_id uuid)");
    expect(sql).toContain("create or replace function public.is_account_owner_or_staff");
    expect(bootstrapSource).toContain("account_role_compatibility_helpers.sql");
    expect(applySource).toContain('"account_role_compatibility_helpers.sql"');
  });

  it("keeps account_member_set_role syncing legacy role and role_id together", () => {
    const sql = readSource("supabase/account_invitations_saas.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("v_new_role_id := public.ensure_system_account_role(p_account_id, v_new_member_role);");
    expect(sql).toContain("set role = v_new_member_role,");
    expect(sql).toContain("role_id = v_new_role_id");

    expect(baseline).toContain("v_new_role_id := public.ensure_system_account_role(p_account_id, v_new_member_role);");
    expect(baseline).toContain("set role = v_new_member_role,");
    expect(baseline).toContain("role_id = v_new_role_id");
  });

  it("routes invite authorization through account_member_effective_role", () => {
    const sql = readSource("supabase/account_invitations_saas.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("v_inviter_role := public.account_member_effective_role(p_account_id, auth.uid());");
    expect(baseline).toContain("v_inviter_role := public.account_member_effective_role(p_account_id, auth.uid());");
  });

  it("routes invite eligibility checks through account_member_effective_role", () => {
    const sql = readSource("supabase/account_invitations_saas.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("v_member_role := public.account_member_effective_role(p_account_id, v_uid);");
    expect(baseline).toContain("v_member_role := public.account_member_effective_role(p_account_id, v_uid);");
  });

  it("routes user_can_manage_account through account_member_effective_role", () => {
    const sql = readSource("supabase/account_branding.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("or public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'admin', 'staff')");
    expect(baseline).toContain("or public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'admin', 'staff')");
  });

  it("overrides account_role_for to use account_member_effective_role", () => {
    const sql = readSource("supabase/account_role_for_custom_roles.sql");
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(sql).toContain("create or replace function public.account_role_for(");
    expect(sql).toContain("select public.account_member_effective_role(p_account_id, auth.uid());");
    expect(bootstrapSource).toContain("account_role_for_custom_roles.sql");
    expect(applySource).toContain('"account_role_for_custom_roles.sql"');
  });

  it("routes document storage policies through compatibility helpers", () => {
    const sql = readSource("supabase/storage_documents_policies.sql");

    expect(sql).toContain("public.account_member_effective_role(d.account_id, auth.uid()) = any (array['owner','admin'])");
    expect(sql).toContain("public.account_member_effective_role(d.account_id, auth.uid()) = 'staff'");
    expect(sql).toContain("public.account_member_has_permission(");
    expect(sql).toContain("'documents.upload'");
    expect(sql).toContain("public.account_member_effective_role(split_part(name, '/', 1)::uuid, auth.uid()) = any (array['owner','admin'])");
  });

  it("routes billing read policies through user_can_manage_account", () => {
    const sql = readSource("supabase/20260315_billing.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(billing_customers.account_id)");
    expect(sql).toContain("public.user_can_manage_account(billing_subscriptions.account_id)");
    expect(baseline).toContain("CREATE POLICY billing_customers_select_managers ON public.billing_customers FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY billing_subscriptions_select_managers ON public.billing_subscriptions FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
  });

  it("routes account report settings manager writes through user_can_manage_account", () => {
    const sql = readSource("supabase/account_report_settings.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(account_report_settings.account_id)");
    expect(baseline).toContain("CREATE POLICY account_report_settings_upsert_managers ON public.account_report_settings TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes compliance document link policies through user_can_manage_account", () => {
    const sql = readSource("supabase/compliance_document_links.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(compliance_document_links.account_id)");
    expect(baseline).toContain("CREATE POLICY compliance_document_links_select_managers ON public.compliance_document_links FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY compliance_document_links_write_managers ON public.compliance_document_links TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes contractor rating manager writes through user_can_manage_account", () => {
    const sql = readSource("supabase/contractor_ratings.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(contractor_ratings.account_id)");
    expect(baseline).toContain("CREATE POLICY contractor_ratings_upsert_managers ON public.contractor_ratings TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes security anomaly actor role lookup through account_member_effective_role", () => {
    const sql = readSource("supabase/security_audit_settings.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("v_actor_member_role := public.account_member_effective_role(new.account_id, new.actor_user_id);");
    expect(baseline).toContain("v_actor_member_role := public.account_member_effective_role(new.account_id, new.actor_user_id);");
  });

  it("routes security anomaly alert actor role classification through account_member_effective_role", () => {
    const sql = readSource("supabase/security_anomaly_alerts.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("select public.account_member_effective_role(new.account_id, new.actor_user_id)");
    expect(baseline).toContain("v_actor_member_role := public.account_member_effective_role(new.account_id, new.actor_user_id);");
  });

  it("routes security anomaly alert assignee validation through account_member_effective_role", () => {
    const sql = readSource("supabase/security_anomaly_alert_workflow.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("select public.account_member_effective_role(v_alert.account_id, p_assigned_to_user_id)");
    expect(baseline).toContain("v_assignee_role := public.account_member_effective_role(v_alert.account_id, p_assigned_to_user_id);");
  });

  it("routes invite-acceptance security logging role checks through account_member_effective_role", () => {
    const sql = readSource("supabase/log_security_event.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("where public.account_member_effective_role(p_account_id, v_actor_user_id)");
    expect(baseline).toContain("where public.account_member_effective_role(p_account_id, v_actor_user_id)");
  });

  it("routes lease manager policies through user_can_manage_account while preserving tenant read scope", () => {
    const sql = readSource("supabase/leases.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(leases.account_id)");
    expect(sql).toContain("from public.tenants t");
    expect(baseline).toContain("CREATE POLICY leases_delete_account_members ON public.leases FOR DELETE TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY leases_insert_account_members ON public.leases FOR INSERT TO authenticated WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY leases_update_account_members ON public.leases FOR UPDATE TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY leases_select_account_members ON public.leases FOR SELECT TO authenticated USING ((public.user_can_manage_account(account_id) OR (EXISTS ( SELECT 1");
  });

  it("routes preventive maintenance manager write policies through user_can_manage_account", () => {
    const sql = readSource("supabase/preventive_maintenance.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(preventive_maintenance_tasks.account_id)");
    expect(sql).toContain("from public.account_members am");
    expect(baseline).toContain("CREATE POLICY preventive_maintenance_tasks_delete_managers ON public.preventive_maintenance_tasks FOR DELETE TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY preventive_maintenance_tasks_insert_managers ON public.preventive_maintenance_tasks FOR INSERT TO authenticated WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY preventive_maintenance_tasks_update_managers ON public.preventive_maintenance_tasks FOR UPDATE TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes maintenance expense and budget manager policies through user_can_manage_account", () => {
    const sql = readSource("supabase/maintenance_expense_facts.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(maintenance_expenses.account_id)");
    expect(sql).toContain("public.user_can_manage_account(maintenance_budgets.account_id)");
    expect(baseline).toContain("CREATE POLICY maintenance_expenses_select_managers ON public.maintenance_expenses FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY maintenance_expenses_write_managers ON public.maintenance_expenses TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY maintenance_budgets_select_managers ON public.maintenance_budgets FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY maintenance_budgets_write_managers ON public.maintenance_budgets TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes operations foundations manager policies through user_can_manage_account", () => {
    const sql = readSource("supabase/operations_foundations.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("public.user_can_manage_account(property_financial_profiles.account_id)");
    expect(sql).toContain("public.user_can_manage_account(property_operating_expenses.account_id)");
    expect(sql).toContain("public.user_can_manage_account(compliance_items.account_id)");
    expect(sql).toContain("public.user_can_manage_account(payment_events.account_id)");
    expect(sql).toContain("public.user_can_manage_account(automation_execution_log.account_id)");
    expect(baseline).toContain("CREATE POLICY property_financial_profiles_select_managers ON public.property_financial_profiles FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY property_financial_profiles_write_managers ON public.property_financial_profiles TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY property_operating_expenses_select_managers ON public.property_operating_expenses FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY property_operating_expenses_write_managers ON public.property_operating_expenses TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY compliance_items_select_managers ON public.compliance_items FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY compliance_items_write_managers ON public.compliance_items TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY payment_events_select_managers ON public.payment_events FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY automation_execution_log_select_managers ON public.automation_execution_log FOR SELECT TO authenticated USING (public.user_can_manage_account(account_id));");
    expect(baseline).toContain("CREATE POLICY automation_execution_log_write_managers ON public.automation_execution_log TO authenticated USING (public.user_can_manage_account(account_id)) WITH CHECK (public.user_can_manage_account(account_id));");
  });

  it("routes self-serve landlord signup and owner-contact lookups through account_member_effective_role", () => {
    const signupSql = readSource("supabase/self_serve_landlord_signup.sql");
    const ownerContactSql = readSource("supabase/account_owner_contact.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(signupSql).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
    expect(signupSql).toContain("public.account_member_effective_role(am.account_id, am.user_id) <> 'owner'");
    expect(ownerContactSql).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
    expect(baseline).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
    expect(baseline).toContain("public.account_member_effective_role(am.account_id, am.user_id) <> 'owner'");
  });

  it("routes owner-email dedup cleanup through account_member_effective_role", () => {
    const sql = readSource("supabase/account_email_dedup_cleanup.sql");

    expect(sql).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
    expect(sql).not.toContain("lower(am.role::text) = 'owner'");
  });

  it("routes remaining invitation and root-account role reads through account_member_effective_role", () => {
    const sql = readSource("supabase/account_invitations_saas.sql");
    const baseline = readSource("supabase/baseline_schema.sql");

    expect(sql).toContain("v_root_member_role := public.account_member_effective_role(p_root_account_id, v_uid);");
    expect(sql).toContain("v_member_role := public.account_member_effective_role(p_root_account_id, v_uid);");
    expect(sql).toContain("v_current_role := public.account_member_effective_role(p_account_id, p_target_user_id);");
    expect(sql).toContain("v_previous_role := public.account_member_effective_role(v_inv.account_id, v_uid);");
    expect(sql).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
    expect(baseline).toContain("v_root_member_role := public.account_member_effective_role(p_root_account_id, v_uid);");
    expect(baseline).toContain("v_member_role := public.account_member_effective_role(p_root_account_id, v_uid);");
    expect(baseline).toContain("v_current_role := public.account_member_effective_role(p_account_id, p_target_user_id);");
    expect(baseline).toContain("v_previous_role := public.account_member_effective_role(v_inv.account_id, v_uid);");
    expect(baseline).toContain("public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
  });
});
