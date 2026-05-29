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
      "evidence_vault",
      "evidence_vault_pdf_export",
      "maintenance_diagnostics",
      "tenant_application_links",
      "applicant_prescreening_dashboard",
    ].forEach((flag) => expect(entitlements).toContain(flag));

    expect(routes).toContain("ENTITLEMENT_FEATURES.COMPLIANCE_SAFE");
    expect(routes).toContain("ENTITLEMENT_FEATURES.EVIDENCE_VAULT");
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
    expect(sql).toContain("right_to_rent_check");
    expect(sql).toContain("umowa_najmu_okazjonalnego");
    expect(sql).toContain("boiler_heating");
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
    expect(bootstrap).toContain('"legal_security_phase3.sql"');
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
    expect(service).toContain("report_locked");
    expect(service).toContain("report_archived");
    expect(page).toContain("Print / save PDF");
    expect(page).toContain("This report is locked. Editing is disabled to preserve the evidence record.");
  });

  it("keeps public application submission consent-based and public without auth shell", () => {
    const app = read("src/App.jsx");
    const publicPage = read("src/pages/applications/PublicApplicationPage.jsx");
    const scoring = read("src/lib/applicantScoring.js");

    expect(app).toContain('location.pathname.startsWith("/apply/")');
    expect(publicPage).toContain("consent_accepted");
    expect(publicPage).toContain("Your information will be shared");
    expect(scoring).not.toMatch(/credit score/i);
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
