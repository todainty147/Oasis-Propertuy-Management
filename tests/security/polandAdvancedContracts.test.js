// tests/security/polandAdvancedContracts.test.js
//
// SQL structure and security contract tests for poland_advanced_features.sql.
// Verifies: feature flag registrations, table RLS, RPC security attributes,
// ledger integrity guardrails, STR isolation, template publish rules,
// and OVERLAY_SEQUENCE positioning — without a live database.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function readJs(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const advancedSql   = readSql("supabase/poland_advanced_features.sql");
const dbApplyScript = readJs("scripts/dbApplyRepoSql.js");
const entitlementsJs = readJs("src/lib/entitlements.js");

// Helper: extract a function block by name
function extractFunctionBlock(sql, funcName) {
  const candidates = [
    `CREATE OR REPLACE FUNCTION public.${funcName}`,
    `CREATE FUNCTION public.${funcName}`,
  ];
  const startIdx = Math.min(
    ...candidates.map((m) => {
      const i = sql.indexOf(m);
      return i === -1 ? Infinity : i;
    }),
  );
  if (startIdx === Infinity) return "";
  // Find end: next DROP or CREATE FUNCTION
  const endMarkers = ["DROP FUNCTION IF EXISTS public.", "CREATE OR REPLACE FUNCTION public.", "CREATE FUNCTION public."];
  let endIdx = sql.length;
  endMarkers.forEach((m) => {
    const i = sql.indexOf(m, startIdx + 50);
    if (i !== -1 && i < endIdx) endIdx = i;
  });
  return sql.slice(startIdx, endIdx);
}

// ── OVERLAY_SEQUENCE ──────────────────────────────────────────────────────────

describe("OVERLAY_SEQUENCE — poland_advanced_features.sql", () => {
  it("includes poland_advanced_features.sql", () => {
    expect(dbApplyScript).toContain('"poland_advanced_features.sql"');
  });

  it("positions advanced after evidence", () => {
    const evidencePos = dbApplyScript.indexOf('"poland_compliance_evidence.sql"');
    const advancedPos = dbApplyScript.indexOf('"poland_advanced_features.sql"');
    expect(evidencePos).toBeGreaterThan(-1);
    expect(advancedPos).toBeGreaterThan(evidencePos);
  });
});

// ── Feature flag registration in SQL ─────────────────────────────────────────

describe("account_feature_required_plan — new PL advanced flags", () => {
  it("registers pl_str_compliance → growth", () => {
    expect(advancedSql).toContain("WHEN 'pl_str_compliance'");
    expect(advancedSql).toContain("THEN 'growth'");
  });

  it("registers pl_open_banking_readiness → pro", () => {
    expect(advancedSql).toContain("WHEN 'pl_open_banking_readiness'");
    const blockStart = advancedSql.indexOf("WHEN 'pl_open_banking_readiness'");
    const blockSlice = advancedSql.slice(blockStart, blockStart + 80);
    expect(blockSlice).toContain("'pro'");
  });

  it("registers pl_template_library → pro", () => {
    expect(advancedSql).toContain("WHEN 'pl_template_library'");
  });

  it("registers pl_partner_directory → pro", () => {
    expect(advancedSql).toContain("WHEN 'pl_partner_directory'");
  });

  it("preserves poland_compliance → growth", () => {
    expect(advancedSql).toContain("WHEN 'poland_compliance'");
  });

  it("preserves all prior core features", () => {
    expect(advancedSql).toContain("WHEN 'command_center'");
    expect(advancedSql).toContain("WHEN 'renters_rights_readiness'");
    expect(advancedSql).toContain("WHEN 'ai_lease_auditor'");
    expect(advancedSql).toContain("WHEN 'ai_security_copilot'");
  });

  it("is a SECURITY DEFINER-free SQL function (stable, not definer)", () => {
    const fnBlock = advancedSql.slice(
      advancedSql.indexOf("CREATE OR REPLACE FUNCTION public.account_feature_required_plan"),
      advancedSql.indexOf("REVOKE ALL   ON FUNCTION public.account_feature_required_plan"),
    );
    expect(fnBlock).not.toContain("SECURITY DEFINER");
  });
});

// ── JS entitlements mirror ────────────────────────────────────────────────────

describe("entitlements.js — PL advanced feature constants", () => {
  it("exports PL_OPEN_BANKING_READINESS", () => {
    expect(entitlementsJs).toContain("PL_OPEN_BANKING_READINESS");
    expect(entitlementsJs).toContain('"pl_open_banking_readiness"');
  });

  it("exports PL_STR_COMPLIANCE", () => {
    expect(entitlementsJs).toContain("PL_STR_COMPLIANCE");
    expect(entitlementsJs).toContain('"pl_str_compliance"');
  });

  it("exports PL_TEMPLATE_LIBRARY", () => {
    expect(entitlementsJs).toContain("PL_TEMPLATE_LIBRARY");
    expect(entitlementsJs).toContain('"pl_template_library"');
  });

  it("exports PL_PARTNER_DIRECTORY", () => {
    expect(entitlementsJs).toContain("PL_PARTNER_DIRECTORY");
    expect(entitlementsJs).toContain('"pl_partner_directory"');
  });

  it("pl_str_compliance is in GROWTH_FEATURES", () => {
    const growthBlock = entitlementsJs.slice(
      entitlementsJs.indexOf("const GROWTH_FEATURES"),
      entitlementsJs.indexOf("const PRO_FEATURES"),
    );
    expect(growthBlock).toContain("PL_STR_COMPLIANCE");
  });

  it("pl_open_banking_readiness is in PRO_FEATURES", () => {
    const proBlock = entitlementsJs.slice(
      entitlementsJs.indexOf("const PRO_FEATURES"),
      entitlementsJs.indexOf("const OPERATOR_AGENCY_FEATURES"),
    );
    expect(proBlock).toContain("PL_OPEN_BANKING_READINESS");
  });

  it("pl_template_library is in PRO_FEATURES", () => {
    const proBlock = entitlementsJs.slice(
      entitlementsJs.indexOf("const PRO_FEATURES"),
      entitlementsJs.indexOf("const OPERATOR_AGENCY_FEATURES"),
    );
    expect(proBlock).toContain("PL_TEMPLATE_LIBRARY");
  });

  it("pl_partner_directory is in PRO_FEATURES", () => {
    const proBlock = entitlementsJs.slice(
      entitlementsJs.indexOf("const PRO_FEATURES"),
      entitlementsJs.indexOf("const OPERATOR_AGENCY_FEATURES"),
    );
    expect(proBlock).toContain("PL_PARTNER_DIRECTORY");
  });
});

// ── pl_rent_match_candidates table ────────────────────────────────────────────

describe("pl_rent_match_candidates table", () => {
  it("created IF NOT EXISTS", () => {
    expect(advancedSql).toContain("CREATE TABLE IF NOT EXISTS public.pl_rent_match_candidates");
  });

  it("has match_status CHECK constraint with 4 valid values", () => {
    expect(advancedSql).toContain("CHECK (match_status IN ('suggested', 'confirmed', 'rejected', 'unmatched'))");
  });

  it("candidate_source is restricted to 'manual' only in v1", () => {
    expect(advancedSql).toContain("CHECK (candidate_source IN ('manual'))");
  });

  it("ledger_entry_id has no FK (deferred v1 guardrail)", () => {
    const tableBlock = advancedSql.slice(
      advancedSql.indexOf("CREATE TABLE IF NOT EXISTS public.pl_rent_match_candidates"),
      advancedSql.indexOf("COMMENT ON TABLE public.pl_rent_match_candidates"),
    );
    // ledger_entry_id should NOT have a REFERENCES clause
    const ledgerLine = tableBlock.split("\n").find((l) => l.includes("ledger_entry_id"));
    expect(ledgerLine).toBeTruthy();
    expect(ledgerLine).not.toContain("REFERENCES");
  });

  it("enables RLS", () => {
    expect(advancedSql).toContain("ALTER TABLE public.pl_rent_match_candidates ENABLE ROW LEVEL SECURITY");
  });

  it("has write policy using user_can_manage_account", () => {
    expect(advancedSql).toContain('"plrm_write_managers"');
    expect(advancedSql).toContain("public.user_can_manage_account(account_id)");
  });
});

// ── pl_rent_match_audit — append-only guardrail ───────────────────────────────

describe("pl_rent_match_audit append-only guardrail", () => {
  it("has INSERT policy but no UPDATE or DELETE policy", () => {
    expect(advancedSql).toContain('"plrma_insert_managers"');
    expect(advancedSql).not.toContain('"plrma_write_managers"');
    expect(advancedSql).not.toContain('"plrma_update_managers"');
    expect(advancedSql).not.toContain('"plrma_delete_managers"');
  });

  it("GRANT is INSERT-only (no UPDATE/DELETE)", () => {
    const grantLine = advancedSql.split("\n").find(
      (l) => l.includes("pl_rent_match_audit") && l.includes("GRANT"),
    );
    expect(grantLine).toBeTruthy();
    expect(grantLine).toContain("SELECT, INSERT");
    expect(grantLine).not.toContain("UPDATE");
    expect(grantLine).not.toContain("DELETE");
  });

  it("has comment saying append-only", () => {
    expect(advancedSql).toContain("Append-only audit trail");
  });
});

// ── pl_str_properties — isolation from long-term workflows ────────────────────

describe("pl_str_properties table — STR isolation", () => {
  it("created IF NOT EXISTS with UNIQUE (account_id, property_id)", () => {
    expect(advancedSql).toContain("CREATE TABLE IF NOT EXISTS public.pl_str_properties");
    expect(advancedSql).toContain("UNIQUE (account_id, property_id)");
  });

  it("registration_status CHECK with 4 valid values", () => {
    expect(advancedSql).toContain("CHECK (registration_status IN ('not_started', 'pending', 'registered', 'expired'))");
  });

  it("has NO reference to compliance_checklist_items (isolation)", () => {
    const strTableBlock = advancedSql.slice(
      advancedSql.indexOf("CREATE TABLE IF NOT EXISTS public.pl_str_properties"),
      advancedSql.indexOf("-- 5. pl_legal_templates"),
    );
    expect(strTableBlock).not.toContain("compliance_checklist_items");
    expect(strTableBlock).not.toContain("najem_okazjonalny");
  });

  it("safety_checklist is JSONB (not a separate table FK)", () => {
    expect(advancedSql).toMatch(/safety_checklist\s+JSONB/);
  });

  it("has comment stating isolation from Najem Okazjonalny", () => {
    expect(advancedSql).toContain("Separate from Najem Okazjonalny");
  });

  it("enables RLS", () => {
    expect(advancedSql).toContain("ALTER TABLE public.pl_str_properties ENABLE ROW LEVEL SECURITY");
  });
});

// ── pl_legal_templates — publish rules ────────────────────────────────────────

describe("pl_legal_templates — template publish rules", () => {
  it("status CHECK includes draft, requires_review, reviewed, retired", () => {
    expect(advancedSql).toContain("CHECK (status IN ('draft', 'requires_review', 'reviewed', 'retired'))");
  });

  it("is_active defaults to FALSE (safe default: not yet production)", () => {
    expect(advancedSql).toContain("is_active           BOOLEAN     NOT NULL DEFAULT FALSE");
  });

  it("has comment stating only reviewed+active appear in production UI", () => {
    expect(advancedSql).toContain("only status=reviewed AND is_active=true templates appear in production UI");
  });

  it("document_id has comment about immutability", () => {
    expect(advancedSql).toContain("Immutable reference to the published document version");
  });

  it("list_legal_templates function filters by status=reviewed AND is_active", () => {
    const fnBlock = extractFunctionBlock(advancedSql, "list_legal_templates");
    expect(fnBlock).toContain("status = 'reviewed'");
    expect(fnBlock).toContain("is_active = TRUE");
  });

  it("enables RLS", () => {
    expect(advancedSql).toContain("ALTER TABLE public.pl_legal_templates ENABLE ROW LEVEL SECURITY");
  });
});

// ── pl_partner_directory — tenant exclusion + no marketplace ─────────────────

describe("pl_partner_directory — no marketplace, tenant exclusion", () => {
  it("has no payment/referral fee column definitions", () => {
    // Extract only column definitions (lines with UUID, TEXT, NUMERIC, etc.)
    const tableBlock = advancedSql.slice(
      advancedSql.indexOf("CREATE TABLE IF NOT EXISTS public.pl_partner_directory"),
      advancedSql.indexOf("COMMENT ON TABLE public.pl_partner_directory"),
    );
    const columnLines = tableBlock
      .split("\n")
      .filter((l) => /\s+(UUID|TEXT|NUMERIC|BOOLEAN|JSONB|TIMESTAMPTZ|DATE)\s/.test(l))
      .join("\n");
    expect(columnLines).not.toMatch(/\bfee_amount\b/i);
    expect(columnLines).not.toMatch(/\bpayment_amount\b/i);
    expect(columnLines).not.toMatch(/\bprice\b/i);
    expect(columnLines).not.toMatch(/\brevenue\b/i);
  });

  it("has comment stating not a marketplace", () => {
    expect(advancedSql).toContain("Not a marketplace");
  });

  it("has comment stating tenant access blocked", () => {
    expect(advancedSql).toContain("Tenant access blocked by RLS");
  });

  it("partner_type CHECK includes all 4 types", () => {
    expect(advancedSql).toContain("CHECK (partner_type IN ('notary', 'solicitor', 'accountant', 'property_manager'))");
  });

  it("disclaimer column present", () => {
    expect(advancedSql).toMatch(/disclaimer\s+TEXT\s+NOT NULL/);
  });

  it("enables RLS", () => {
    expect(advancedSql).toContain("ALTER TABLE public.pl_partner_directory ENABLE ROW LEVEL SECURITY");
  });

  it("select policy allows platform templates (account_id IS NULL)", () => {
    const policyBlock = advancedSql.slice(
      advancedSql.indexOf('"plpd_select_managers"'),
      advancedSql.indexOf('"plpd_write_managers"'),
    );
    expect(policyBlock).toContain("account_id IS NULL");
    expect(policyBlock).toContain("user_can_manage_account");
  });
});

// ── RPC security attributes ───────────────────────────────────────────────────

const RPCS = [
  "create_rent_match_candidate",
  "update_rent_match_status",
  "list_rent_match_candidates",
  "upsert_str_property",
  "list_str_properties",
  "list_legal_templates",
  "list_partners",
];

describe("All advanced RPCs have SECURITY DEFINER + SET search_path", () => {
  for (const rpcName of RPCS) {
    it(`${rpcName} has SECURITY DEFINER`, () => {
      const block = extractFunctionBlock(advancedSql, rpcName);
      expect(block.length).toBeGreaterThan(50);
      expect(block).toContain("SECURITY DEFINER");
    });

    it(`${rpcName} has SET search_path = public`, () => {
      const block = extractFunctionBlock(advancedSql, rpcName);
      expect(block).toContain("SET search_path = public");
    });
  }
});

// ── Ledger integrity guardrail ────────────────────────────────────────────────

describe("Finance ledger integrity guardrail", () => {
  it("no direct INSERT into ledger_entries in advanced SQL", () => {
    expect(advancedSql).not.toContain("INSERT INTO ledger_entries");
    expect(advancedSql).not.toContain("INSERT INTO public.ledger_entries");
  });

  it("no direct UPDATE on payments table", () => {
    expect(advancedSql).not.toContain("UPDATE payments");
    expect(advancedSql).not.toContain("UPDATE public.payments");
  });

  it("candidate_source is 'manual' only — no live bank API integration", () => {
    // Feature key 'pl_open_banking_readiness' is expected; live API integration is not
    expect(advancedSql).not.toContain("bank_api_endpoint");
    expect(advancedSql).not.toContain("ACCESS_TOKEN");
    expect(advancedSql).not.toContain("bank_credentials");
    // v1 only allows 'manual' as candidate_source
    expect(advancedSql).toContain("CHECK (candidate_source IN ('manual'))");
  });

  it("update_rent_match_status does not insert a ledger entry", () => {
    const fnBlock = extractFunctionBlock(advancedSql, "update_rent_match_status");
    expect(fnBlock).not.toContain("ledger_entries");
  });
});

// ── Cross-account feature flag enforcement ────────────────────────────────────

describe("Feature flag enforcement in RPCs", () => {
  it("create_rent_match_candidate calls assert_account_feature_access with pl_open_banking_readiness", () => {
    const block = extractFunctionBlock(advancedSql, "create_rent_match_candidate");
    expect(block).toContain("assert_account_feature_access");
    expect(block).toContain("pl_open_banking_readiness");
  });

  it("upsert_str_property calls assert_account_feature_access with pl_str_compliance", () => {
    const block = extractFunctionBlock(advancedSql, "upsert_str_property");
    expect(block).toContain("assert_account_feature_access");
    expect(block).toContain("pl_str_compliance");
  });
});

// ── File existence checks ─────────────────────────────────────────────────────

describe("File existence — advanced services and utils", () => {
  const files = [
    "src/utils/plAdvancedUtils.js",
    "src/services/plRentMatchService.js",
    "src/services/plStrService.js",
    "src/services/plTemplateService.js",
    "src/services/plPartnerService.js",
    "src/components/compliance/PlRentMatchPanel.jsx",
    "src/components/compliance/PlStrCompliancePanel.jsx",
    "src/components/compliance/PlTemplatePanel.jsx",
    "src/components/compliance/PlPartnerPanel.jsx",
    "src/pages/compliance/PlAdvancedPage.jsx",
  ];

  for (const file of files) {
    it(`${file} exists`, () => {
      expect(existsSync(new URL(`../../${file}`, import.meta.url))).toBe(true);
    });
  }
});

// ── i18n key coverage ─────────────────────────────────────────────────────────

describe("i18n key coverage — Poland Advanced", () => {
  let messagesJs;
  beforeAll(() => { messagesJs = readJs("src/i18n/messages.js"); });

  const requiredKeys = [
    "sidebar.plAdvanced",
    "plAdvanced.pageTitle",
    "plAdvanced.featurePreviewBadge",
    "plAdvanced.globalDisclaimer",
    "plAdvanced.tab.str",
    "plAdvanced.tab.rentMatch",
    "plAdvanced.tab.templates",
    "plAdvanced.tab.partners",
    "plAdvanced.upgradeGate.title",
    "plAdvanced.rentMatch.title",
    "plAdvanced.rentMatch.disclaimer",
    "plAdvanced.rentMatch.status.suggested",
    "plAdvanced.rentMatch.status.confirmed",
    "plAdvanced.rentMatch.confidence.high",
    "plAdvanced.str.disclaimer",
    "plAdvanced.str.safetyItem.fire_extinguisher",
    "plAdvanced.str.regStatus.registered",
    "plAdvanced.templates.featurePreview",
    "plAdvanced.templates.globalDisclaimer",
    "plAdvanced.templates.status.reviewed",
    "plAdvanced.templates.notReady",
    "plAdvanced.partners.notEndorsement",
    "plAdvanced.partners.contactDisclaimer",
    "plAdvanced.partners.type.notary",
  ];

  for (const key of requiredKeys) {
    it(`has key "${key}"`, () => {
      expect(messagesJs).toContain(`"${key}"`);
    });
  }

  it("key appears in all 3 locales (en, pl, de)", () => {
    const occurrences = (messagesJs.match(/"plAdvanced\.pageTitle"/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("safe copy: does not claim automatic compliance or guaranteed matching", () => {
    const plBlock = messagesJs.slice(messagesJs.indexOf('"plAdvanced.'), messagesJs.lastIndexOf('"plAdvanced.') + 200);
    // These specific marketing claims must never appear
    expect(plBlock).not.toMatch(/Automatically compliant/i);
    expect(plBlock).not.toMatch(/Approved by law/i);
    expect(plBlock).not.toMatch(/Guaranteed rent match/i);
    expect(plBlock).not.toMatch(/Verified legal partner/i);
    // "Official government reporting" is allowed only when prefixed with negation
    const hasUnsafeReport = plBlock
      .split("\n")
      .some((line) => /official government reporting/i.test(line) && !/not.*official|does not.*official|kein.*offiziell/i.test(line));
    expect(hasUnsafeReport).toBe(false);
  });
});
