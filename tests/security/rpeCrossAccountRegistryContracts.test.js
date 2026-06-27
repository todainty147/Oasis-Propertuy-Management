import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "../integration/helpers/localSupabaseHarness.js";

// ---------------------------------------------------------------------------
// RPE SQL sources — the schema under test
// ---------------------------------------------------------------------------

const RPE_SQL_FILE_NAMES = [
  "regulatory_proof_engine_vs0.sql",
  "regulatory_proof_engine_vs1.sql",
  "regulatory_proof_engine_vs2a_capture.sql",
  "regulatory_proof_engine_vs2b_obligations.sql",
  "regulatory_proof_engine_vs2c_discharge.sql",
  "regulatory_proof_engine_vs2d_basis_review.sql",
];

const rpeSqlSources = RPE_SQL_FILE_NAMES.map((f) =>
  readFileSync(join(process.cwd(), "supabase", f), "utf8"),
);
const allRpeSql = rpeSqlSources.join("\n");

// ---------------------------------------------------------------------------
// Fixture IDs
// ---------------------------------------------------------------------------

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const LEASE_ID = "8b4f16d3-2a79-4787-ae54-01e4c6e2d001";
const FAKE_RESOURCE_ID = "00000000-0000-4000-a000-000000000099";

// ---------------------------------------------------------------------------
// Registry — every account-scoped RPE RPC, with args for both attack shapes
// ---------------------------------------------------------------------------
// Shape 1: foreign account id (fails at user_can_manage_account)
// Shape 2: own account id + foreign resource id (fails at ownership check)
//
// shape2 is null for RPCs that take only p_account_id with no resource param.
// ---------------------------------------------------------------------------

const CROSS_ACCOUNT_REGISTRY = [
  // VS-0
  {
    name: "get_rra_info_sheet_data_readiness",
    shape1: { p_account_id: accountAId, p_lease_id: LEASE_ID },
    shape2: {
      args: { p_account_id: accountBId, p_lease_id: LEASE_ID },
      label: "foreign lease",
    },
  },
  // VS-1
  {
    name: "record_rra_info_sheet_rule_evaluation",
    shape1: {
      p_account_id: accountAId,
      p_tenancy_id: LEASE_ID,
      p_input_snapshot: {},
      p_decision_path: ["test"],
      p_result: "not_affected",
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_tenancy_id: LEASE_ID,
        p_input_snapshot: {},
        p_decision_path: ["test"],
        p_result: "not_affected",
        p_demo_mode: true,
      },
      label: "foreign tenancy (lease)",
    },
  },
  {
    name: "list_rra_info_sheet_rule_evaluations",
    shape1: { p_account_id: accountAId },
    shape2: null,
  },
  {
    name: "rra_info_sheet_evaluation_summary",
    shape1: { p_account_id: accountAId },
    shape2: null,
  },
  // VS-2A
  {
    name: "capture_rra_jurisdiction",
    shape1: {
      p_account_id: accountAId,
      p_property_id: propertyId,
      p_country_subdivision: "England",
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_property_id: propertyId,
        p_country_subdivision: "England",
        p_demo_mode: true,
      },
      label: "foreign property",
    },
  },
  {
    name: "capture_rra_term_indicator",
    shape1: {
      p_account_id: accountAId,
      p_lease_id: LEASE_ID,
      p_term_type: "periodic",
      p_term_type_effective_from: "2024-06-01",
      p_term_type_evidence_basis: "cross-account-attack-test",
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_lease_id: LEASE_ID,
        p_term_type: "periodic",
        p_term_type_effective_from: "2024-06-01",
        p_term_type_evidence_basis: "cross-account-attack-test",
        p_demo_mode: true,
      },
      label: "foreign lease",
    },
  },
  {
    name: "capture_rra_tier4_classification",
    shape1: {
      p_account_id: accountAId,
      p_lease_id: LEASE_ID,
      p_tenancy_class: "assured_shorthold",
      p_company_let: true,
      p_resident_landlord: false,
      p_rent_act_1977: false,
      p_pbsa: false,
      p_is_wholly_oral: false,
      p_evidence_basis: "cross-account-attack-test",
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_lease_id: LEASE_ID,
        p_tenancy_class: "assured_shorthold",
        p_company_let: true,
        p_resident_landlord: false,
        p_rent_act_1977: false,
        p_pbsa: false,
        p_is_wholly_oral: false,
        p_evidence_basis: "cross-account-attack-test",
        p_demo_mode: true,
      },
      label: "foreign lease",
    },
  },
  {
    name: "get_rra_capture_readiness",
    shape1: { p_account_id: accountAId, p_lease_id: LEASE_ID },
    shape2: {
      args: { p_account_id: accountBId, p_lease_id: LEASE_ID },
      label: "foreign lease",
    },
  },
  // VS-2C
  {
    name: "capture_rra_info_sheet_service_evidence",
    shape1: {
      p_account_id: accountAId,
      p_obligation_instance_id: FAKE_RESOURCE_ID,
      p_official_info_sheet_identity: "test-identity",
      p_service_evidence_timestamp: "2026-01-01T00:00:00Z",
      p_evidence_type: "manual_attestation",
      p_evidence_basis: "cross-account-attack-test",
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_obligation_instance_id: FAKE_RESOURCE_ID,
        p_official_info_sheet_identity: "test-identity",
        p_service_evidence_timestamp: "2026-01-01T00:00:00Z",
        p_evidence_type: "manual_attestation",
        p_evidence_basis: "cross-account-attack-test",
        p_demo_mode: true,
      },
      label: "foreign obligation",
    },
  },
  {
    name: "reconcile_rra_info_sheet_obligation_discharge",
    shape1: {
      p_account_id: accountAId,
      p_obligation_instance_id: FAKE_RESOURCE_ID,
      p_service_evidence_id: FAKE_RESOURCE_ID,
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_obligation_instance_id: FAKE_RESOURCE_ID,
        p_service_evidence_id: FAKE_RESOURCE_ID,
        p_demo_mode: true,
      },
      label: "foreign obligation + evidence",
    },
  },
  {
    name: "reconcile_rra_info_sheet_obligation",
    shape1: {
      p_account_id: accountAId,
      p_evaluation_id: FAKE_RESOURCE_ID,
      p_demo_mode: true,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_evaluation_id: FAKE_RESOURCE_ID,
        p_demo_mode: true,
      },
      label: "foreign evaluation",
    },
  },
  {
    name: "list_rra_obligation_instances",
    shape1: { p_account_id: accountAId },
    shape2: null,
  },
  {
    name: "rra_obligation_posture_summary",
    shape1: { p_account_id: accountAId },
    shape2: null,
  },
  {
    name: "list_rra_info_sheet_service_evidence",
    shape1: {
      p_account_id: accountAId,
      p_obligation_instance_id: FAKE_RESOURCE_ID,
    },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_obligation_instance_id: FAKE_RESOURCE_ID,
      },
      label: "foreign obligation",
    },
  },
  // VS-2D
  {
    name: "list_obligation_basis_reviews",
    shape1: { p_account_id: accountAId },
    shape2: {
      args: {
        p_account_id: accountBId,
        p_obligation_instance_id: FAKE_RESOURCE_ID,
      },
      label: "foreign obligation",
    },
  },
];

const REGISTERED_NAMES = new Set(CROSS_ACCOUNT_REGISTRY.map((r) => r.name));

// ---------------------------------------------------------------------------
// Internal helpers — account-scoped RPE functions that are REVOKED from public
// (not callable by authenticated users, so cross-account testing is moot).
// If a new internal helper with p_account_id is added, the completeness check
// will flag it — add it here with a reason.
// ---------------------------------------------------------------------------

const INTERNAL_HELPERS = new Set([
  "record_rpe_obligation_discharged_event",
  "record_rpe_discharged_basis_changed_flag_event",
  "record_rpe_obligation_transition_event",
  "record_rpe_basis_change_recorded_event",
]);

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

function discoverAccountScopedFunctions(sqlSources) {
  const names = new Set();
  for (const sql of sqlSources) {
    const blocks = sql.split(/create\s+or\s+replace\s+function\s+public\./gi);
    for (const block of blocks.slice(1)) {
      const nameMatch = block.match(/^(\w+)\s*\(/);
      if (!nameMatch) continue;
      const paramSection = block.slice(0, block.indexOf(")") + 1);
      if (/p_account_id/i.test(paramSection)) {
        names.add(nameMatch[1]);
      }
    }
  }
  return names;
}

function isGrantedToAuthenticated(name, combinedSql) {
  return new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\b[^;]*to\\s+authenticated`,
    "i",
  ).test(combinedSql);
}

// ===========================================================================
// Part 2 — ★ Completeness check (structural, always runs)
// ===========================================================================
// Discovery signal: presence of a p_account_id parameter in the function
// signature. This is the correct proxy for the current RPE surface — all
// account-scoped RPCs take p_account_id. If a future account-scoped RPC
// enforces scope via a DIFFERENT parameter shape (no p_account_id), this
// discovery query must be widened to include that signal.
// ===========================================================================

describe("RPE cross-account registry completeness", () => {
  it("discovers RPE SQL files — no new overlay missing from the file list", () => {
    const onDisk = readdirSync(join(process.cwd(), "supabase"))
      .filter((f) => f.startsWith("regulatory_proof_engine_") && f.endsWith(".sql"))
      .sort();
    expect(onDisk).toEqual(RPE_SQL_FILE_NAMES.slice().sort());
  });

  it("every authenticated account-scoped RPE RPC is registered in the cross-account test", () => {
    const discovered = discoverAccountScopedFunctions(rpeSqlSources);
    const unregistered = [];

    for (const name of discovered) {
      if (INTERNAL_HELPERS.has(name)) continue;
      if (!isGrantedToAuthenticated(name, allRpeSql)) continue;
      if (!REGISTERED_NAMES.has(name)) {
        unregistered.push(name);
      }
    }

    if (unregistered.length > 0) {
      throw new Error(
        `Account-scoped RPE RPCs not registered in the cross-account test:\n` +
        unregistered.map((n) => `  - ${n} (takes p_account_id, granted to authenticated)`).join("\n") +
        `\nAdd each to CROSS_ACCOUNT_REGISTRY with Shape 1 + Shape 2 args, then confirm it throws.`,
      );
    }
  });

  it("internal helpers with p_account_id are revoked from authenticated (not user-callable)", () => {
    for (const name of INTERNAL_HELPERS) {
      const grantPattern = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\b[^;]*to\\s+authenticated`,
        "i",
      );
      expect(
        grantPattern.test(allRpeSql),
        `${name} is listed as internal but has a grant to authenticated — move it to CROSS_ACCOUNT_REGISTRY`,
      ).toBe(false);
    }
  });

  it("no registered RPC is missing from the RPE SQL files", () => {
    const discovered = discoverAccountScopedFunctions(rpeSqlSources);
    for (const entry of CROSS_ACCOUNT_REGISTRY) {
      expect(
        discovered.has(entry.name),
        `${entry.name} is registered but not found in RPE SQL files — stale registry entry?`,
      ).toBe(true);
    }
  });

  it("every registered RPC with a resource param has a Shape 2 entry", () => {
    for (const entry of CROSS_ACCOUNT_REGISTRY) {
      const hasResourceParam = Object.keys(entry.shape1).some(
        (k) => k !== "p_account_id" && k !== "p_demo_mode" && k.startsWith("p_") &&
          !["p_input_snapshot", "p_decision_path", "p_result", "p_term_type",
            "p_term_type_effective_from", "p_term_type_evidence_basis",
            "p_country_subdivision", "p_tenancy_class", "p_company_let",
            "p_resident_landlord", "p_rent_act_1977", "p_pbsa", "p_is_wholly_oral",
            "p_evidence_basis", "p_official_info_sheet_identity",
            "p_service_evidence_timestamp", "p_evidence_type",
            "p_limit", "p_offset"].includes(k),
      );
      if (hasResourceParam && !entry.shape2) {
        throw new Error(
          `${entry.name} takes a resource ID param but has no Shape 2 entry — ` +
          `add shape2 args with own-account + foreign-resource to test the ownership check.`,
        );
      }
    }
  });
});

// ===========================================================================
// Part 1 — Behavioral cross-account-throws tests (harness-gated)
// ===========================================================================
// Supersedes tests/integration/rpeCrossAccountCapture.test.js — this is the
// single source of truth for cross-account rejection coverage.
// ===========================================================================

describe.skipIf(!isIntegrationHarnessConfigured())("RPE cross-account throws (behavioral)", () => {
  let ownerBClient;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    ({ client: ownerBClient } = await signInAsFixtureUser("ownerB"));

    const admin = getIntegrationAdminClient();
    await admin.from("leases").delete().eq("id", LEASE_ID);
    const { error } = await admin.from("leases").insert({
      id: LEASE_ID,
      account_id: accountAId,
      property_id: propertyId,
      tenant_id: tenantId,
      status: "draft",
      start_date: "2026-03-17",
      end_date: "2026-05-12",
      rent_amount: 1200,
      rent_frequency: "monthly",
      created_by: isolationFixtures.users.ownerA.id,
      lease_start_date: "2026-03-17",
      lease_end_date: "2026-05-12",
      renewal_status: "active",
      notice_period_days: 30,
      auto_renew: false,
      notes: "RPE cross-account registry integration fixture.",
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    const admin = getIntegrationAdminClient();
    await admin.from("leases").delete().eq("id", LEASE_ID);
  });

  for (const entry of CROSS_ACCOUNT_REGISTRY) {
    it(`Shape 1 — ${entry.name} rejects foreign account id`, async () => {
      const result = await ownerBClient.rpc(entry.name, entry.shape1);
      expect(
        result.error,
        `${entry.name} did not throw on Shape 1 (foreign account id) — returned data: ${JSON.stringify(result.data)}`,
      ).toBeTruthy();
    });

    if (entry.shape2) {
      it(`Shape 2 — ${entry.name} rejects own account + ${entry.shape2.label}`, async () => {
        const result = await ownerBClient.rpc(entry.name, entry.shape2.args);
        expect(
          result.error,
          `${entry.name} did not throw on Shape 2 (own account + ${entry.shape2.label}) — returned data: ${JSON.stringify(result.data)}`,
        ).toBeTruthy();
      });
    }
  }
});
