// tests/security/polandComplianceContracts.test.js
//
// SQL structure and security contract tests for the Poland Compliance layer.
// These tests verify the shape of SQL files without running a live database —
// they guard against accidental regressions in table definitions, RLS policy
// naming, RPC security attributes, and OVERLAY_SEQUENCE membership.

import { readFileSync } from "node:fs";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function readJs(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const foundationSql  = readSql("supabase/poland_compliance_foundation.sql");
const dbApplyScript  = readJs("scripts/dbApplyRepoSql.js");

// ── OVERLAY_SEQUENCE membership ───────────────────────────────────────────

describe("OVERLAY_SEQUENCE membership", () => {
  it("includes poland_compliance_foundation.sql in dbApplyRepoSql OVERLAY_SEQUENCE", () => {
    expect(dbApplyScript).toContain('"poland_compliance_foundation.sql"');
  });

  it("positions poland_compliance_foundation.sql after lease_clause_audit_ai.sql", () => {
    const leaseClausePos = dbApplyScript.indexOf('"lease_clause_audit_ai.sql"');
    const polandPos      = dbApplyScript.indexOf('"poland_compliance_foundation.sql"');
    expect(leaseClausePos).toBeGreaterThan(-1);
    expect(polandPos).toBeGreaterThan(-1);
    expect(polandPos).toBeGreaterThan(leaseClausePos);
  });
});

// ── Market column additions — safe IF NOT EXISTS guards ───────────────────

describe("market column additions are safe for existing data", () => {
  it("adds accounts.default_market with IF NOT EXISTS", () => {
    expect(foundationSql).toContain("ADD COLUMN IF NOT EXISTS default_market TEXT");
  });

  it("adds properties.market with IF NOT EXISTS", () => {
    expect(foundationSql).toContain("ADD COLUMN IF NOT EXISTS market TEXT");
  });

  it("adds leases.lease_type with IF NOT EXISTS", () => {
    expect(foundationSql).toContain("ADD COLUMN IF NOT EXISTS lease_type TEXT");
  });

  it("constrains accounts.default_market to allowed values or NULL", () => {
    expect(foundationSql).toContain("default_market IS NULL OR default_market IN ('pl', 'uk', 'generic')");
  });

  it("constrains properties.market to allowed values or NULL", () => {
    expect(foundationSql).toContain("market IS NULL OR market IN ('pl', 'uk', 'generic')");
  });

  it("constrains leases.lease_type to allowed values or NULL", () => {
    expect(foundationSql).toContain("lease_type IS NULL OR lease_type IN ('standard', 'najem_okazjonalny', 'other')");
  });
});

// ── compliance_checklist_items table ─────────────────────────────────────

describe("compliance_checklist_items table definition", () => {
  it("creates the table with IF NOT EXISTS", () => {
    expect(foundationSql).toContain("CREATE TABLE IF NOT EXISTS public.compliance_checklist_items");
  });

  it("has account_id FK to accounts with ON DELETE CASCADE", () => {
    expect(foundationSql).toContain("account_id           UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE");
  });

  it("has property_id FK with ON DELETE CASCADE", () => {
    expect(foundationSql).toContain("property_id          UUID        REFERENCES public.properties(id)           ON DELETE CASCADE");
  });

  it("has tenant_id FK with ON DELETE SET NULL (preserves items when tenant removed)", () => {
    expect(foundationSql).toContain("tenant_id            UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL");
  });

  it("has lease_id FK with ON DELETE SET NULL", () => {
    expect(foundationSql).toContain("lease_id             UUID        REFERENCES public.leases(id)               ON DELETE SET NULL");
  });

  it("has evidence_document_id FK with ON DELETE SET NULL", () => {
    expect(foundationSql).toContain("evidence_document_id UUID        REFERENCES public.documents(id)            ON DELETE SET NULL");
  });

  it("constrains market to pl/uk/generic", () => {
    expect(foundationSql).toContain("CHECK (market IN ('pl', 'uk', 'generic'))");
  });

  it("constrains status to valid values", () => {
    expect(foundationSql).toContain("CHECK (status IN ('pending', 'complete', 'not_applicable', 'overdue'))");
  });

  it("has two idempotency partial unique indexes", () => {
    expect(foundationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS cci_uq_with_tenant");
    expect(foundationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS cci_uq_no_tenant");
  });

  it("cci_uq_with_tenant partial condition requires both property_id and tenant_id", () => {
    expect(foundationSql).toContain("WHERE property_id IS NOT NULL AND tenant_id IS NOT NULL");
  });

  it("cci_uq_no_tenant partial condition requires property_id but no tenant_id", () => {
    expect(foundationSql).toContain("WHERE property_id IS NOT NULL AND tenant_id IS NULL");
  });

  it("has account+market+type+status index for command center queries", () => {
    expect(foundationSql).toContain("CREATE INDEX IF NOT EXISTS cci_account_market_idx");
  });

  it("has due_date index scoped to pending items", () => {
    expect(foundationSql).toContain("CREATE INDEX IF NOT EXISTS cci_due_date_idx");
    expect(foundationSql).toContain("WHERE due_date IS NOT NULL AND status = 'pending'");
  });
});

// ── RLS policies ──────────────────────────────────────────────────────────

describe("compliance_checklist_items RLS policies", () => {
  it("enables row level security on the table", () => {
    expect(foundationSql).toContain("ALTER TABLE public.compliance_checklist_items ENABLE ROW LEVEL SECURITY");
  });

  it("drops old select policy before recreating (idempotent)", () => {
    expect(foundationSql).toContain('DROP POLICY IF EXISTS "cci_select_managers" ON public.compliance_checklist_items');
  });

  it("creates select policy using user_can_manage_account", () => {
    expect(foundationSql).toContain('"cci_select_managers"');
    expect(foundationSql).toContain("public.user_can_manage_account(account_id)");
  });

  it("creates write policy using user_can_manage_account with WITH CHECK", () => {
    expect(foundationSql).toContain('"cci_write_managers"');
    // Both USING and WITH CHECK should use user_can_manage_account
    const writePolicyBlock = foundationSql.slice(
      foundationSql.indexOf('"cci_write_managers"'),
      foundationSql.indexOf('"cci_write_managers"') + 400,
    );
    const ucmaCount = (writePolicyBlock.match(/user_can_manage_account/g) || []).length;
    expect(ucmaCount).toBeGreaterThanOrEqual(2);
  });

  it("does NOT grant ANY access to anon role", () => {
    const rlsSection = foundationSql.slice(
      foundationSql.indexOf("ENABLE ROW LEVEL SECURITY"),
      foundationSql.indexOf("setup_najem_okazjonalny_checklist"),
    );
    expect(rlsSection).not.toContain("TO anon");
  });
});

// Helper: extract a SQL function body using CREATE [OR REPLACE] FUNCTION as anchor.
// Handles both CREATE FUNCTION and CREATE OR REPLACE FUNCTION patterns.
function extractFunctionBlock(sql, funcName, nextFuncName) {
  const candidates  = [
    `CREATE OR REPLACE FUNCTION public.${funcName}`,
    `CREATE FUNCTION public.${funcName}`,
  ];
  const startIdx = Math.min(...candidates.map((m) => {
    const i = sql.indexOf(m);
    return i === -1 ? Infinity : i;
  }));
  if (startIdx === Infinity) return "";

  const endCandidates = nextFuncName ? [
    `CREATE OR REPLACE FUNCTION public.${nextFuncName}`,
    `CREATE FUNCTION public.${nextFuncName}`,
  ] : [];
  const endPositions = endCandidates
    .map((m) => sql.indexOf(m, startIdx + funcName.length))
    .filter((i) => i !== -1);
  const endIdx = endPositions.length > 0 ? Math.min(...endPositions) : sql.length;

  return sql.slice(startIdx, endIdx);
}

const setupBlock    = extractFunctionBlock(foundationSql, "setup_najem_okazjonalny_checklist", "update_checklist_item_evidence");
const evidenceBlock = extractFunctionBlock(foundationSql, "update_checklist_item_evidence",    "notify_pl_compliance_deadlines");
const notifyBlock   = extractFunctionBlock(foundationSql, "notify_pl_compliance_deadlines",    "pl_compliance_checklist_command_items");

// ── setup_najem_okazjonalny_checklist RPC ─────────────────────────────────

describe("setup_najem_okazjonalny_checklist RPC security", () => {
  it("is SECURITY DEFINER", () => {
    expect(setupBlock).toContain("SECURITY DEFINER");
  });

  it("has explicit SET search_path = public", () => {
    expect(setupBlock).toContain("SET search_path = public");
  });

  it("calls assert_manage_account_access before any write", () => {
    const authPos   = setupBlock.indexOf("assert_manage_account_access");
    const insertPos = setupBlock.indexOf("INSERT INTO");
    expect(authPos).toBeGreaterThan(-1);
    expect(insertPos).toBeGreaterThan(-1);
    expect(authPos).toBeLessThan(insertPos);
  });

  it("uses pg_advisory_xact_lock to prevent concurrent double-setup", () => {
    expect(setupBlock).toContain("pg_advisory_xact_lock");
    expect(setupBlock).toContain("najem_okazjonalny:");
  });

  it("inserts all 10 Najem Okazjonalny checklist items", () => {
    const expectedKeys = [
      "lease_agreement",
      "notarial_declaration",
      "alternative_address_decl",
      "owner_consent",
      "tax_office_notification",
      "tax_office_deadline",
      "tax_office_proof",
      "handover_protocol",
      "deposit_confirmation",
      "meter_readings",
    ];
    for (const key of expectedKeys) {
      expect(setupBlock).toContain(key);
    }
  });

  it("calculates Tax Office deadline as lease_start + 14 days", () => {
    expect(setupBlock).toContain("+ 14");
  });

  it("is idempotent — checks existence before insert", () => {
    expect(setupBlock).toContain("IF EXISTS");
    expect(setupBlock).toContain("CONTINUE");
  });

  it("is GRANTed to authenticated role", () => {
    expect(foundationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.setup_najem_okazjonalny_checklist(UUID, UUID, UUID, UUID, DATE)",
    );
    expect(foundationSql).toContain("TO authenticated");
  });
});

// ── update_checklist_item_evidence RPC — cross-account guard ──────────────

describe("update_checklist_item_evidence cross-account document guard", () => {
  it("is SECURITY DEFINER", () => {
    expect(evidenceBlock).toContain("SECURITY DEFINER");
  });

  it("validates document account_id matches caller account_id before update", () => {
    const docLookupPos = evidenceBlock.indexOf("FROM public.documents");
    const updatePos    = evidenceBlock.indexOf("UPDATE compliance_checklist_items");
    expect(docLookupPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(docLookupPos).toBeLessThan(updatePos);
  });

  it("raises exception on cross-account document link", () => {
    expect(evidenceBlock).toContain("document_not_found_or_cross_account");
  });

  it("raises exception when checklist item not found", () => {
    expect(evidenceBlock).toContain("checklist_item_not_found");
  });
});

// ── notify_pl_compliance_deadlines RPC ───────────────────────────────────

describe("notify_pl_compliance_deadlines notification deduplication", () => {
  it("checks metadata.last_notified before sending", () => {
    expect(notifyBlock).toContain("last_notified");
    expect(notifyBlock).toContain("current_date");
  });

  it("writes last_notified back to metadata after notification", () => {
    expect(notifyBlock).toContain("metadata ||");
    expect(notifyBlock).toContain("'last_notified'");
  });

  it("only notifies owners and admins", () => {
    expect(notifyBlock).toContain("am.role IN ('owner', 'admin')");
  });

  it("calls create_notifications RPC for each eligible item", () => {
    expect(notifyBlock).toContain("PERFORM public.create_notifications(");
  });
});

// ── pl_compliance_checklist_command_items helper ──────────────────────────

const plHelperBlock = extractFunctionBlock(foundationSql, "pl_compliance_checklist_command_items", null);

describe("pl_compliance_checklist_command_items command center helper", () => {
  it("is SECURITY DEFINER", () => {
    expect(plHelperBlock).toContain("SECURITY DEFINER");
  });

  it("calls assert_manage_account_access before data query", () => {
    const authPos = plHelperBlock.indexOf("assert_manage_account_access");
    const fromPos = plHelperBlock.indexOf("FROM compliance_checklist_items");
    expect(authPos).toBeGreaterThan(-1);
    expect(fromPos).toBeGreaterThan(-1);
    expect(authPos).toBeLessThan(fromPos);
  });

  it("uses MATERIALIZED CTE for authz to prevent repeated evaluation", () => {
    expect(plHelperBlock).toContain("AS MATERIALIZED");
  });

  it("scopes all queries to the authz account_id (never direct p_account_id)", () => {
    expect(plHelperBlock).toContain("ci.account_id    = a.account_id");
  });

  it("surfaces tax_office_deadline_overdue as urgent bucket", () => {
    expect(plHelperBlock).toContain("pl_tax_office_deadline_overdue");
    expect(plHelperBlock).toContain("'urgent'");
  });

  it("surfaces tax_office_deadline_due_soon items", () => {
    expect(plHelperBlock).toContain("pl_tax_office_deadline_due_soon");
  });

  it("surfaces 7 distinct item types", () => {
    const itemTypes = [
      "pl_missing_notarial_declaration",
      "pl_missing_alt_address_declaration",
      "pl_tax_office_deadline_overdue",
      "pl_tax_office_deadline_due_soon",
      "pl_missing_tax_office_proof",
      "pl_missing_handover_protocol",
      "pl_missing_deposit_confirmation",
    ];
    for (const type of itemTypes) {
      expect(plHelperBlock).toContain(type);
    }
  });

  it("hard-caps results with LIMIT and greatest/least", () => {
    expect(plHelperBlock).toContain("greatest(1, least(coalesce(p_limit, 40), 200))");
  });

  it("is GRANTed to authenticated role", () => {
    expect(foundationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.pl_compliance_checklist_command_items(UUID, INTEGER)",
    );
  });

  it("returns source_table = compliance_checklist_items for all rows", () => {
    const occurrences = (plHelperBlock.match(/'compliance_checklist_items'/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(7);
  });
});

// ── entitlements contract ─────────────────────────────────────────────────

describe("POLAND_COMPLIANCE entitlement is declared and placed in Growth tier", () => {
  const entitlementsJs = readJs("src/lib/entitlements.js");

  it("declares POLAND_COMPLIANCE in ENTITLEMENT_FEATURES", () => {
    expect(entitlementsJs).toContain('POLAND_COMPLIANCE: "poland_compliance"');
  });

  it("includes POLAND_COMPLIANCE in GROWTH_FEATURES (Growth tier)", () => {
    const growthBlock = entitlementsJs.slice(
      entitlementsJs.indexOf("GROWTH_FEATURES"),
      entitlementsJs.indexOf("PRO_FEATURES"),
    );
    expect(growthBlock).toContain("ENTITLEMENT_FEATURES.POLAND_COMPLIANCE");
  });
});

// ── complianceMarket utility contract ─────────────────────────────────────

describe("complianceMarket utility exports contract", () => {
  const marketUtilJs = readJs("src/utils/complianceMarket.js");

  it("exports resolveComplianceMarket function", () => {
    expect(marketUtilJs).toContain("export function resolveComplianceMarket");
  });

  it("exports isPolishMarket function", () => {
    expect(marketUtilJs).toContain("export function isPolishMarket");
  });

  it("exports NAJEM_OKAZJONALNY_ITEM_KEYS with 10 entries", () => {
    expect(marketUtilJs).toContain("export const NAJEM_OKAZJONALNY_ITEM_KEYS");
    // Count the item keys listed in the array
    const keyCount = (marketUtilJs.match(/'[\w_]+'(?=,|\n|\s*\])/g) || []).length;
    expect(keyCount).toBeGreaterThanOrEqual(10);
  });

  it("exports summariseChecklist function", () => {
    expect(marketUtilJs).toContain("export function summariseChecklist");
  });

  it("exports calcTaxOfficeDueDate function", () => {
    expect(marketUtilJs).toContain("export function calcTaxOfficeDueDate");
  });

  it("exports checklistItemBucket function", () => {
    expect(marketUtilJs).toContain("export function checklistItemBucket");
  });

  it("fallback market is uk (not pl — preserves existing UK-first behaviour)", () => {
    expect(marketUtilJs).toContain("return 'uk'");
  });
});

// ── i18n keys contract ────────────────────────────────────────────────────

describe("Poland Compliance i18n keys are present in all locales", () => {
  const messagesJs = readJs("src/i18n/messages.js");

  const requiredKeys = [
    "polandCompliance.title",
    "polandCompliance.disclaimer",
    "polandCompliance.setupChecklist",
    "polandCompliance.checklistEmpty",
    "polandCompliance.statusPending",
    "polandCompliance.statusComplete",
    "polandCompliance.statusOverdue",
    "polandCompliance.markComplete",
    "polandCompliance.markNotApplicable",
    "sidebar.polandCompliance",
  ];

  for (const key of requiredKeys) {
    it(`has "${key}" key`, () => {
      expect(messagesJs).toContain(`"${key}"`);
    });
  }

  it("has no legal guarantee language", () => {
    const plSection = messagesJs.slice(
      messagesJs.indexOf('"polandCompliance.title"'),
      messagesJs.indexOf('"commandCenter.item.pl_missing_deposit_confirmation"') + 200,
    );
    const forbidden = ["guarantees protection", "ensures eviction", "fully compliant", "legally approved"];
    for (const phrase of forbidden) {
      expect(plSection.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});

// ── Sidebar contract ──────────────────────────────────────────────────────

describe("Sidebar Poland Compliance nav item contract", () => {
  const sidebarJs = readJs("src/layout/Sidebar.jsx");

  it("imports isPolishMarket from complianceMarket", () => {
    expect(sidebarJs).toContain("import { isPolishMarket }");
    expect(sidebarJs).toContain("complianceMarket");
  });

  it("imports Flag icon from lucide-react", () => {
    expect(sidebarJs).toContain("Flag,");
  });

  it("renders Poland Compliance nav item conditionally on showPolandCompliance", () => {
    expect(sidebarJs).toContain("showPolandCompliance");
    expect(sidebarJs).toContain("/compliance/poland");
    expect(sidebarJs).toContain("ENTITLEMENT_FEATURES.POLAND_COMPLIANCE");
  });

  it("shows LockedItem when entitlement is missing (not hidden)", () => {
    // Users without entitlement still see it but with a lock icon
    expect(sidebarJs).toContain("LockedItem");
  });
});
