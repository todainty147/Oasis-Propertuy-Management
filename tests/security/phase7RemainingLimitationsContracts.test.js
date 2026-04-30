import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const phase7Sql        = read("supabase/compliance_hardening_phase7.sql");
const entitlementsSql  = read("supabase/account_entitlements.sql");
const aiCostSql        = read("supabase/ai_cost_controls.sql");
const phase0Sql        = read("supabase/compliance_suite_phase0.sql");
const taxReadinessSvc  = read("src/services/taxReadinessService.js");
const taxRecordsSvc    = read("src/services/taxRecordsService.js");
const rentShieldSvc    = read("src/services/rentShieldService.js");
const leaseAuditSvc    = read("src/services/leaseAuditService.js");
const rentShieldPage   = read("src/pages/compliance/RentShieldPage.jsx");
const messagesJs       = read("src/i18n/messages.js");
const limitationsDoc   = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");

// ─── L-001: SQL function consolidation ───────────────────────────────────────

describe("L-001: account_feature_required_plan consolidated into account_entitlements.sql", () => {
  it("account_entitlements.sql contains compliance feature keys", () => {
    expect(entitlementsSql).toContain("'tax_readiness_dashboard'");
    expect(entitlementsSql).toContain("'rent_shield'");
    expect(entitlementsSql).toContain("'ai_lease_auditor'");
  });

  it("account_entitlements.sql contains AI feature keys (not split)", () => {
    expect(entitlementsSql).toContain("'ai_maintenance_triage'");
    expect(entitlementsSql).toContain("'ai_contractor_recommendation'");
    expect(entitlementsSql).toContain("'ai_security_copilot'");
  });

  it("ai_cost_controls.sql no longer defines account_plan_rank or account_feature_required_plan", () => {
    expect(aiCostSql).not.toContain("create or replace function public.account_plan_rank(");
    expect(aiCostSql).not.toContain("create or replace function public.account_feature_required_plan(");
  });

  it("ai_cost_controls.sql has a comment pointing to the canonical file", () => {
    expect(aiCostSql).toContain("account_entitlements.sql");
  });

  it("compliance_suite_phase0.sql no longer defines account_feature_required_plan", () => {
    expect(phase0Sql).not.toContain("CREATE OR REPLACE FUNCTION public.account_feature_required_plan(");
  });

  it("compliance_suite_phase0.sql has a comment noting canonical location", () => {
    expect(phase0Sql).toContain("account_entitlements.sql");
  });
});

// ─── L-003/L-020: updated_at triggers ────────────────────────────────────────

describe("L-003/L-020: updated_at auto-triggers on compliance tables", () => {
  const tables = [
    "tax_records",
    "rent_shield_assessments",
    "lease_audits",
    "lease_audit_findings",
  ];

  for (const table of tables) {
    it(`trigger attached to ${table}`, () => {
      expect(phase7Sql).toContain(`before update on public.${table}`);
      expect(phase7Sql).toContain("tg_set_updated_at");
    });
  }
});

// ─── L-009: jurisdiction CHECK constraint ────────────────────────────────────

describe("L-009: jurisdiction validated server-side", () => {
  it("phase7 SQL adds CHECK constraint for jurisdiction on compliance_items", () => {
    expect(phase7Sql).toContain("compliance_items_jurisdiction_valid");
    expect(phase7Sql).toContain("'GB'");
    expect(phase7Sql).toContain("'PL'");
    expect(phase7Sql).toContain("'DE'");
  });

  it("allows NULL jurisdiction (non-tax items)", () => {
    const idx = phase7Sql.indexOf("compliance_items_jurisdiction_valid");
    const block = phase7Sql.slice(idx, idx + 150);
    expect(block).toContain("jurisdiction is null");
  });
});

// ─── L-010: compliance_audit_log and mark_as_filed logging ───────────────────

describe("L-010: compliance_audit_log table and mark_as_filed audit trail", () => {
  it("creates compliance_audit_log table", () => {
    expect(phase7Sql).toContain("create table if not exists public.compliance_audit_log");
  });

  it("compliance_audit_log has required columns", () => {
    const idx = phase7Sql.indexOf("create table if not exists public.compliance_audit_log");
    const block = phase7Sql.slice(idx, idx + 400);
    expect(block).toContain("account_id");
    expect(block).toContain("item_id");
    expect(block).toContain("action");
    expect(block).toContain("performed_by");
  });

  it("RLS enabled on compliance_audit_log", () => {
    expect(phase7Sql).toContain("enable row level security");
  });

  it("mark_tax_item_filed RPC inserts into compliance_audit_log", () => {
    const idx = phase7Sql.indexOf("create or replace function public.mark_tax_item_filed(");
    const end  = phase7Sql.indexOf("revoke all on function public.mark_tax_item_filed", idx);
    const block = phase7Sql.slice(idx, end);
    expect(block).toContain("insert into public.compliance_audit_log");
    expect(block).toContain("'mark_filed'");
    expect(block).toContain("auth.uid()");
  });

  it("audit insert comes before the UPDATE (recorded even if update fails)", () => {
    const idx = phase7Sql.indexOf("create or replace function public.mark_tax_item_filed(");
    const end  = phase7Sql.indexOf("revoke all on function public.mark_tax_item_filed", idx);
    const block = phase7Sql.slice(idx, end);
    const insertPos = block.indexOf("insert into public.compliance_audit_log");
    const updatePos = block.indexOf("update public.compliance_items");
    expect(insertPos).toBeLessThan(updatePos);
  });
});

// ─── L-021: Read RPCs defined in SQL ─────────────────────────────────────────

describe("L-021: read RPCs enforce plan entitlement", () => {
  const readRpcs = [
    { fn: "list_tax_items",               feature: "tax_readiness_dashboard" },
    { fn: "list_tax_records",             feature: "tax_readiness_dashboard" },
    { fn: "list_tax_exports",             feature: "tax_readiness_dashboard" },
    { fn: "list_rent_shield_assessments", feature: "rent_shield" },
    { fn: "list_lease_audits",            feature: "ai_lease_auditor" },
    { fn: "get_latest_lease_audit",       feature: "ai_lease_auditor" },
    { fn: "list_lease_audit_findings",    feature: "ai_lease_auditor" },
  ];

  for (const { fn, feature } of readRpcs) {
    it(`${fn} defined as SECURITY DEFINER`, () => {
      expect(phase7Sql).toContain(`create or replace function public.${fn}(`);
      const idx = phase7Sql.indexOf(`create or replace function public.${fn}(`);
      // Use a 500-char window to cover long parameter lists
      const block = phase7Sql.slice(idx, idx + 500);
      expect(block).toContain("security definer");
    });

    it(`${fn} calls assert_account_feature_access with '${feature}'`, () => {
      const idx = phase7Sql.indexOf(`create or replace function public.${fn}(`);
      const end = phase7Sql.indexOf(`revoke all on function public.${fn}`, idx);
      const block = phase7Sql.slice(idx, end);
      expect(block).toContain(`'${feature}'`);
      expect(block).toContain("assert_account_feature_access");
    });
  }
});

// ─── L-021: JS services call read RPCs ───────────────────────────────────────

describe("L-021: JS services call read RPCs instead of direct table reads", () => {
  it("listTaxItems calls rpc list_tax_items", () => {
    expect(taxReadinessSvc).toContain('.rpc("list_tax_items"');
  });

  it("listTaxRecords calls rpc list_tax_records", () => {
    expect(taxRecordsSvc).toContain('.rpc("list_tax_records"');
  });

  it("listTaxExports calls rpc list_tax_exports", () => {
    expect(taxRecordsSvc).toContain('.rpc("list_tax_exports"');
  });

  it("listRentShieldAssessments calls rpc list_rent_shield_assessments", () => {
    expect(rentShieldSvc).toContain('.rpc("list_rent_shield_assessments"');
  });

  it("listLeaseAudits calls rpc list_lease_audits", () => {
    expect(leaseAuditSvc).toContain('.rpc("list_lease_audits"');
  });

  it("getLatestLeaseAudit calls rpc get_latest_lease_audit", () => {
    expect(leaseAuditSvc).toContain('.rpc("get_latest_lease_audit"');
  });

  it("listLeaseAuditFindings calls rpc list_lease_audit_findings", () => {
    expect(leaseAuditSvc).toContain('.rpc("list_lease_audit_findings"');
  });

  it("listTaxItems no longer uses .from(compliance_items).select direct read", () => {
    const idx = taxReadinessSvc.indexOf("export async function listTaxItems");
    const end = taxReadinessSvc.indexOf("export async function createTaxItem");
    const block = taxReadinessSvc.slice(idx, end);
    expect(block).not.toContain('.from("compliance_items")');
  });

  it("listTaxRecords no longer uses .from(tax_records).select direct read", () => {
    const idx = taxRecordsSvc.indexOf("export async function listTaxRecords");
    const end = taxRecordsSvc.indexOf("export async function createTaxRecord");
    const block = taxRecordsSvc.slice(idx, end);
    expect(block).not.toContain('.from("tax_records")');
  });

  it("listLeaseAuditFindings no longer uses .from(lease_audit_findings) direct read", () => {
    const idx = leaseAuditSvc.indexOf("export async function listLeaseAuditFindings");
    const end = leaseAuditSvc.indexOf("export async function createLeaseAuditFinding");
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).not.toContain('.from("lease_audit_findings")');
  });
});

// ─── L-026: Recalculate all ───────────────────────────────────────────────────

describe("L-026: Recalculate all button in portfolio view", () => {
  it("RentShieldPage has recalculate-all-button testid", () => {
    expect(rentShieldPage).toContain('data-testid="recalculate-all-button"');
  });

  it("handleRecalculateAll iterates over all properties", () => {
    expect(rentShieldPage).toContain("async function handleRecalculateAll(");
    const idx = rentShieldPage.indexOf("async function handleRecalculateAll(");
    const block = rentShieldPage.slice(idx, idx + 400);
    expect(block).toContain("properties.length");
    expect(block).toContain("computeAndSaveAssessment(");
  });

  it("shows progress counter during recalculation", () => {
    expect(rentShieldPage).toContain("recalcAllProgress");
    expect(rentShieldPage).toContain("setRecalcAllProgress");
  });

  it("recalculateAll i18n key present in all 3 locales", () => {
    const regex = /"compliance\.rentShield\.recalculateAll"/g;
    const count = (messagesJs.match(regex) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── Limitations doc: Phase 7 entries ────────────────────────────────────────

describe("limitations doc: Phase 7 fixes and deferred items recorded", () => {
  const resolvedIds = ["L-001", "L-003", "L-009", "L-010", "L-020", "L-021", "L-026"];

  for (const id of resolvedIds) {
    it(`${id} in Resolved table`, () => {
      const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
      expect(resolvedSection).toContain(id);
    });
  }

  it("L-002 documented as deferred", () => {
    expect(limitationsDoc).toContain("L-002");
    expect(limitationsDoc).toContain("Deferred");
  });

  it("L-018 documented as deferred", () => {
    expect(limitationsDoc).toContain("L-018");
  });

  it("compliance_hardening_phase7.sql referenced in Phase 7 section", () => {
    expect(limitationsDoc).toContain("compliance_hardening_phase7.sql");
  });
});
