import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function compact(sql) {
  return sql.toLowerCase().replace(/\s+/g, " ").trim();
}

const workOrderStorage = read("supabase/storage_work_order_attachments_policies.sql");
const maintenanceStorage = read("supabase/storage_maintenance_request_attachments_policies.sql");
const documentStorage = read("supabase/storage_documents_policies.sql");
const documentRequests = read("supabase/document_requests.sql");
const documentTemplates = read("supabase/document_templates.sql");
const documentAntivirus = read("supabase/document_antivirus_scanning.sql");
const securityAuditExports = read("supabase/security_audit_export_jobs.sql");
const accountBranding = read("supabase/account_branding.sql");
const accountEntitlements = read("supabase/account_entitlements.sql");
const grantMigration = read("supabase/migrations/20260616002000_storage_policy_helper_grants.sql");

const storagePolicySources = [
  workOrderStorage,
  maintenanceStorage,
  documentStorage,
  documentRequests,
  documentTemplates,
  documentAntivirus,
  securityAuditExports,
].join("\n");

const grantSources = [
  workOrderStorage,
  maintenanceStorage,
  documentStorage,
  documentRequests,
  documentTemplates,
  documentAntivirus,
  securityAuditExports,
  accountBranding,
  accountEntitlements,
  grantMigration,
].join("\n");

const helpers = [
  { name: "can_view_work_order_attachment", args: "uuid, uuid", callSource: workOrderStorage, grantSource: workOrderStorage },
  { name: "can_manage_work_order_attachment", args: "uuid, uuid", callSource: workOrderStorage, grantSource: workOrderStorage },
  { name: "can_view_maintenance_request_attachment", args: "uuid, uuid", callSource: maintenanceStorage, grantSource: maintenanceStorage },
  { name: "can_manage_maintenance_request_attachment", args: "uuid, uuid", callSource: maintenanceStorage, grantSource: maintenanceStorage },
  { name: "can_access_document_storage", args: "uuid, uuid", callSource: `${documentStorage}\n${documentRequests}`, grantSource: `${documentStorage}\n${documentRequests}` },
  { name: "can_insert_document_request_upload_storage", args: "uuid, uuid, uuid", callSource: documentRequests, grantSource: documentRequests },
  { name: "can_access_document_template_storage", args: "uuid, uuid", callSource: documentTemplates, grantSource: documentTemplates },
  { name: "can_insert_document_quarantine_storage", args: "text", callSource: documentAntivirus, grantSource: documentAntivirus },
  { name: "user_can_manage_account", args: "uuid", callSource: securityAuditExports, grantSource: accountBranding },
  { name: "account_has_feature", args: "uuid, text", callSource: securityAuditExports, grantSource: accountEntitlements },
  { name: "safe_uuid", args: "text", callSource: `${workOrderStorage}\n${maintenanceStorage}`, grantSource: workOrderStorage },
];

function escapedSignature({ name, args }) {
  const escapedArgs = args.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/, /g, "\\s*,\\s*");
  return `public\\.${name}\\s*\\(\\s*${escapedArgs}\\s*\\)`;
}

function hasAuthenticatedGrant(sql, helper) {
  return new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escapedSignature(helper)}\\s+to\\s+[^;]*\\bauthenticated\\b`, "i")
    .test(sql);
}

function hasAnonRevoke(sql, helper) {
  return new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${escapedSignature(helper)}\\s+from\\s+anon\\b`, "i")
    .test(sql);
}

function hasAnonGrant(sql, helper) {
  return new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escapedSignature(helper)}\\s+to\\s+[^;]*\\banon\\b`, "i")
    .test(sql);
}

describe("storage policy helper grants", () => {
  it("audits every helper called by storage.objects policies in this pass", () => {
    for (const helper of helpers) {
      expect(storagePolicySources).toContain(`public.${helper.name}`);
    }
  });

  it("grants authenticated execute for storage-policy-callable helpers", () => {
    for (const helper of helpers) {
      expect(hasAuthenticatedGrant(grantSources, helper), helper.name).toBe(true);
    }
  });

  it("explicitly revokes anon execute instead of relying on PUBLIC revocation", () => {
    for (const helper of helpers) {
      expect(hasAnonRevoke(grantMigration, helper), helper.name).toBe(true);
      expect(hasAnonGrant(grantMigration, helper), helper.name).toBe(false);
    }
  });

  it("does not rely only on the linter hardening migration for grant behavior", () => {
    expect(compact(grantMigration)).toContain("storage policy helper grants after security definer hardening");
    for (const helper of helpers) {
      expect(hasAuthenticatedGrant(helper.grantSource, helper), helper.name).toBe(true);
    }
  });

  it("work-order manage helper remains stricter than view helper", () => {
    const viewStart = workOrderStorage.indexOf("create or replace function public.can_view_work_order_attachment");
    const manageStart = workOrderStorage.indexOf("create or replace function public.can_manage_work_order_attachment");
    const policiesStart = workOrderStorage.indexOf("drop policy if exists");
    const viewBlock = workOrderStorage.slice(viewStart, manageStart);
    const manageBlock = workOrderStorage.slice(manageStart, policiesStart);

    expect(viewBlock).toContain("wo.contractor_user_id = auth.uid()");
    expect(manageBlock).not.toContain("contractor_user_id");
    expect(manageBlock).toContain("public.user_can_manage_account(wo.account_id)");
  });

  it("maintenance attachment uploads are limited to active request statuses", () => {
    const insertStart = maintenanceStorage.indexOf('CREATE POLICY "mr_attach_insert_tenant_or_member"');
    const deleteStart = maintenanceStorage.indexOf('CREATE POLICY "mr_attach_delete_tenant_or_member"');
    const insertPolicy = maintenanceStorage.slice(insertStart, deleteStart);

    expect(insertPolicy).toContain("lower(coalesce(mr.status, '')) IN ('open', 'in_progress', 'waiting')");
    expect(insertPolicy).not.toContain("<> 'closed'");
    expect(insertPolicy).not.toContain("'resolved'");
  });
});
