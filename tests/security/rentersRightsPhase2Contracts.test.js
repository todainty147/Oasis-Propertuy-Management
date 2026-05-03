// tests/security/rentersRightsPhase2Contracts.test.js
//
// Contract tests for Phase 2 — Tenancy Review Prompts and Rent Review Records.
//
// Covers:
//   1. parseReviewPromptRow — field extraction from metadata
//   2. parseRentReviewRow — field mapping and null safety
//   3. Service input guards for all Phase 2 functions
//   4. Rent review docType guard ('evidence' | 'notice')
//   5. SQL structural checks (idempotency, table definitions)
//   6. i18n key coverage for Phase 2 strings (EN/PL/DE)
//   7. Legal safety — no forbidden claims in Phase 2 strings

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));
vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

import {
  parseReviewPromptRow,
  parseRentReviewRow,
  generateTenancyReviewPrompts,
  dismissTenancyReviewPrompt,
  listRentReviewRecords,
  createRentReviewRecord,
  updateRentReviewStatus,
  linkRentReviewDocument,
} from "../../src/services/rentersRightsService.js";

// ── parseReviewPromptRow ──────────────────────────────────────────────────────

describe("parseReviewPromptRow", () => {
  it("returns null for null input", () => {
    expect(parseReviewPromptRow(null)).toBeNull();
  });

  it("extracts finding_type from metadata", () => {
    const row = {
      id: "p1", account_id: "a1", status: "required",
      requirement_type: "tenancy_review_prompt",
      metadata: { finding_type: "fixed_term_post_reform", severity: "warning",
                   explanation: "review this", suggested_action: "see adviser" },
    };
    const parsed = parseReviewPromptRow(row);
    expect(parsed.findingType).toBe("fixed_term_post_reform");
    expect(parsed.severity).toBe("warning");
    expect(parsed.explanation).toBe("review this");
    expect(parsed.suggestedAction).toBe("see adviser");
  });

  it("falls back to 'info' severity when not set", () => {
    const parsed = parseReviewPromptRow({ id: "p2", account_id: "a1", metadata: {} });
    expect(parsed.severity).toBe("info");
  });

  it("all known finding_types produce non-empty findingType", () => {
    const findings = [
      "fixed_term_post_reform",
      "lease_expiring_soon",
      "short_notice_period",
      "renewal_in_progress",
    ];
    for (const ft of findings) {
      const p = parseReviewPromptRow({ id: "x", account_id: "a", metadata: { finding_type: ft } });
      expect(p.findingType).toBe(ft);
    }
  });
});

// ── parseRentReviewRow ────────────────────────────────────────────────────────

describe("parseRentReviewRow", () => {
  it("returns null for null input", () => {
    expect(parseRentReviewRow(null)).toBeNull();
  });

  it("maps all standard fields", () => {
    const row = {
      id: "rr1", account_id: "a1", property_id: "p1", tenant_id: "t1",
      current_rent: "1200.00", proposed_rent: "1350.50",
      proposed_effective_date: "2026-09-01", status: "evidence_needed",
      tenant_name: "Bob", property_address: "5 Elm St",
      created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z",
    };
    const p = parseRentReviewRow(row);
    expect(p.id).toBe("rr1");
    expect(p.currentRent).toBe(1200);
    expect(p.proposedRent).toBe(1350.5);
    expect(p.proposedEffectiveDate).toBe("2026-09-01");
    expect(p.status).toBe("evidence_needed");
    expect(p.tenantName).toBe("Bob");
    expect(p.propertyAddress).toBe("5 Elm St");
  });

  it("null rents stay null", () => {
    const p = parseRentReviewRow({ id: "r2", account_id: "a", current_rent: null, proposed_rent: null });
    expect(p.currentRent).toBeNull();
    expect(p.proposedRent).toBeNull();
  });

  it("defaults status to 'draft' when missing", () => {
    const p = parseRentReviewRow({ id: "r3", account_id: "a" });
    expect(p.status).toBe("draft");
  });

  it("all valid statuses map correctly", () => {
    const statuses = ["draft","evidence_needed","ready_for_review","sent","challenged","completed","cancelled"];
    for (const s of statuses) {
      expect(parseRentReviewRow({ id: "x", account_id: "a", status: s }).status).toBe(s);
    }
  });
});

// ── Service input guards ──────────────────────────────────────────────────────

describe("Phase 2 service input guards", () => {
  it("generateTenancyReviewPrompts throws when accountId is missing", async () => {
    await expect(generateTenancyReviewPrompts({ accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("dismissTenancyReviewPrompt throws when taskId is missing", async () => {
    await expect(dismissTenancyReviewPrompt({ taskId: null, accountId: "a" })).rejects.toThrow("Missing taskId");
  });

  it("dismissTenancyReviewPrompt throws when accountId is missing", async () => {
    await expect(dismissTenancyReviewPrompt({ taskId: "t", accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("listRentReviewRecords returns [] when accountId is missing", async () => {
    expect(await listRentReviewRecords({ accountId: null })).toEqual([]);
  });

  it("createRentReviewRecord throws when accountId is missing", async () => {
    await expect(createRentReviewRecord({ accountId: null })).rejects.toThrow("Missing accountId");
  });

  it("updateRentReviewStatus throws when recordId is missing", async () => {
    await expect(updateRentReviewStatus({ recordId: null, accountId: "a", status: "draft" })).rejects.toThrow("Missing recordId");
  });

  it("updateRentReviewStatus throws when accountId is missing", async () => {
    await expect(updateRentReviewStatus({ recordId: "r", accountId: null, status: "draft" })).rejects.toThrow("Missing accountId");
  });

  it("updateRentReviewStatus throws when status is missing", async () => {
    await expect(updateRentReviewStatus({ recordId: "r", accountId: "a", status: null })).rejects.toThrow("Missing status");
  });

  it("linkRentReviewDocument throws when recordId is missing", async () => {
    await expect(linkRentReviewDocument({ recordId: null, accountId: "a", documentId: "d", docType: "evidence" })).rejects.toThrow("Missing recordId");
  });

  it("linkRentReviewDocument throws when documentId is missing", async () => {
    await expect(linkRentReviewDocument({ recordId: "r", accountId: "a", documentId: null, docType: "evidence" })).rejects.toThrow("Missing documentId");
  });

  it("linkRentReviewDocument throws for invalid docType", async () => {
    await expect(linkRentReviewDocument({ recordId: "r", accountId: "a", documentId: "d", docType: "contract" }))
      .rejects.toThrow("docType must be 'evidence' or 'notice'");
  });

  it("linkRentReviewDocument accepts 'evidence'", async () => {
    await expect(linkRentReviewDocument({ recordId: "r", accountId: "a", documentId: "d", docType: "evidence" }))
      .rejects.toThrow(/returned no data/);
  });

  it("linkRentReviewDocument accepts 'notice'", async () => {
    await expect(linkRentReviewDocument({ recordId: "r", accountId: "a", documentId: "d", docType: "notice" }))
      .rejects.toThrow(/returned no data/);
  });
});

// ── SQL structural checks ─────────────────────────────────────────────────────

const phase2Sql = readFileSync(join(process.cwd(), "supabase/renters_rights_phase2.sql"), "utf8");

describe("Phase 2 SQL structural contracts", () => {
  it("creates rent_review_records table", () => {
    expect(phase2Sql).toContain("create table if not exists public.rent_review_records");
  });

  it("rent_review_records has RLS enabled", () => {
    expect(phase2Sql).toContain("alter table public.rent_review_records enable row level security");
  });

  it("rent_review_records RLS policy uses is_account_manager", () => {
    expect(phase2Sql).toContain("public.is_account_manager(account_id, auth.uid())");
  });

  it("all write RPCs call assert_account_feature_access", () => {
    const rpcCount = (phase2Sql.match(/perform public\.assert_account_feature_access/g) || []).length;
    expect(rpcCount).toBeGreaterThanOrEqual(5);
  });

  it("generate_tenancy_review_prompts uses NOT EXISTS for dedup", () => {
    expect(phase2Sql).toContain("not exists");
  });

  it("generate_tenancy_review_prompts resets only 'required' prompts, preserving 'reviewed'", () => {
    expect(phase2Sql).toContain("and status           = 'required'");
  });

  it("all RPCs have REVOKE ALL + GRANT to authenticated", () => {
    const revokes = (phase2Sql.match(/revoke all\s+on function public\./gi) || []).length;
    const grants  = (phase2Sql.match(/grant execute on function public\./gi) || []).length;
    expect(revokes).toBeGreaterThanOrEqual(6);
    expect(grants).toBeGreaterThanOrEqual(6);
  });

  it("all RPCs use SECURITY DEFINER and set search_path", () => {
    expect(phase2Sql).toContain("security definer");
    expect(phase2Sql).toContain("set search_path = public");
  });

  it("link_rent_review_document validates p_doc_type at DB level", () => {
    expect(phase2Sql).toContain("p_doc_type not in ('evidence', 'notice')");
  });

  it("updated attention items function covers all three item types", () => {
    expect(phase2Sql).toContain("renters_rights_information_sheet_overdue");
    expect(phase2Sql).toContain("renters_rights_lease_review_needed");
    expect(phase2Sql).toContain("renters_rights_rent_review_needs_evidence");
  });
});

// ── i18n key coverage for Phase 2 ────────────────────────────────────────────

import { messages } from "../../src/i18n/messages.js";

const PHASE2_REQUIRED_KEYS = [
  "rentersRights.attentionCenter.leaseReviewNeeded",
  "rentersRights.attentionCenter.rentReviewNeedsEvidence",
  "rentersRights.tenancyReview.disclaimer",
  "rentersRights.tenancyReview.runChecks",
  "rentersRights.tenancyReview.markReviewed",
  "rentersRights.tenancyReview.empty",
  "rentersRights.rentReview.disclaimer",
  "rentersRights.rentReview.create",
  "rentersRights.rentReview.currentRent",
  "rentersRights.rentReview.proposedRent",
  "rentersRights.rentReview.status.draft",
  "rentersRights.rentReview.status.evidence_needed",
  "rentersRights.rentReview.status.completed",
];

for (const locale of ["en", "pl", "de"]) {
  describe(`Phase 2 i18n — ${locale}`, () => {
    for (const key of PHASE2_REQUIRED_KEYS) {
      it(`${locale} has key: ${key}`, () => {
        expect(messages[locale][key]).toBeTruthy();
      });
    }
  });
}

// ── Legal safety — Phase 2 strings ───────────────────────────────────────────

const FORBIDDEN = [
  /legally\s+valid/i,
  /legally\s+compliant/i,
  /guarantees\s+compliance/i,
  /this\s+is\s+legal\s+advice/i,
];

describe("Phase 2 legal safety — no forbidden claims", () => {
  const phase2EnKeys = Object.entries(messages.en)
    .filter(([k]) => k.startsWith("rentersRights.") && !k.endsWith(".disclaimer"))
    .map(([, v]) => v);

  for (const pattern of FORBIDDEN) {
    it(`no EN Phase 2 string matches: ${pattern.source}`, () => {
      const match = phase2EnKeys.find((v) => pattern.test(String(v || "")));
      expect(match).toBeUndefined();
    });
  }

  it("Phase 2 EN tenancy review disclaimer contains 'not legal advice'", () => {
    const d = messages.en["rentersRights.tenancyReview.disclaimer"];
    expect(/not\s+legal\s+advice/i.test(d)).toBe(true);
  });

  it("Phase 2 EN rent review disclaimer says OASIS does not approve increases", () => {
    const d = messages.en["rentersRights.rentReview.disclaimer"];
    expect(/does\s+not\s+approve|not.*validate/i.test(d)).toBe(true);
  });
});
