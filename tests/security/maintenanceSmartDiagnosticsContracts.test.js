import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Maintenance Smart Diagnostics contracts", () => {
  it("registers the SQL overlay in both database replay scripts", () => {
    expect(read("scripts/dbApplyRepoSql.js")).toContain('"maintenance_smart_diagnostics.sql"');
    expect(read("scripts/dbBootstrap.js")).toContain("maintenance_smart_diagnostics.sql");
  });

  it("declares early-access feature flags without adding plan entitlements", () => {
    const source = read("src/lib/entitlements.js");
    expect(source).toContain('MAINTENANCE_SMART_DIAGNOSTICS: "maintenance_smart_diagnostics"');
    expect(source).toContain('TENANT_MAINTENANCE_DIAGNOSTICS: "tenant_maintenance_diagnostics"');
    expect(source).toContain('MAINTENANCE_DEPOSIT_EVIDENCE_LINKING: "maintenance_deposit_evidence_linking"');
    expect(source).toContain('MAINTENANCE_ECO_UPGRADE_LINKING: "maintenance_eco_upgrade_linking"');

    const growthBlock = source.slice(source.indexOf("const GROWTH_FEATURES"), source.indexOf("const PRO_FEATURES"));
    expect(growthBlock).not.toContain("MAINTENANCE_SMART_DIAGNOSTICS");
    expect(growthBlock).not.toContain("TENANT_MAINTENANCE_DIAGNOSTICS");
  });

  it("creates link and audit tables with account enforcement and safe seeds", () => {
    const sql = read("supabase/maintenance_smart_diagnostics.sql");
    expect(sql).toContain("create table if not exists public.maintenance_diagnostic_links");
    expect(sql).toContain("create table if not exists public.maintenance_diagnostic_audit_events");
    expect(sql).toContain("enforce_maintenance_diagnostic_account");
    expect(sql).toContain("Maintenance request account mismatch");
    expect(sql).toContain("Linked maintenance request account mismatch");
    expect(sql).toContain("alter column session_id set not null");
    expect(sql).toContain("prevent_diagnostic_audit_mutation");
    expect(sql).toContain("Maintenance diagnostic audit events are immutable");
    expect(sql).toContain("revoke update, delete on public.maintenance_diagnostic_links from authenticated");
    expect(sql).toContain("tenant_maintenance_diagnostics");
    expect(sql).toContain("blocked_drain");
    expect(sql).toContain("door_window_lock");
    expect(sql).toContain("not a substitute");
  });

  it("wires tenant diagnostics and inbox summaries without automatic deduction or upgrade actions", () => {
    const tenantSection = read("src/components/MaintenanceRequestsSection.jsx");
    const inboxService = read("src/services/maintenanceInboxService.js");
    const card = read("src/components/maintenance-inbox/MaintenanceRequestCard.jsx");

    expect(tenantSection).toContain("ENTITLEMENT_FEATURES.TENANT_MAINTENANCE_DIAGNOSTICS");
    expect(tenantSection).toContain("Possible issue category");
    expect(tenantSection).toContain("These answers help your landlord review the issue.");
    expect(tenantSection).toContain("Landlord review required");
    expect(tenantSection).toContain("createMaintenanceDiagnosticForRequest");
    expect(inboxService).toContain("listDiagnosticsForMaintenanceRequests");
    expect(card).toContain("Diagnostic summary");
    expect(card).toContain("Completed steps");
    expect(card).toContain("Photos: review request attachments");
    expect(card).toContain("Possible deposit evidence");
    expect(card).toContain("Possible upgrade opportunity");
    expect(card).not.toMatch(/you are responsible|tenant is liable|deduct from deposit automatically|no contractor needed|no contractor required|this diagnosis confirms/i);
  });

  it("keeps service creation cleanup, caching, and audit event coverage in place", () => {
    const service = read("src/services/maintenanceDiagnosticsService.js");
    const card = read("src/components/maintenance-inbox/MaintenanceRequestCard.jsx");

    expect(service).toContain("diagnosticTemplateCache");
    expect(service).toContain(".from(\"maintenance_diagnostic_sessions\").delete()");
    expect(service).toContain('eventType: "session_started"');
    expect(service).toContain('eventType: "session_linked"');
    expect(service).toContain("deposit_evidence_flagged");
    expect(service).toContain("eco_upgrade_flagged");
    expect(service).toContain("compliance_review_flagged");
    expect(service).toContain("completed_steps_count");
    expect(card).toContain("{!expanded && <DiagnosticSummaryPanel");
  });

  it("keeps tenants limited to request links and avoids automatic landlord-only records", () => {
    const sql = read("supabase/maintenance_smart_diagnostics.sql");
    const service = read("src/services/maintenanceDiagnosticsService.js");

    expect(sql).toContain('"Tenants attach diagnostic request links only"');
    expect(sql).toContain("new.link_type = 'maintenance_request'");
    expect(sql).toContain("Linked maintenance request account mismatch");
    expect(service).toContain('link_type: "maintenance_request"');
    expect(service).not.toContain('link_type: "deposit_deduction"');
    expect(service).not.toContain('link_type: "eco_upgrade_plan_item"');
    expect(service).not.toContain('link_type: "compliance_item"');
  });
});
