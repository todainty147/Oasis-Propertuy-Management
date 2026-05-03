// tests/security/rentersRightsContracts.test.js
//
// Contract and security tests for the Renters' Rights Readiness module.
//
// These tests run without a live database — they verify:
//   1. Service layer parsing and null-safety
//   2. i18n key coverage (EN/PL/DE)
//   3. UI contract: disclaimer is present and correct
//   4. UI contract: status badge renders correctly
//   5. Permission contract: feature key is in the Growth entitlement set
//   6. Legal safety contract: no string in the module claims legal validity
//
// Integration/RLS tests (require live Supabase harness) live in:
//   tests/integration/rentersRightsBackendSecurity.test.js (Phase 2)

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Service layer ─────────────────────────────────────────────────────────────

import { parseRrTaskRow } from "../../src/services/rentersRightsService.js";

describe("parseRrTaskRow", () => {
  it("returns null for null input", () => {
    expect(parseRrTaskRow(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseRrTaskRow(undefined)).toBeNull();
  });

  it("maps all fields from a complete row", () => {
    const row = {
      id:               "task-001",
      account_id:       "acct-001",
      property_id:      "prop-001",
      tenant_id:        "ten-001",
      lease_id:         "lease-001",
      requirement_type: "renters_rights_information_sheet",
      jurisdiction:     "GB-ENG",
      due_date:         "2026-05-31",
      status:           "required",
      sent_at:          null,
      sent_by:          null,
      delivery_method:  null,
      document_id:      null,
      notes:            null,
      metadata:         {},
      created_at:       "2026-05-01T00:00:00Z",
      updated_at:       "2026-05-01T00:00:00Z",
      tenant_name:      "Alice Smith",
      property_address: "12 Oak Lane",
    };
    const parsed = parseRrTaskRow(row);
    expect(parsed.id).toBe("task-001");
    expect(parsed.accountId).toBe("acct-001");
    expect(parsed.tenantId).toBe("ten-001");
    expect(parsed.status).toBe("required");
    expect(parsed.jurisdiction).toBe("GB-ENG");
    expect(parsed.tenantName).toBe("Alice Smith");
    expect(parsed.propertyAddress).toBe("12 Oak Lane");
    expect(parsed.metadata).toEqual({});
  });

  it("applies fallback values for missing fields", () => {
    const parsed = parseRrTaskRow({});
    expect(parsed.requirementType).toBe("renters_rights_information_sheet");
    expect(parsed.jurisdiction).toBe("GB-ENG");
    expect(parsed.status).toBe("required");
    expect(parsed.tenantName).toBe("—");
    expect(parsed.propertyAddress).toBe("—");
    expect(parsed.metadata).toEqual({});
  });

  it("preserves all known status values without mutation", () => {
    const statuses = ["not_required", "required", "sent", "evidence_uploaded", "reviewed", "overdue"];
    for (const status of statuses) {
      const parsed = parseRrTaskRow({ status });
      expect(parsed.status).toBe(status);
    }
  });
});

// ── Service: input guards ─────────────────────────────────────────────────────

import {
  listRentersRightsTasks,
  markRrTaskSent,
  setRrTaskNotRequired,
  linkRrTaskDocument,
  upsertRentersRightsTask,
  createRrTasksForActiveTenants,
} from "../../src/services/rentersRightsService.js";

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

describe("rentersRightsService input guards", () => {
  it("listRentersRightsTasks returns [] when accountId is missing", async () => {
    const result = await listRentersRightsTasks({ accountId: null });
    expect(result).toEqual([]);
  });

  it("listRrAttentionItems returns [] when accountId is missing", async () => {
    const { listRrAttentionItems } = await import("../../src/services/rentersRightsService.js");
    const result = await listRrAttentionItems({ accountId: null });
    expect(result).toEqual([]);
  });

  it("upsertRentersRightsTask throws when accountId is missing", async () => {
    await expect(upsertRentersRightsTask({ accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("createRrTasksForActiveTenants throws when accountId is missing", async () => {
    await expect(createRrTasksForActiveTenants({ accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("markRrTaskSent throws when taskId is missing", async () => {
    await expect(markRrTaskSent({ taskId: null, accountId: "a", deliveryMethod: "email" })).rejects.toThrow("Missing taskId");
  });

  it("markRrTaskSent throws when accountId is missing", async () => {
    await expect(markRrTaskSent({ taskId: "t", accountId: null, deliveryMethod: "email" })).rejects.toThrow("Missing accountId");
  });

  it("markRrTaskSent throws when deliveryMethod is missing", async () => {
    await expect(markRrTaskSent({ taskId: "t", accountId: "a", deliveryMethod: null })).rejects.toThrow("Missing deliveryMethod");
  });

  it("setRrTaskNotRequired throws when taskId is missing", async () => {
    await expect(setRrTaskNotRequired({ taskId: null, accountId: "a" })).rejects.toThrow("Missing taskId");
  });

  it("setRrTaskNotRequired throws when accountId is missing", async () => {
    await expect(setRrTaskNotRequired({ taskId: "t", accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("linkRrTaskDocument throws when documentId is missing", async () => {
    await expect(linkRrTaskDocument({ taskId: "t", accountId: "a", documentId: null })).rejects.toThrow("Missing documentId");
  });
});

// ── Feature entitlement contract ──────────────────────────────────────────────

import { ENTITLEMENT_FEATURES, getPlanFeatures } from "../../src/lib/entitlements.js";

describe("renters_rights_readiness entitlement contract", () => {
  it("RENTERS_RIGHTS_READINESS key exists in ENTITLEMENT_FEATURES", () => {
    expect(ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS).toBe("renters_rights_readiness");
  });

  it("renters_rights_readiness is included in growth plan", () => {
    const growthFeatures = getPlanFeatures("growth");
    expect(growthFeatures).toContain("renters_rights_readiness");
  });

  it("renters_rights_readiness is included in pro plan (inherits growth)", () => {
    const proFeatures = getPlanFeatures("pro");
    expect(proFeatures).toContain("renters_rights_readiness");
  });

  it("renters_rights_readiness is NOT included in starter plan", () => {
    const starterFeatures = getPlanFeatures("starter");
    expect(starterFeatures).not.toContain("renters_rights_readiness");
  });
});

// ── i18n key coverage ─────────────────────────────────────────────────────────

import { messages } from "../../src/i18n/messages.js";

const REQUIRED_RR_KEYS = [
  "rentersRights.title",
  "rentersRights.subtitle",
  "rentersRights.jurisdictionBadge",
  "rentersRights.disclaimer",
  "rentersRights.tab.overview",
  "rentersRights.tab.informationSheets",
  "rentersRights.tab.tenancyReview",
  "rentersRights.tab.rentReviews",
  "rentersRights.tab.petRequests",
  "rentersRights.tab.possessionEvidence",
  "rentersRights.tab.timeline",
  "rentersRights.informationSheet.govUkNotice",
  "rentersRights.informationSheet.status.required",
  "rentersRights.informationSheet.status.sent",
  "rentersRights.informationSheet.status.overdue",
  "rentersRights.informationSheet.status.not_required",
  "rentersRights.informationSheet.markSent",
  "rentersRights.informationSheet.markNotRequired",
  "rentersRights.informationSheet.syncTenants",
  "rentersRights.stat.required",
  "rentersRights.stat.overdue",
  "rentersRights.stat.sent",
  "rentersRights.stat.notRequired",
  "rentersRights.table.tenant",
  "rentersRights.table.property",
  "rentersRights.table.status",
  "rentersRights.table.actions",
];

describe("i18n key coverage — Polish (pl)", () => {
  for (const key of REQUIRED_RR_KEYS) {
    it(`pl has key: ${key}`, () => {
      expect(messages.pl[key]).toBeTruthy();
    });
  }
});

describe("i18n key coverage — English (en)", () => {
  for (const key of REQUIRED_RR_KEYS) {
    it(`en has key: ${key}`, () => {
      expect(messages.en[key]).toBeTruthy();
    });
  }
});

describe("i18n key coverage — German (de)", () => {
  for (const key of REQUIRED_RR_KEYS) {
    it(`de has key: ${key}`, () => {
      expect(messages.de[key]).toBeTruthy();
    });
  }
});

// ── Legal safety contract ─────────────────────────────────────────────────────
// The disclaimer must be present. No string may claim legal validity,
// government certification, or compliance certification.

const FORBIDDEN_LEGAL_CLAIM_PATTERNS = [
  /legally\s+valid/i,
  /legally\s+compliant/i,
  /certified\s+compliant/i,
  /government\s+certified/i,
  /guarantees\s+compliance/i,
  /this\s+is\s+legal\s+advice/i,
  /constitutes\s+legal\s+advice/i,
];

describe("legal safety contract — disclaimer present", () => {
  it("EN disclaimer exists and is non-empty", () => {
    const d = messages.en["rentersRights.disclaimer"];
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(20);
  });

  it("EN disclaimer contains 'not provide legal advice' or equivalent", () => {
    const d = messages.en["rentersRights.disclaimer"];
    const hasDisclaimer =
      /not\s+provide\s+legal\s+advice/i.test(d) ||
      /does\s+not.*legal\s+advice/i.test(d) ||
      /not.*rechtsberatung/i.test(d);
    expect(hasDisclaimer).toBe(true);
  });

  it("EN jurisdiction badge says England, not a legal jurisdiction claim", () => {
    const badge = messages.en["rentersRights.jurisdictionBadge"];
    expect(badge).toBe("England");
  });
});

describe("legal safety contract — no forbidden claims", () => {
  // The disclaimer key intentionally references these concepts in order to
  // disclaim them. All other rentersRights.* strings are checked.
  const rrEnKeys = Object.entries(messages.en)
    .filter(([k]) => k.startsWith("rentersRights.") && k !== "rentersRights.disclaimer")
    .map(([, v]) => v);

  for (const pattern of FORBIDDEN_LEGAL_CLAIM_PATTERNS) {
    it(`no EN string matches forbidden pattern: ${pattern.source}`, () => {
      const match = rrEnKeys.find((v) => pattern.test(String(v || "")));
      expect(match).toBeUndefined();
    });
  }
});

// ── PL/DE disclaimer negation verification ────────────────────────────────────

describe("legal safety contract — PL/DE disclaimers contain negation", () => {
  it("pl disclaimer contains negation of legal advice", () => {
    const d = messages.pl["rentersRights.disclaimer"];
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(20);
    // Polish negation: "Nie stanowią porady prawnej" or "nie" + "prawne/prawnej"
    const hasNegation = /nie\s+stanowi|nie\s+jest|nie\s+udziel|nie\s+determinuj/i.test(d);
    expect(hasNegation).toBe(true);
  });

  it("de disclaimer contains negation of legal advice", () => {
    const d = messages.de["rentersRights.disclaimer"];
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(20);
    // German negation: "keine Rechtsberatung" or "nicht" + "rechtlich"
    const hasNegation = /keine\s+Rechtsberatung|handelt\s+sich\s+nicht|nicht\s+um\s+Rechts/i.test(d);
    expect(hasNegation).toBe(true);
  });
});

// ── Sync idempotency contract (structural) ────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("create_rr_tasks_for_active_tenants idempotency contract", () => {
  it("SQL uses NOT EXISTS sub-query preventing duplicates (set-based INSERT)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/renters_rights_readiness.sql"), "utf8");
    expect(sql).toContain("not exists");
    expect(sql).toContain("get diagnostics v_count = row_count");
  });

  it("createRrTasksForActiveTenants throws when accountId is missing", async () => {
    await expect(createRrTasksForActiveTenants({ accountId: null })).rejects.toThrow("Missing accountId");
  });
});

// ── Attention Center item_type contract ───────────────────────────────────────

describe("attention center item_type contract", () => {
  const KNOWN_RR_ITEM_TYPES = [
    "renters_rights_information_sheet_overdue",
    "renters_rights_information_sheet_due",
  ];

  it("all known RR item_types have corresponding i18n keys", () => {
    // Map item_type → expected i18n key prefix
    const mapping = {
      renters_rights_information_sheet_overdue: "rentersRights.attentionCenter.informationSheetOverdue",
      renters_rights_information_sheet_due:     "rentersRights.attentionCenter.informationSheetDue",
    };
    for (const [, key] of Object.entries(mapping)) {
      expect(messages.en[key]).toBeTruthy();
    }
  });
});
