import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const privacySql   = read("supabase/data_retention_privacy.sql");
const managerRoutes = read("src/routes/ManagerRoutes.jsx");
const sidebar       = read("src/layout/Sidebar.jsx");
const mobileNav     = read("src/components/mobile/MobileBottomNav.jsx");
const app           = read("src/App.jsx");
const dbApply       = read("scripts/dbApplyRepoSql.js");
const publicPage    = read("src/pages/PublicDataDeletionPage.jsx");
const inAppPage     = read("src/pages/DataPrivacyPage.jsx");
const service       = read("src/services/dataPrivacyService.js");

describe("data privacy source contracts", () => {
  it("keeps privacy SQL in the database overlay sequence", () => {
    expect(dbApply).toContain('"data_retention_privacy.sql"');
    expect(dbApply.indexOf('"data_retention_privacy.sql"')).toBeGreaterThan(
      dbApply.indexOf('"operating_calendar.sql"'),
    );
  });

  it("exposes both public app-store deletion URLs before the auth gate", () => {
    expect(app).toContain('location.pathname === "/privacy/delete-account"');
    expect(app).toContain('location.pathname === "/data-deletion"');
    expect(app.indexOf('location.pathname === "/privacy/delete-account"')).toBeLessThan(
      app.indexOf("if (!session) return <Login />"),
    );
  });

  it("wires in-app, mobile, and root review privacy routes", () => {
    expect(managerRoutes).toContain('path="settings/data-privacy"');
    expect(managerRoutes).toContain('path="root/data-requests"');
    expect(sidebar).toContain('to="/settings/data-privacy"');
    expect(sidebar).toContain('to="/root/data-requests"');
    expect(mobileNav).toContain('to="/settings/data-privacy"');
  });

  it("does not promise immediate hard deletion of operational records in user-facing copy", () => {
    expect(publicPage).toContain("some records may need to be retained or minimised");
    expect(publicPage).toContain("We do not promise immediate deletion of all operational records");
    expect(inAppPage).toContain("Some records may need to be retained");
    expect(inAppPage).toContain("finance, legal, tax, compliance, security, dispute, billing, and audit records");
  });

  it("protects direct operational deletion by only exposing request/process RPCs", () => {
    expect(privacySql).toContain("create or replace function public.submit_data_deletion_request");
    expect(privacySql).toContain("create or replace function public.process_data_deletion_request");
    expect(privacySql).toContain("if not (");
    expect(privacySql).toContain("public.user_is_root_operator()");
    expect(privacySql).toContain("public.user_can_admin_account");
    expect(privacySql).not.toMatch(
      /grant\s+delete\s+on\s+table\s+public\.(payments|ledger_entries|security_audit_ledger|documents|maintenance_requests|work_orders)/i,
    );
  });

  it("restricts process_data_deletion_request to root operator and service_role only", () => {
    // Extract just the process_data_deletion_request function body so we are not
    // accidentally matching the admin_update function's broader guard.
    const start = privacySql.indexOf("create or replace function public.process_data_deletion_request");
    const end   = privacySql.indexOf("$$;", start) + 3;
    const fn    = privacySql.slice(start, end);

    expect(fn).toContain("public.user_is_root_operator()");
    expect(fn).toContain("auth.role() = 'service_role'");
    // Account admins must NOT be able to trigger processing directly.
    expect(fn).not.toContain("public.user_can_admin_account");
    expect(fn).toContain(
      "Account admins may approve and schedule via admin_update_data_deletion_request",
    );
  });

  it("enforces state machine transitions in admin_update_data_deletion_request", () => {
    expect(privacySql).toContain("Invalid status transition from % to %");
    expect(privacySql).toContain("raise exception 'Invalid status transition from % to %'");
    // Spot-check a few transition rules are present in the guard.
    expect(privacySql).toContain("v_request.status = 'submitted'");
    expect(privacySql).toContain("v_request.status = 'partially_completed'");
  });

  it("prevents duplicate active deletion requests via submit guard", () => {
    expect(privacySql).toContain("An active % request already exists for this account and target");
    expect(privacySql).toContain(
      "status not in ('completed', 'partially_completed', 'rejected', 'cancelled')",
    );
  });

  it("keeps client-visible processing logs restricted to privileged actors", () => {
    expect(privacySql).toContain(
      "alter table public.data_deletion_processing_log enable row level security",
    );
    expect(privacySql).toContain("data_deletion_processing_log_select_privileged");
    expect(privacySql).toContain("public.user_is_root_operator()");
    expect(privacySql).toContain("public.user_can_admin_account(account_id)");
    expect(privacySql).not.toContain(
      "grant insert on table public.data_deletion_processing_log to authenticated",
    );
  });

  it("restricts mark_data_deletion_auth_user_deleted to service_role only", () => {
    expect(privacySql).toContain(
      "grant execute on function public.mark_data_deletion_auth_user_deleted(uuid, uuid) to service_role",
    );
    // Must NOT be granted to authenticated — it is a background-worker callback only.
    expect(privacySql).not.toContain(
      "grant execute on function public.mark_data_deletion_auth_user_deleted(uuid, uuid) to authenticated",
    );
  });

  it("fires records_anonymised audit event AFTER anonymise_user_profile is called", () => {
    const fn_start = privacySql.indexOf("create or replace function public.process_data_deletion_request");
    const fn_end   = privacySql.indexOf("$$;", fn_start) + 3;
    const fn       = privacySql.slice(fn_start, fn_end);

    const anonymisePos = fn.indexOf("v_count := public.anonymise_user_profile(v_target_user)");
    const auditPos     = fn.indexOf("'records_anonymised'");

    expect(anonymisePos).toBeGreaterThan(-1);
    expect(auditPos).toBeGreaterThan(-1);
    // The audit event must appear AFTER the anonymise call, not before.
    expect(auditPos).toBeGreaterThan(anonymisePos);
  });

  it("logs all required privacy/audit event names", () => {
    for (const eventName of [
      "data_deletion_requested",
      "data_export_requested",
      "data_export_completed",
      "data_deletion_identity_verification_required",
      "data_deletion_approved",
      "data_deletion_rejected",
      "data_deletion_scheduled",
      "data_deletion_completed",
      "data_deletion_partially_completed",
      "device_tokens_revoked",
      "auth_user_deleted",
      "records_anonymised",
      "records_retained_with_reason",
      "workspace_closure_requested",
      "workspace_closed",
    ]) {
      expect(privacySql).toContain(`'${eventName}'`);
    }
  });

  it("listMyDataDeletionRequests filters by current user ID explicitly", () => {
    expect(service).toContain("supabase.auth.getUser()");
    expect(service).toContain('.eq("requester_user_id", user?.id)');
  });

  it("listRootDataDeletionRequests uses range-based pagination instead of a hard limit", () => {
    expect(service).toContain(".range(from, from + pageSize - 1)");
    expect(service).not.toContain(".limit(200)");
    expect(service).toContain("return { data: data || [], count: count ?? 0 }");
  });

  it("RootDataRequestsPage destructures { data } from listRootDataDeletionRequests result", () => {
    const rootPage = read("src/pages/admin/RootDataRequestsPage.jsx");
    expect(rootPage).toContain("const { data } = await listRootDataDeletionRequests()");
    expect(rootPage).not.toMatch(/const data = await listRootDataDeletionRequests/);
  });

  it("DataPrivacyPage uses useSearchParams instead of window.location.search", () => {
    expect(inAppPage).toContain("useSearchParams");
    expect(inAppPage).not.toContain("window.location.search");
  });

  it("DataPrivacyPage guards workspace_closure URL param for non-admins", () => {
    expect(inAppPage).toContain(
      'if (requested === "workspace_closure" && !canRequestWorkspaceClosure) return "user_account_deletion"',
    );
  });
});
