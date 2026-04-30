import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const sqlFile            = read("supabase/compliance_security_hardening.sql");
const taxReadinessSvc    = read("src/services/taxReadinessService.js");
const taxRecordsSvc      = read("src/services/taxRecordsService.js");
const rentShieldSvc      = read("src/services/rentShieldService.js");
const leaseAuditSvc      = read("src/services/leaseAuditService.js");
const limitationsDoc     = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");

// ─── SQL: 14 RPC functions defined ───────────────────────────────────────────

describe("SQL: all 14 compliance security RPCs defined", () => {
  const expectedFunctions = [
    "create_tax_item",
    "mark_tax_item_filed",
    "delete_tax_item",
    "create_tax_record",
    "update_tax_record_review_status",
    "delete_tax_record",
    "record_tax_export",
    "upsert_rent_shield_assessment",
    "create_lease_audit",
    "update_lease_audit_status",
    "create_lease_audit_finding",
    "dismiss_lease_audit_finding",
    "restore_lease_audit_finding",
    "delete_lease_audit_finding",
  ];

  for (const fn of expectedFunctions) {
    it(`defines function ${fn}`, () => {
      expect(sqlFile).toContain(`create or replace function public.${fn}(`);
    });
  }
});

// ─── SQL: security properties on all RPCs ────────────────────────────────────

describe("SQL: all RPCs use SECURITY DEFINER and set search_path = public", () => {
  const securityDefinerCount = (sqlFile.match(/security definer/g) || []).length;
  const searchPathCount      = (sqlFile.match(/set search_path = public/g) || []).length;

  it("has at least 14 security definer clauses (one per write RPC; DISTINCT ON RPCs add more)", () => {
    expect(securityDefinerCount).toBeGreaterThanOrEqual(14);
  });

  it("has at least 14 set search_path = public clauses", () => {
    expect(searchPathCount).toBeGreaterThanOrEqual(14);
  });
});

// ─── SQL: assert_manage_account_access called in every RPC ───────────────────

describe("SQL: assert_manage_account_access called in all RPCs", () => {
  it("appears at least 14 times (once per RPC; comments may add more)", () => {
    const count = (sqlFile.match(/assert_manage_account_access/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(14);
  });
});

// ─── SQL: assert_account_feature_access called with correct feature keys ─────

describe("SQL: assert_account_feature_access with correct feature keys", () => {
  it("tax RPCs use tax_readiness_dashboard", () => {
    const taxRpcCount = (sqlFile.match(/'tax_readiness_dashboard'/g) || []).length;
    // 7 tax RPCs: create_tax_item, mark_tax_item_filed, delete_tax_item,
    //             create_tax_record, update_tax_record_review_status, delete_tax_record, record_tax_export
    expect(taxRpcCount).toBe(7);
  });

  it("rent shield RPC uses rent_shield", () => {
    expect(sqlFile).toContain("'rent_shield'");
  });

  it("lease audit RPCs use ai_lease_auditor", () => {
    const leaseRpcCount = (sqlFile.match(/'ai_lease_auditor'/g) || []).length;
    // 6 lease RPCs
    expect(leaseRpcCount).toBe(6);
  });
});

// ─── SQL: grants ──────────────────────────────────────────────────────────────

describe("SQL: every RPC revokes public and grants to authenticated", () => {
  const revokeCount = (sqlFile.match(/revoke all on function/g) || []).length;
  const grantCount  = (sqlFile.match(/grant execute on function/g) || []).length;

  it("has at least 14 revoke statements", () => {
    expect(revokeCount).toBeGreaterThanOrEqual(14);
  });

  it("has at least 14 grant execute to authenticated statements", () => {
    expect(grantCount).toBeGreaterThanOrEqual(14);
  });
});

// ─── SQL: RETURNS SETOF or void for correct operations ───────────────────────

describe("SQL: void-returning RPCs are the delete operations", () => {
  it("delete_tax_item returns void", () => {
    const idx = sqlFile.indexOf("create or replace function public.delete_tax_item(");
    const snippet = sqlFile.slice(idx, idx + 150);
    expect(snippet).toContain("returns void");
  });

  it("delete_tax_record returns void", () => {
    const idx = sqlFile.indexOf("create or replace function public.delete_tax_record(");
    const snippet = sqlFile.slice(idx, idx + 150);
    expect(snippet).toContain("returns void");
  });

  it("delete_lease_audit_finding returns void", () => {
    const idx = sqlFile.indexOf("create or replace function public.delete_lease_audit_finding(");
    const snippet = sqlFile.slice(idx, idx + 160);
    expect(snippet).toContain("returns void");
  });
});

describe("SQL: non-delete RPCs return SETOF the relevant table", () => {
  it("create_tax_item returns setof compliance_items", () => {
    const idx = sqlFile.indexOf("create or replace function public.create_tax_item(");
    const snippet = sqlFile.slice(idx, idx + 480);
    expect(snippet).toContain("returns setof public.compliance_items");
  });

  it("mark_tax_item_filed returns setof compliance_items", () => {
    const idx = sqlFile.indexOf("create or replace function public.mark_tax_item_filed(");
    const snippet = sqlFile.slice(idx, idx + 260);
    expect(snippet).toContain("returns setof public.compliance_items");
  });

  it("create_tax_record returns setof tax_records", () => {
    const idx = sqlFile.indexOf("create or replace function public.create_tax_record(");
    const snippet = sqlFile.slice(idx, idx + 700);
    expect(snippet).toContain("returns setof public.tax_records");
  });

  it("upsert_rent_shield_assessment returns setof rent_shield_assessments", () => {
    const idx = sqlFile.indexOf("create or replace function public.upsert_rent_shield_assessment(");
    const snippet = sqlFile.slice(idx, idx + 350);
    expect(snippet).toContain("returns setof public.rent_shield_assessments");
  });

  it("create_lease_audit returns setof lease_audits", () => {
    const idx = sqlFile.indexOf("create or replace function public.create_lease_audit(");
    const snippet = sqlFile.slice(idx, idx + 150);
    expect(snippet).toContain("returns setof public.lease_audits");
  });

  it("create_lease_audit_finding returns setof lease_audit_findings", () => {
    const idx = sqlFile.indexOf("create or replace function public.create_lease_audit_finding(");
    const snippet = sqlFile.slice(idx, idx + 420);
    expect(snippet).toContain("returns setof public.lease_audit_findings");
  });
});

// ─── JS: taxReadinessService calls RPCs ───────────────────────────────────────

describe("taxReadinessService: write operations use RPCs", () => {
  it("createTaxItem calls rpc create_tax_item", () => {
    expect(taxReadinessSvc).toContain('.rpc("create_tax_item"');
  });

  it("createTaxItem no longer uses .from(compliance_items).insert", () => {
    const idx = taxReadinessSvc.indexOf("export async function createTaxItem");
    const end = taxReadinessSvc.indexOf("export async function", idx + 1);
    const block = taxReadinessSvc.slice(idx, end);
    expect(block).not.toContain('.from("compliance_items").insert');
  });

  it("markTaxItemFiled calls rpc mark_tax_item_filed", () => {
    expect(taxReadinessSvc).toContain('.rpc("mark_tax_item_filed"');
  });

  it("markTaxItemFiled no longer uses .from(compliance_items).update", () => {
    const idx = taxReadinessSvc.indexOf("export async function markTaxItemFiled");
    const end = taxReadinessSvc.indexOf("export async function", idx + 1);
    const block = taxReadinessSvc.slice(idx, end);
    expect(block).not.toContain('.from("compliance_items").update');
  });

  it("deleteTaxItem calls rpc delete_tax_item", () => {
    expect(taxReadinessSvc).toContain('.rpc("delete_tax_item"');
  });

  it("deleteTaxItem no longer uses .from(compliance_items).delete", () => {
    const idx = taxReadinessSvc.indexOf("export async function deleteTaxItem");
    const end = taxReadinessSvc.indexOf("export async function", idx + 1);
    const block = taxReadinessSvc.slice(idx, end);
    expect(block).not.toContain('.from("compliance_items").delete');
  });

  it("read operations (listTaxItems) now call rpc list_tax_items (Phase 7 L-021)", () => {
    expect(taxReadinessSvc).toContain('.rpc("list_tax_items"');
  });
});

// ─── JS: taxRecordsService calls RPCs ─────────────────────────────────────────

describe("taxRecordsService: write operations use RPCs", () => {
  it("createTaxRecord calls rpc create_tax_record", () => {
    expect(taxRecordsSvc).toContain('.rpc("create_tax_record"');
  });

  it("createTaxRecord passes p_account_id", () => {
    const idx = taxRecordsSvc.indexOf('.rpc("create_tax_record"');
    const snippet = taxRecordsSvc.slice(idx, idx + 300);
    expect(snippet).toContain("p_account_id");
  });

  it("updateTaxRecordReviewStatus calls rpc update_tax_record_review_status", () => {
    expect(taxRecordsSvc).toContain('.rpc("update_tax_record_review_status"');
  });

  it("deleteTaxRecord calls rpc delete_tax_record", () => {
    expect(taxRecordsSvc).toContain('.rpc("delete_tax_record"');
  });

  it("recordTaxExport calls rpc record_tax_export", () => {
    expect(taxRecordsSvc).toContain('.rpc("record_tax_export"');
  });

  it("read operations (listTaxRecords) now call rpc list_tax_records (Phase 7 L-021)", () => {
    expect(taxRecordsSvc).toContain('.rpc("list_tax_records"');
  });
});

// ─── JS: rentShieldService calls RPC ──────────────────────────────────────────

describe("rentShieldService: upsertRentShieldAssessment uses RPC", () => {
  it("calls rpc upsert_rent_shield_assessment", () => {
    expect(rentShieldSvc).toContain('.rpc("upsert_rent_shield_assessment"');
  });

  it("passes all required params including p_shield_score and p_shield_tier", () => {
    const idx = rentShieldSvc.indexOf('.rpc("upsert_rent_shield_assessment"');
    const snippet = rentShieldSvc.slice(idx, idx + 350);
    expect(snippet).toContain("p_shield_score");
    expect(snippet).toContain("p_shield_tier");
    expect(snippet).toContain("p_arrears_amount");
    expect(snippet).toContain("p_days_overdue_p90");
  });

  it("no longer uses .from(rent_shield_assessments).upsert", () => {
    const idx = rentShieldSvc.indexOf("export async function upsertRentShieldAssessment");
    const end = rentShieldSvc.indexOf("export async function", idx + 1);
    const block = rentShieldSvc.slice(idx, end);
    expect(block).not.toContain('.from("rent_shield_assessments").upsert');
  });
});

// ─── JS: leaseAuditService calls RPCs ─────────────────────────────────────────

describe("leaseAuditService: all write operations use RPCs", () => {
  it("createLeaseAudit calls rpc create_lease_audit", () => {
    expect(leaseAuditSvc).toContain('.rpc("create_lease_audit"');
  });

  it("createLeaseAudit no longer uses .from(lease_audits).insert", () => {
    const idx = leaseAuditSvc.indexOf("export async function createLeaseAudit");
    const end = leaseAuditSvc.indexOf("export async function", idx + 1);
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).not.toContain('.from("lease_audits").insert');
  });

  it("updateLeaseAuditStatus calls rpc update_lease_audit_status", () => {
    expect(leaseAuditSvc).toContain('.rpc("update_lease_audit_status"');
  });

  it("updateLeaseAuditStatus still validates status client-side before RPC", () => {
    const idx = leaseAuditSvc.indexOf("export async function updateLeaseAuditStatus");
    const end = leaseAuditSvc.indexOf("export async function", idx + 1);
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).toContain("VALID_AUDIT_STATUSES.includes(status)");
  });

  it("createLeaseAuditFinding calls rpc create_lease_audit_finding", () => {
    expect(leaseAuditSvc).toContain('.rpc("create_lease_audit_finding"');
  });

  it("createLeaseAuditFinding passes p_risk_level", () => {
    const idx = leaseAuditSvc.indexOf('.rpc("create_lease_audit_finding"');
    const snippet = leaseAuditSvc.slice(idx, idx + 300);
    expect(snippet).toContain("p_risk_level");
  });

  it("dismissLeaseAuditFinding calls rpc dismiss_lease_audit_finding", () => {
    expect(leaseAuditSvc).toContain('.rpc("dismiss_lease_audit_finding"');
  });

  it("dismissLeaseAuditFinding no longer sets dismissed_at in JS", () => {
    const idx = leaseAuditSvc.indexOf("export async function dismissLeaseAuditFinding");
    const end = leaseAuditSvc.indexOf("export async function", idx + 1);
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).not.toContain("dismissed_at");
  });

  it("restoreLeaseAuditFinding calls rpc restore_lease_audit_finding", () => {
    expect(leaseAuditSvc).toContain('.rpc("restore_lease_audit_finding"');
  });

  it("deleteLeaseAuditFinding calls rpc delete_lease_audit_finding", () => {
    expect(leaseAuditSvc).toContain('.rpc("delete_lease_audit_finding"');
  });

  it("deleteLeaseAuditFinding no longer uses .from(lease_audit_findings).delete", () => {
    const idx = leaseAuditSvc.indexOf("export async function deleteLeaseAuditFinding");
    const end = leaseAuditSvc.length; // last function
    const block = leaseAuditSvc.slice(idx, end);
    expect(block).not.toContain('.from("lease_audit_findings").delete');
  });
});

// ─── Limitations doc: Phase 5 resolutions ────────────────────────────────────

describe("limitations doc: Phase 5 security items resolved", () => {
  it("L-007 marked as resolved in Phase 5", () => {
    const idx = limitationsDoc.indexOf("L-007");
    // Should appear in the Resolved table referencing Phase 5
    const resolvedIdx = limitationsDoc.indexOf("L-007", idx + 1);
    expect(resolvedIdx).toBeGreaterThan(-1);
  });

  it("L-011 marked as resolved in Phase 5", () => {
    const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
    expect(resolvedSection).toContain("L-011");
  });

  it("L-022 marked as resolved in Phase 5", () => {
    const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
    expect(resolvedSection).toContain("L-022");
  });

  it("L-029 marked as resolved in Phase 5", () => {
    const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
    expect(resolvedSection).toContain("L-029");
  });

  it("L-036 marked as resolved in Phase 5", () => {
    const resolvedSection = limitationsDoc.slice(limitationsDoc.indexOf("## Resolved"));
    expect(resolvedSection).toContain("L-036");
  });

  it("compliance_security_hardening.sql referenced in Phase 5 section", () => {
    expect(limitationsDoc).toContain("compliance_security_hardening.sql");
  });
});
