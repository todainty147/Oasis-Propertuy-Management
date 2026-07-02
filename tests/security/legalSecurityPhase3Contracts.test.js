import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Phase 3 legal security contracts", () => {
  it("adds the required feature flags and gates app entry points", () => {
    const entitlements = read("src/lib/entitlements.js");
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");

    [
      "compliance_safe",
      "compliance_safe_uk",
      "compliance_safe_pl",
      "compliance_safe_tenant_acknowledgement",
      "compliance_safe_expiry_reminders",
      "risk_protection_suite",
      "evidence_vault",
      "evidence_vault_pdf_export",
      "evidence_vault_tenant_sharing",
      "evidence_vault_dispute_pack",
      "maintenance_diagnostics",
      "tenant_application_links",
      "applicant_prescreening_dashboard",
    ].forEach((flag) => expect(entitlements).toContain(flag));

    expect(routes).toContain("ENTITLEMENT_FEATURES.COMPLIANCE_SAFE");
    expect(routes).toContain("ENTITLEMENT_FEATURES.EVIDENCE_VAULT");
    expect(routes).toContain("ENTITLEMENT_FEATURES.EVIDENCE_VAULT_DISPUTE_PACK");
    expect(routes).toContain("ENTITLEMENT_FEATURES.TENANT_APPLICATION_LINKS");
    expect(sidebar).toContain('to="/compliance/safe"');
    expect(sidebar).toContain('to="/documents/evidence-vault"');
    expect(sidebar).toContain('to="/applications"');
  });

  it("keeps the additive SQL account-scoped and registered for repo DB apply", () => {
    const sql = read("supabase/legal_security_phase3.sql");
    const apply = read("scripts/dbApplyRepoSql.js");
    const bootstrap = read("scripts/dbBootstrap.js");

    [
      "compliance_templates",
      "tenancy_compliance_items",
      "inspection_reports",
      "inspection_audit_events",
      "maintenance_diagnostic_sessions",
      "property_application_links",
      "rental_application_events",
    ].forEach((table) => expect(sql).toContain(`public.${table}`));

    expect(sql).toMatch(/account_id uuid not null references public\.accounts\(id\) on delete cascade/);
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("public.submit_public_rental_application");
    expect(sql).toContain("public.create_inspection_report_with_rooms");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("jsonb_build_object('inspection_rooms'");
    expect(sql).toContain("p_room_items jsonb");
    expect(sql).toContain("archived_at timestamptz");
    expect(sql).toContain("grant execute on function public.create_inspection_report_with_rooms");
    expect(sql).toContain("v_score := greatest(0, least(100, v_score))");
    expect(sql).not.toContain("p_payload->>'score'");
    expect(sql).not.toContain("p_payload->'score_reasons'");
    expect(sql).toContain("drop function if exists public.submit_public_rental_application(text, jsonb)");
    expect(sql).toContain("returns table(application_id uuid, status text, submitted_at timestamptz)");
    expect(sql).toContain("idx_rental_applications_link_email_once");
    expect(sql).toContain("v_applicant_email !~*");
    expect(sql).toContain("Enter a valid email address");
    expect(sql).toContain("An application has already been submitted for this email address");
    expect(sql).toContain("Too many applications have been submitted for this link");
    expect(sql).toContain("v_consent_text in ('true','t','1','yes','y','on','accepted')");
    expect(sql).not.toContain("returns public.rental_applications");
    expect(sql).not.toContain("return v_app;");
    expect(sql).toContain("right_to_rent_check");
    expect(sql).toContain("umowa_najmu_okazjonalnego");
    expect(sql).toContain("boiler_heating");
    expect(sql).not.toContain("'boolean'");
    expect(sql).toContain("'yes_no'");
    [
      "no_hot_water",
      "damp_mould",
      "electrical_issue",
      "blocked_drain",
      "leak",
      "appliance_issue",
      "pest_issue",
      "lost_keys_security",
      "other",
    ].forEach((template) => expect(sql).toContain(`('${template}',`));
    expect(sql).toContain('"Members update diagnostic sessions"');
    expect(apply).toContain('"legal_security_phase3.sql"');
    expect(apply).toContain('"compliance_safe_phase2.sql"');
    expect(bootstrap).toContain('"legal_security_phase3.sql"');
    expect(bootstrap).toContain('"compliance_safe_phase2.sql"');
  });

  it("adds Compliance Safe Phase 2 acknowledgement, expiry and tenant portal hardening", () => {
    const sql = read("supabase/compliance_safe_phase2.sql");
    const service = read("src/services/legalSecurityService.js");
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    const tenantRoutes = read("src/routes/TenantRoutes.jsx");
    const tenantPage = read("src/pages/tenant/TenantComplianceDocumentsPage.jsx");
    const tenantLayout = read("src/layout/TenantPortalLayout.jsx");
    const docs = read("docs/features/compliance-safe.md");

    [
      "served_at",
      "evidence_source_type",
      "reminder_days_before",
      "marked_not_applicable_at",
      "needs_review_reason",
      "compliance_item_acknowledgements",
      "enforce_compliance_acknowledgement_tenant_update",
      "apply_compliance_acknowledgement_response",
      "acknowledged_by_tenant_at = coalesce(new.acknowledged_at, now())",
      "tenant_acknowledged",
      "tenant_disputed",
      "risk_protection_suite",
      "Tenant cannot edit landlord-controlled acknowledgement fields",
      "Tenants read assigned acknowledgement compliance items",
    ].forEach((needle) => expect(sql).toContain(needle));

    expect(service).toContain("requestComplianceTenantAcknowledgement");
    expect(service).toContain("respondToComplianceAcknowledgement");
    expect(service).toContain('if (payload.disputed && !comment)');
    expect(service).toContain('error?.code === "42P01"');
    expect(service).not.toContain('error?.code === "PGRST404"');
    expect(service).toContain("acknowledgement_revoked");
    expect(service).toContain("tenant clients never need direct write");
    expect(service).toContain("attachComplianceDocument");
    expect(service).toContain("linkComplianceInspectionReport");
    expect(page).toContain("Request tenant acknowledgement");
    expect(page).toContain("Tenant acknowledgement is disabled for this account.");
    expect(tenantRoutes).toContain('path="compliance-documents"');
    expect(tenantLayout).toContain("tenantPortal.shell.nav.complianceDocuments");
    expect(read("src/i18n/messages.js")).toContain('"tenantPortal.shell.nav.complianceDocuments": "Compliance Documents"');
    expect(tenantPage).toContain("I confirm that I have received/reviewed this document or compliance record. This acknowledgement does not replace legal advice.");
    expect(docs).toContain("Poland/Najem Okazjonalny checklist");

    const newCopy = `${sql}\n${service}\n${page}\n${tenantPage}\n${docs}`;
    expect(newCopy).not.toMatch(/legally guaranteed|eviction guaranteed|court-proof|guaranteed compliance|guaranteed possession/i);
  });

  it("keeps Compliance Safe acknowledgement application tied to status transitions only", () => {
    const sql = read("supabase/compliance_safe_phase2.sql");

    expect(sql).toContain("old.acknowledgement_status is not distinct from new.acknowledgement_status");
    expect(sql).toContain("after update of acknowledgement_status on public.compliance_item_acknowledgements");
    expect(sql).not.toContain("after update of acknowledgement_status, acknowledged_at, comment");
  });

  it("keeps Evidence Vault audit events accurate for item creation and default population", () => {
    const service = read("src/services/legalSecurityService.js");

    expect(service).toContain('"evidence_item_created"');
    expect(service).toContain('"default_evidence_items_populated"');
    expect(service).toContain("created_item_count");
    expect(service).not.toContain('writeInspectionAuditEvent(accountId, report.reportId, "room_created"');
    expect(service).not.toContain('writeInspectionAuditEvent(accountId, reportId, "room_created"');
  });

  it("reuses caller user ids for dispute pack create and export audit writes", () => {
    const service = read("src/services/legalSecurityService.js");
    const helperStart = service.indexOf("async function writeDepositDisputePackAuditEvent");
    const helperBlock = service.slice(helperStart, helperStart + 700);
    const createStart = service.indexOf("export async function createDepositDisputePack");
    const createBlock = service.slice(createStart, createStart + 1500);
    const addItemStart = service.indexOf("export async function addDepositDisputePackItem");
    const addItemBlock = service.slice(addItemStart, addItemStart + 1800);
    const updateItemStart = service.indexOf("export async function updateDepositDisputePackItem");
    const updateItemBlock = service.slice(updateItemStart, updateItemStart + 2600);
    const removeItemStart = service.indexOf("export async function removeDepositDisputePackItem");
    const removeItemBlock = service.slice(removeItemStart, removeItemStart + 1200);
    const statusStart = service.indexOf("export async function updateDepositDisputePackStatus");
    const statusBlock = service.slice(statusStart, statusStart + 1800);
    const exportStart = service.indexOf("export async function recordDepositDisputePackExport");
    const exportBlock = service.slice(exportStart, exportStart + 1400);

    expect(helperBlock).toContain("userId = undefined");
    expect(helperBlock).toContain("user_id: userId === undefined ? await getCurrentUserId() : userId");
    expect(createBlock).toContain("const userId = await getCurrentUserId();");
    expect(createBlock).toContain("created_by: userId");
    expect(createBlock).toContain("}, userId);");
    expect(exportBlock).toContain("const userId = await getCurrentUserId();");
    expect(exportBlock).toContain("generated_by: userId");
    expect(exportBlock).toContain("}, userId);");
    [addItemBlock, updateItemBlock, removeItemBlock, statusBlock].forEach((block) => {
      expect(block).toContain("const userId = await getCurrentUserId();");
      expect(block).toContain("userId");
    });
  });

  it("keeps Evidence Vault builder behaviour wired to templates, audit and print routes", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    const page = read("src/pages/documents/EvidenceVaultPage.jsx");
    const service = read("src/services/legalSecurityService.js");
    const templates = read("src/data/inspectionRoomTemplates.js");

    expect(routes).toContain('path="documents/evidence-vault/:reportId"');
    expect(routes).toContain('path="documents/evidence-vault/:reportId/print"');
    expect(templates).toContain("Fridge/freezer");
    expect(service).toContain("buildDefaultEvidenceItemsPayload");
    expect(service).toContain("inspection_audit_events");
    expect(service).toContain("lock_inspection_report");
    expect(service).toContain("report_archived");
    expect(page).toContain("Print / save PDF");
    expect(page).toContain("This report is locked. Editing is disabled to preserve the evidence record.");
    expect(page).toContain("const [previewState, setPreviewState] = useState");
    expect(page).toContain("previewState.documentId === documentId");
    expect(page).toContain("setPreviewState({ documentId, url: signedUrl, failed: false })");
    expect(page).toContain("if (report.id === selectedReportId)");
  });

  it("adds tenant sharing and deposit dispute pack overlays without unsafe legal wording", () => {
    const sql = `${read("supabase/evidence_vault_phase2.sql")}\n${read("supabase/evidence_vault_phase2_fixes.sql")}`;
    const apply = read("scripts/dbApplyRepoSql.js");
    const bootstrap = read("scripts/dbBootstrap.js");
    const service = read("src/services/legalSecurityService.js");
    const tenantRoutes = read("src/routes/TenantRoutes.jsx");
    const disputePage = read("src/pages/documents/DepositDisputePacksPage.jsx");
    const disputePrint = read("src/pages/documents/DepositDisputePackPrintPage.jsx");

    [
      "inspection_report_shares",
      "inspection_report_tenant_comments",
      "deposit_dispute_packs",
      "deposit_dispute_pack_items",
      "deposit_dispute_pack_exports",
      "deposit_dispute_pack_audit_events",
    ].forEach((table) => expect(sql).toContain(`public.${table}`));
    expect(sql).toContain("Tenants sign shared inspection reports");
    expect(sql).toContain('drop policy if exists "Tenants read assigned inspection reports"');
    expect(sql).toContain("Tenants read shared inspection reports");
    expect(sql).toContain("Managers manage deposit dispute packs");
    expect(sql).toContain("deposit_dispute_packs_tenancy_id_fkey");
    expect(sql).toContain("enforce_deposit_dispute_pack_child_account");
    expect(sql).toContain("Dispute pack child rows cannot be reassigned to a different pack");
    expect(sql).toContain("before insert on public.deposit_dispute_pack_exports");
    expect(sql).toContain("idx_deposit_dispute_pack_audit_events_pack");
    expect(sql).toContain("enforce_inspection_report_share_tenant_update");
    expect(sql).toContain("Tenant cannot change landlord-controlled share fields");
    expect(sql).toContain("Tenant signature must exist before marking share signed");
    expect(sql).toContain("Tenant dispute comment must exist before marking share disputed");
    expect(apply).toContain('"evidence_vault_phase2_fixes.sql"');
    expect(bootstrap).toContain("evidence_vault_phase2_fixes.sql");
    expect(service).toContain("shareInspectionReportWithTenant");
    expect(service).toContain("recordTenantInspectionSignature");
    expect(service).toContain("inspection_photos(id, document_id, caption, captured_at)");
    expect(service).not.toContain("storage_path, caption, captured_at))), inspection_signatures");
    expect(service).toContain("createDepositDisputePack");
    expect(service).toContain("assertDepositDisputePackOwned");
    expect(service).toContain("updateDepositDisputePackItem");
    expect(service).toContain("removeDepositDisputePackItem");
    expect(service).toContain("updateDepositDisputePackStatus");
    expect(service).toContain("A locked dispute pack can only be archived.");
    expect(service).toContain('"deduction_added"');
    expect(service).toContain('"evidence_added"');
    expect(service).toContain('"pack_exported"');
    expect(tenantRoutes).toContain('path="evidence-reports"');
    expect(disputePage).toContain("Deposit Dispute Packs");
    expect(disputePage).toContain("loadSeqRef");
    expect(disputePage).toContain("stillCurrent");
    expect(disputePage).toContain("return () => { cancelled = true; };");
    expect(disputePrint).toContain("organisational evidence record");
    expect(disputePrint).toContain("Check-in / check-out comparison");
    expect(disputePrint).toContain("Signatures and tenant response");

    const newCopy = `${sql}\n${service}\n${disputePage}\n${disputePrint}`;
    expect(newCopy).not.toMatch(/bulletproof|court-proof|legally guaranteed|guaranteed win|guaranteed deduction|legally binding pack/i);
  });

  it("keeps public application submission consent-based and public without auth shell", () => {
    const app = read("src/App.jsx");
    const publicPage = read("src/pages/applications/PublicApplicationPage.jsx");
    const scoring = read("src/lib/applicantScoring.js");
    const tenantEvidencePage = read("src/pages/tenant/TenantEvidenceReportsPage.jsx");
    const tenantCompliancePage = read("src/pages/tenant/TenantComplianceDocumentsPage.jsx");

    expect(app).toContain('location.pathname.startsWith("/apply/")');
    expect(publicPage).toContain("consent_accepted");
    expect(publicPage).toContain("Your information will be shared");
    expect(scoring).not.toMatch(/credit score/i);
    const viewedIndex = tenantEvidencePage.indexOf("markTenantInspectionReportViewed(activeAccountId, nextSelected.id)");
    expect(viewedIndex).toBeGreaterThan(tenantEvidencePage.indexOf("if (cancelled) return;"));
    expect(tenantCompliancePage).toContain('if (disputed && !comment.trim())');
    expect(tenantCompliancePage).toContain("Add a comment before submitting a question or dispute.");
  });

  it("adds the marketing risk page and avoids launch-blocked legal overclaims in new surfaces", () => {
    const page = read("marketing-site/app/property-risk-protection-software/page.tsx");
    const blog = read("marketing-site/content/blog.ts");

    expect(page).toContain("Property Risk Protection Software for Landlords");
    expect(blog).toContain("documents-landlords-should-keep-before-tenancy-starts");
    expect(blog).toContain("najem-okazjonalny-checklist-polish-landlords");

    const newCopy = `${page}\n${blog}`;
    expect(newCopy).not.toMatch(/legally guaranteed|court-proof|bulletproof|eviction guaranteed/i);
  });
});
