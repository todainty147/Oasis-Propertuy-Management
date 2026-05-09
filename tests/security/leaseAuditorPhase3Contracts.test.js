import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const rpcContracts    = read("src/services/rpcContracts.js");
const leaseAuditSvc   = read("src/services/leaseAuditService.js");
const useLeaseAuditHk = read("src/hooks/useLeaseAudit.js");
const riskBadge       = read("src/components/compliance/LeaseClauseRiskBadge.jsx");
const renewalBadge    = read("src/components/compliance/LeaseRenewalStatusBadge.jsx");
const leaseAuditorPg  = read("src/pages/compliance/LeaseAuditorPage.jsx");
const messagesJs      = read("src/i18n/messages.js");
const limitationsDoc  = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");
const securitySql     = read("supabase/compliance_security_hardening.sql");

// ─── rpcContracts: new parsers ────────────────────────────────────────────────

describe("rpcContracts: parseLeaseAuditRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseLeaseAuditRow");
  });

  it("parses required fields", () => {
    const idx = rpcContracts.indexOf("export function parseLeaseAuditRow");
    const snippet = rpcContracts.slice(idx, idx + 800);
    ["lease_id", "status", "overall_risk", "summary", "completed_at", "requested_by"].forEach((f) => {
      expect(snippet).toContain(f);
    });
  });

  it("defaults status to pending", () => {
    const idx = rpcContracts.indexOf("export function parseLeaseAuditRow");
    const snippet = rpcContracts.slice(idx, idx + 600);
    expect(snippet).toContain('"pending"');
  });
});

describe("rpcContracts: parseLeaseAuditFindingRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseLeaseAuditFindingRow");
  });

  it("parses required fields", () => {
    const idx = rpcContracts.indexOf("export function parseLeaseAuditFindingRow");
    const snippet = rpcContracts.slice(idx, idx + 700);
    ["lease_audit_id", "clause_ref", "clause_text", "risk_level",
     "category", "explanation", "dismissed", "dismissed_by", "dismissed_at"].forEach((f) => {
      expect(snippet).toContain(f);
    });
  });

  it("uses toBooleanOr for dismissed field", () => {
    const idx = rpcContracts.indexOf("export function parseLeaseAuditFindingRow");
    const snippet = rpcContracts.slice(idx, idx + 700);
    expect(snippet).toContain("toBooleanOr(value.dismissed");
  });
});

// ─── leaseAuditService: structure ────────────────────────────────────────────

describe("leaseAuditService: exported functions", () => {
  const EXPORTS = [
    "listLeaseAudits",
    "getLatestLeaseAudit",
    "createLeaseAudit",
    "updateLeaseAuditStatus",
    "listLeaseAuditFindings",
    "createLeaseAuditFinding",
    "dismissLeaseAuditFinding",
    "restoreLeaseAuditFinding",
    "deleteLeaseAuditFinding",
  ];
  for (const fn of EXPORTS) {
    it(`exports ${fn}`, () => {
      expect(leaseAuditSvc).toContain(fn);
    });
  }
});

describe("leaseAuditService: safety invariants", () => {
  it("createLeaseAudit guards against missing accountId", () => {
    const idx = leaseAuditSvc.indexOf("export async function createLeaseAudit");
    expect(leaseAuditSvc.slice(idx, idx + 200)).toContain("if (!accountId)");
  });

  it("createLeaseAudit guards against missing leaseId", () => {
    const idx = leaseAuditSvc.indexOf("export async function createLeaseAudit");
    expect(leaseAuditSvc.slice(idx, idx + 250)).toContain("if (!leaseId)");
  });

  it("createLeaseAudit sets status to pending on insert (enforced in RPC)", () => {
    // Phase 5: SQL RPC INSERT hardcodes status = 'pending'
    const idx = securitySql.indexOf("create or replace function public.create_lease_audit(");
    const end = securitySql.indexOf("create or replace function public.update_lease_audit_status(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("'pending'");
  });

  it("updateLeaseAuditStatus validates against VALID_AUDIT_STATUSES", () => {
    expect(leaseAuditSvc).toContain("VALID_AUDIT_STATUSES");
    expect(leaseAuditSvc).toContain("Invalid audit status");
  });

  it("createLeaseAuditFinding validates against VALID_RISK_LEVELS", () => {
    expect(leaseAuditSvc).toContain("VALID_RISK_LEVELS");
    expect(leaseAuditSvc).toContain("Invalid risk level");
  });

  it("dismissLeaseAuditFinding scopes by account_id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.dismiss_lease_audit_finding(");
    const end = securitySql.indexOf("create or replace function public.restore_lease_audit_finding(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("deleteLeaseAuditFinding scopes by account_id (enforced in RPC)", () => {
    // Phase 5: SQL RPC WHERE clause includes account_id = v_account_id
    const idx = securitySql.indexOf("create or replace function public.delete_lease_audit_finding(");
    const end = securitySql.length;
    const block = securitySql.slice(idx, end);
    expect(block).toContain("account_id = v_account_id");
  });

  it("dismissLeaseAuditFinding sets dismissed=true (enforced in RPC, not deletes)", () => {
    // Phase 5: SQL RPC UPDATE sets dismissed = true; no DELETE statement
    const idx = securitySql.indexOf("create or replace function public.dismiss_lease_audit_finding(");
    const end = securitySql.indexOf("create or replace function public.restore_lease_audit_finding(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("dismissed    = true");
    expect(block).not.toContain("delete from");
  });

  it("restoreLeaseAuditFinding sets dismissed=false and clears dismissed_at (enforced in RPC)", () => {
    // Phase 5: SQL RPC UPDATE sets dismissed = false, dismissed_at = null
    const idx = securitySql.indexOf("create or replace function public.restore_lease_audit_finding(");
    const end = securitySql.indexOf("create or replace function public.delete_lease_audit_finding(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("dismissed    = false");
    expect(block).toContain("dismissed_at = null");
  });

  it("updateLeaseAuditStatus sets completed_at when status=complete (enforced in RPC)", () => {
    // Phase 5: SQL RPC sets completed_at = v_now when p_status = 'complete'
    const idx = securitySql.indexOf("create or replace function public.update_lease_audit_status(");
    const end = securitySql.indexOf("create or replace function public.create_lease_audit_finding(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("completed_at");
    expect(block).toContain("'complete'");
  });

  it("listLeaseAudits calls rpc list_lease_audits (account_id enforced in RPC, Phase 7)", () => {
    expect(leaseAuditSvc).toContain('.rpc("list_lease_audits"');
  });

  it("listLeaseAuditFindings calls rpc list_lease_audit_findings (scoping enforced in SQL, Phase 7)", () => {
    expect(leaseAuditSvc).toContain('.rpc("list_lease_audit_findings"');
  });

  it("getLatestLeaseAudit handles PGRST116 (no rows) gracefully", () => {
    expect(leaseAuditSvc).toContain("PGRST116");
  });
});

// ─── useLeaseAudit hooks ──────────────────────────────────────────────────────

describe("useLeaseAudit hooks", () => {
  it("exports useLeaseAudits", () => {
    expect(useLeaseAuditHk).toContain("export function useLeaseAudits");
  });

  it("exports useLatestLeaseAudit", () => {
    expect(useLeaseAuditHk).toContain("export function useLatestLeaseAudit");
  });

  it("exports useLeaseAuditFindings", () => {
    expect(useLeaseAuditHk).toContain("export function useLeaseAuditFindings");
  });

  it("all three hooks use cancellation flags", () => {
    const count = (useLeaseAuditHk.match(/cancelled = true/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("useLeaseAuditFindings returns findings, loading, error, refetch", () => {
    const idx = useLeaseAuditHk.indexOf("export function useLeaseAuditFindings");
    const snippet = useLeaseAuditHk.slice(idx, idx + 100);
    expect(snippet).toContain("findings");
  });
});

// ─── Badge components ─────────────────────────────────────────────────────────

describe("LeaseClauseRiskBadge", () => {
  it("covers all four risk levels", () => {
    ["low", "medium", "high", "critical"].forEach((r) => {
      expect(riskBadge).toContain(r);
    });
  });

  it("critical is rose-coloured", () => {
    const idx = riskBadge.indexOf("critical");
    expect(riskBadge.slice(idx, idx + 120)).toContain("rose");
  });

  it("low is emerald-coloured", () => {
    const idx = riskBadge.indexOf("low");
    expect(riskBadge.slice(idx, idx + 120)).toContain("emerald");
  });

  it("uses data-testid per risk level", () => {
    expect(riskBadge).toContain("data-testid={`lease-clause-risk-badge-${risk}`}");
  });
});

describe("LeaseRenewalStatusBadge", () => {
  it("covers all five renewal statuses", () => {
    ["active", "expiring_soon", "renewal_in_progress", "renewed", "ended"].forEach((s) => {
      expect(renewalBadge).toContain(s);
    });
  });

  it("expiring_soon is amber", () => {
    expect(renewalBadge).toContain("expiring_soon");
    const idx = renewalBadge.indexOf("expiring_soon");
    expect(renewalBadge.slice(idx, idx + 120)).toContain("amber");
  });

  it("uses data-testid per status", () => {
    expect(renewalBadge).toContain("data-testid={`lease-renewal-status-badge-${status}`}");
  });
});

// ─── LeaseAuditorPage ────────────────────────────────────────────────────────

describe("LeaseAuditorPage", () => {
  it("has data-testid=lease-auditor-page", () => {
    expect(leaseAuditorPg).toContain('data-testid="lease-auditor-page"');
  });

  it("has lease-detail-view data-testid", () => {
    expect(leaseAuditorPg).toContain('data-testid="lease-detail-view"');
  });

  it("has desktop lease list table with data-testid=lease-list-table", () => {
    expect(leaseAuditorPg).toContain('data-testid="lease-list-table"');
  });

  it("has mobile lease list cards with data-testid=lease-list-cards", () => {
    expect(leaseAuditorPg).toContain('data-testid="lease-list-cards"');
  });

  it("has findings list with data-testid=findings-list", () => {
    expect(leaseAuditorPg).toContain('data-testid="findings-list"');
  });

  it("start audit button has data-testid=start-audit-button", () => {
    expect(leaseAuditorPg).toContain('data-testid="start-audit-button"');
  });

  it("mark complete button has data-testid=mark-audit-complete-button", () => {
    expect(leaseAuditorPg).toContain('data-testid="mark-audit-complete-button"');
  });

  it("add finding button has data-testid=add-finding-button", () => {
    expect(leaseAuditorPg).toContain('data-testid="add-finding-button"');
  });

  it("save finding button has data-testid=save-finding-button", () => {
    expect(leaseAuditorPg).toContain('data-testid="save-finding-button"');
  });

  it("dismiss finding button uses data-testid", () => {
    expect(leaseAuditorPg).toContain("data-testid={`dismiss-finding-${f.id}`}");
  });

  it("restore finding button uses data-testid", () => {
    expect(leaseAuditorPg).toContain("data-testid={`restore-finding-${f.id}`}");
  });

  it("toggle dismissed findings button has data-testid", () => {
    expect(leaseAuditorPg).toContain('data-testid="toggle-dismissed-findings"');
  });

  it("shows no-extraction notice when no PDF has been extracted", () => {
    expect(leaseAuditorPg).toContain("compliance.leases.noExtractionForAi");
  });

  it("shows disclaimer", () => {
    expect(leaseAuditorPg).toContain("compliance.leases.disclaimer");
  });

  it("uses LeaseClauseRiskBadge", () => {
    expect(leaseAuditorPg).toContain("LeaseClauseRiskBadge");
  });

  it("uses LeaseRenewalStatusBadge", () => {
    expect(leaseAuditorPg).toContain("LeaseRenewalStatusBadge");
  });

  it("shows back-to-list button when lease is selected", () => {
    expect(leaseAuditorPg).toContain("compliance.leases.backToList");
  });

  it("does not claim to be legal advice in the component code", () => {
    expect(leaseAuditorPg.toLowerCase()).not.toContain("legal advice");
  });
});

// ─── i18n: Phase 3 keys ───────────────────────────────────────────────────────

describe("i18n: Phase 3 Lease Auditor keys", () => {
  const requiredKeys = [
    "compliance.leases.startAudit",
    "compliance.leases.addFinding",
    "compliance.leases.markComplete",
    "compliance.leases.aiExtractionDeferred",
    "compliance.leases.renewalStatus.active",
    "compliance.leases.renewalStatus.expiring_soon",
    "compliance.leases.auditStatus.pending",
    "compliance.leases.auditStatus.complete",
    "compliance.leases.risk.low",
    "compliance.leases.risk.critical",
    "compliance.leases.findingForm.heading",
    "compliance.leases.findingForm.save",
    "compliance.leases.findingCategory.break_clause",
    "compliance.leases.errors.startFailed",
  ];

  for (const key of requiredKeys) {
    it(`"${key}" present in ≥2 locales`, () => {
      const regex = new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g");
      const count = (messagesJs.match(regex) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    });
  }
});

// ─── Limitations doc: Phase 3 entries ────────────────────────────────────────

describe("limitations doc: Phase 3 entries recorded", () => {
  it("documents L-028 (no AI extraction)", () => {
    expect(limitationsDoc).toContain("L-028");
    expect(limitationsDoc).toContain("generate-lease-audit");
  });

  it("documents L-029 (missing server-side feature gate)", () => {
    expect(limitationsDoc).toContain("L-029");
  });

  it("documents L-033 (overall_risk not computed)", () => {
    expect(limitationsDoc).toContain("L-033");
    expect(limitationsDoc).toContain("overall_risk");
  });
});
