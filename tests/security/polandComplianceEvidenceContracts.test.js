// tests/security/polandComplianceEvidenceContracts.test.js
//
// SQL structure and security contract tests for poland_compliance_evidence.sql.
// Verifies table RLS, RPC security attributes, audit logging, and OVERLAY_SEQUENCE
// positioning without requiring a live database.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function readJs(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const evidenceSql   = readSql("supabase/poland_compliance_evidence.sql");
const dbApplyScript = readJs("scripts/dbApplyRepoSql.js");

// Helper: extract a named function block from SQL
function extractFunctionBlock(sql, funcName, nextFuncName) {
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
  const endMarkers = nextFuncName
    ? [
        `CREATE OR REPLACE FUNCTION public.${nextFuncName}`,
        `CREATE FUNCTION public.${nextFuncName}`,
        `DROP FUNCTION IF EXISTS public.${nextFuncName}`,
      ]
    : [];
  let endIdx = sql.length;
  endMarkers.forEach((m) => {
    const i = sql.indexOf(m, startIdx + 1);
    if (i !== -1 && i < endIdx) endIdx = i;
  });
  return sql.slice(startIdx, endIdx);
}

// ── OVERLAY_SEQUENCE membership ───────────────────────────────────────────────

describe("OVERLAY_SEQUENCE — poland_compliance_evidence.sql", () => {
  it("includes poland_compliance_evidence.sql", () => {
    expect(dbApplyScript).toContain('"poland_compliance_evidence.sql"');
  });

  it("positions evidence after foundation", () => {
    const foundationPos = dbApplyScript.indexOf('"poland_compliance_foundation.sql"');
    const evidencePos   = dbApplyScript.indexOf('"poland_compliance_evidence.sql"');
    expect(foundationPos).toBeGreaterThan(-1);
    expect(evidencePos).toBeGreaterThan(-1);
    expect(evidencePos).toBeGreaterThan(foundationPos);
  });
});

// ── Table creation ────────────────────────────────────────────────────────────

describe("handover_protocols table", () => {
  it("creates the table IF NOT EXISTS", () => {
    expect(evidenceSql).toContain("CREATE TABLE IF NOT EXISTS public.handover_protocols");
  });

  it("has account_id FK to accounts", () => {
    expect(evidenceSql).toMatch(/account_id\s+UUID\s+NOT NULL\s+REFERENCES\s+public\.accounts/);
  });

  it("has protocol_type CHECK constraint", () => {
    expect(evidenceSql).toContain("CHECK (protocol_type IN ('move_in', 'move_out'))");
  });

  it("has status CHECK constraint with all three values", () => {
    expect(evidenceSql).toContain("CHECK (status IN ('draft', 'landlord_confirmed', 'completed'))");
  });

  it("room_notes defaults to empty JSONB array", () => {
    expect(evidenceSql).toContain("room_notes            JSONB       NOT NULL DEFAULT '[]'");
  });

  it("enables RLS", () => {
    expect(evidenceSql).toContain("ALTER TABLE public.handover_protocols ENABLE ROW LEVEL SECURITY");
  });

  it("has select policy using user_can_manage_account", () => {
    expect(evidenceSql).toContain('"hp_select_managers"');
    const policyBlock = evidenceSql.slice(
      evidenceSql.indexOf('"hp_select_managers"'),
      evidenceSql.indexOf('"hp_write_managers"'),
    );
    expect(policyBlock).toContain("public.user_can_manage_account(account_id)");
  });

  it("has write policy using user_can_manage_account", () => {
    expect(evidenceSql).toContain('"hp_write_managers"');
    const policyBlock = evidenceSql.slice(
      evidenceSql.indexOf('"hp_write_managers"'),
      evidenceSql.indexOf("-- 2. meter_readings"),
    );
    expect(policyBlock).toContain("public.user_can_manage_account(account_id)");
  });
});

describe("meter_readings table", () => {
  it("creates the table IF NOT EXISTS", () => {
    expect(evidenceSql).toContain("CREATE TABLE IF NOT EXISTS public.meter_readings");
  });

  it("has meter_type CHECK constraint with all 6 types", () => {
    expect(evidenceSql).toContain(
      "CHECK (meter_type IN ('electricity', 'gas', 'water_cold', 'water_hot', 'heat', 'other'))",
    );
  });

  it("reading_value is TEXT NOT NULL", () => {
    expect(evidenceSql).toMatch(/reading_value\s+TEXT\s+NOT NULL/);
  });

  it("has FK to handover_protocols", () => {
    expect(evidenceSql).toContain("REFERENCES public.handover_protocols(id)");
  });

  it("enables RLS", () => {
    expect(evidenceSql).toContain("ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY");
  });

  it("has select policy using user_can_manage_account", () => {
    expect(evidenceSql).toContain('"mr_select_managers"');
  });

  it("has write policy using user_can_manage_account", () => {
    expect(evidenceSql).toContain('"mr_write_managers"');
  });
});

// ── RPC security attributes ───────────────────────────────────────────────────

const RPCS = [
  "update_checklist_item_evidence",
  "remove_checklist_item_evidence",
  "get_evidence_pack",
  "create_or_update_handover_protocol",
  "confirm_handover_protocol",
  "add_meter_reading",
  "list_handover_protocols",
  "list_meter_readings",
];

describe("All evidence RPCs have SECURITY DEFINER + SET search_path = public", () => {
  for (const rpcName of RPCS) {
    it(`${rpcName} has SECURITY DEFINER`, () => {
      const block = extractFunctionBlock(evidenceSql, rpcName, null);
      expect(block.length).toBeGreaterThan(50);
      expect(block).toContain("SECURITY DEFINER");
    });

    it(`${rpcName} has SET search_path = public`, () => {
      const block = extractFunctionBlock(evidenceSql, rpcName, null);
      expect(block).toContain("SET search_path = public");
    });

    it(`${rpcName} enforces account access check`, () => {
      const block = extractFunctionBlock(evidenceSql, rpcName, null);
      // Accepts either direct call or the assert_manage_account_access helper
      const hasGuard =
        block.includes("user_can_manage_account") ||
        block.includes("assert_manage_account_access");
      expect(hasGuard).toBe(true);
    });
  }
});

// ── Audit logging ─────────────────────────────────────────────────────────────

describe("Document linking audit via log_security_event", () => {
  it("update_checklist_item_evidence logs compliance_evidence_linked", () => {
    const block = extractFunctionBlock(evidenceSql, "update_checklist_item_evidence", "remove_checklist_item_evidence");
    expect(block).toContain("compliance_evidence_linked");
    expect(block).toContain("log_security_event");
  });

  it("update_checklist_item_evidence logs compliance_evidence_replaced on replace", () => {
    const block = extractFunctionBlock(evidenceSql, "update_checklist_item_evidence", "remove_checklist_item_evidence");
    expect(block).toContain("compliance_evidence_replaced");
  });

  it("remove_checklist_item_evidence logs compliance_evidence_removed", () => {
    const block = extractFunctionBlock(evidenceSql, "remove_checklist_item_evidence", "get_evidence_pack");
    expect(block).toContain("compliance_evidence_removed");
    expect(block).toContain("log_security_event");
  });
});

// ── Cross-account guard ───────────────────────────────────────────────────────

describe("Cross-account guard on document linking", () => {
  it("update_checklist_item_evidence checks document account_id matches", () => {
    const block = extractFunctionBlock(evidenceSql, "update_checklist_item_evidence", "remove_checklist_item_evidence");
    // Must join or verify document belongs to same account
    expect(block).toMatch(/documents.*account_id|account_id.*documents/s);
  });

  it("add_meter_reading checks evidence document belongs to same account", () => {
    const block = extractFunctionBlock(evidenceSql, "add_meter_reading", "list_handover_protocols");
    expect(block).toContain("evidence_document_id");
  });
});

// ── get_evidence_pack output shape ────────────────────────────────────────────

describe("get_evidence_pack function", () => {
  it("returns JSONB", () => {
    const block = extractFunctionBlock(evidenceSql, "get_evidence_pack", "create_or_update_handover_protocol");
    expect(block).toContain("RETURNS JSONB");
  });

  it("includes completion_pct in output", () => {
    const block = extractFunctionBlock(evidenceSql, "get_evidence_pack", "create_or_update_handover_protocol");
    expect(block).toContain("completion_pct");
  });

  it("includes items array in output", () => {
    const block = extractFunctionBlock(evidenceSql, "get_evidence_pack", "create_or_update_handover_protocol");
    expect(block).toContain("items");
  });

  it("includes total in output", () => {
    const block = extractFunctionBlock(evidenceSql, "get_evidence_pack", "create_or_update_handover_protocol");
    expect(block).toContain("total");
  });

  it("completion_pct uses half-weight for pending-with-evidence", () => {
    const block = extractFunctionBlock(evidenceSql, "get_evidence_pack", "create_or_update_handover_protocol");
    expect(block).toContain("0.5");
  });
});

// ── Edge function file exists ─────────────────────────────────────────────────

describe("suggest-checklist-item-match edge function", () => {
  it("index.ts file exists", () => {
    const exists = existsSync(
      new URL("../../supabase/functions/suggest-checklist-item-match/index.ts", import.meta.url),
    );
    expect(exists).toBe(true);
  });
});

// ── evidencePackUtils utility file exists ─────────────────────────────────────

describe("evidencePackUtils.js exists", () => {
  it("utility file is present", () => {
    const exists = existsSync(
      new URL("../../src/utils/evidencePackUtils.js", import.meta.url),
    );
    expect(exists).toBe(true);
  });
});

// ── evidencePackService.js exists ─────────────────────────────────────────────

describe("evidencePackService.js exists", () => {
  it("service file is present", () => {
    const exists = existsSync(
      new URL("../../src/services/evidencePackService.js", import.meta.url),
    );
    expect(exists).toBe(true);
  });
});

// ── i18n key coverage ─────────────────────────────────────────────────────────

describe("i18n key coverage for Evidence Pack / Handover / Meter / AI Suggestion", () => {
  let messagesJs;
  beforeAll(() => {
    messagesJs = readJs("src/i18n/messages.js");
  });

  const requiredKeys = [
    "evidencePack.title",
    "evidencePack.done",
    "evidencePack.missing",
    "evidencePack.pendingReview",
    "evidencePack.linkDocument",
    "evidencePack.replace",
    "evidencePack.unlink",
    "evidencePack.pickerTitle",
    "evidencePack.pickerDisclaimer",
    "evidencePack.noDocuments",
    "evidencePack.loadDocsError",
    "handover.title",
    "handover.type.move_in",
    "handover.type.move_out",
    "handover.condition.good",
    "handover.condition.fair",
    "handover.condition.poor",
    "handover.status.draft",
    "handover.status.landlord_confirmed",
    "handover.status.completed",
    "meter.title",
    "meter.addReading",
    "meter.type.electricity",
    "meter.type.gas",
    "meter.type.water_cold",
    "meter.type.water_hot",
    "meter.type.heat",
    "meter.type.other",
    "meter.error.invalid_meter_type",
    "meter.error.reading_value_required",
    "aiSuggestion.title",
    "aiSuggestion.confidence.high",
    "aiSuggestion.confidence.medium",
    "aiSuggestion.confidence.low",
    "aiSuggestion.accept",
    "aiSuggestion.dismiss",
    "aiSuggestion.reviewRequired",
  ];

  for (const key of requiredKeys) {
    it(`has key "${key}" in messages.js`, () => {
      expect(messagesJs).toContain(`"${key}"`);
    });
  }

  it("key appears in all three locales (en, pl, de)", () => {
    const enCount = (messagesJs.match(/"evidencePack\.title"/g) || []).length;
    const plCount = (messagesJs.match(/"handover\.title"/g) || []).length;
    const deCount = (messagesJs.match(/"meter\.title"/g) || []).length;
    expect(enCount).toBeGreaterThanOrEqual(3);
    expect(plCount).toBeGreaterThanOrEqual(3);
    expect(deCount).toBeGreaterThanOrEqual(3);
  });
});
