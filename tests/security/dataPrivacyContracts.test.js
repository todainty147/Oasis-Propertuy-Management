import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const privacySql = read("supabase/data_retention_privacy.sql");
const managerRoutes = read("src/routes/ManagerRoutes.jsx");
const sidebar = read("src/layout/Sidebar.jsx");
const mobileNav = read("src/components/mobile/MobileBottomNav.jsx");
const app = read("src/App.jsx");
const dbApply = read("scripts/dbApplyRepoSql.js");
const publicPage = read("src/pages/PublicDataDeletionPage.jsx");
const inAppPage = read("src/pages/DataPrivacyPage.jsx");

describe("data privacy source contracts", () => {
  it("keeps privacy SQL in the database overlay sequence", () => {
    expect(dbApply).toContain('"data_retention_privacy.sql"');
    expect(dbApply.indexOf('"data_retention_privacy.sql"')).toBeGreaterThan(dbApply.indexOf('"operating_calendar.sql"'));
  });

  it("exposes both public app-store deletion URLs before the auth gate", () => {
    expect(app).toContain('location.pathname === "/privacy/delete-account"');
    expect(app).toContain('location.pathname === "/data-deletion"');
    expect(app.indexOf('location.pathname === "/privacy/delete-account"')).toBeLessThan(app.indexOf("if (!session) return <Login />"));
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
    expect(privacySql).not.toMatch(/grant\s+delete\s+on\s+table\s+public\.(payments|ledger_entries|security_audit_ledger|documents|maintenance_requests|work_orders)/i);
  });

  it("keeps client-visible processing logs restricted to privileged actors", () => {
    expect(privacySql).toContain("alter table public.data_deletion_processing_log enable row level security");
    expect(privacySql).toContain("data_deletion_processing_log_select_privileged");
    expect(privacySql).toContain("public.user_is_root_operator()");
    expect(privacySql).toContain("public.user_can_admin_account(account_id)");
    expect(privacySql).not.toContain("grant insert on table public.data_deletion_processing_log to authenticated");
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
});
