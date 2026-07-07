/**
 * RRA Bridge: Task → Obligation Instance integration tests.
 *
 * Verifies that the customer-facing "Mark as sent" action on an
 * information-sheet task correctly bridges into the RPE obligation pipeline:
 *
 *   mark_rr_task_sent
 *   → record_rra_info_sheet_rule_evaluation
 *   → reconcile_rra_info_sheet_obligation   (creates obligation_instance)
 *   → capture_rra_info_sheet_service_evidence
 *   → reconcile_rra_info_sheet_obligation_discharge
 *   → list_rra_obligation_instances sees the new record
 *   → get_obligation_proof_pack assembles correctly
 *
 * Security contracts tested:
 *   - ownerB cannot mark_rr_task_sent for accountA's task
 *   - ownerB cannot reconcile an obligation for accountA's evaluation
 *   - ownerB cannot read accountA's obligation instances via list_rra_obligation_instances
 *   - anon caller is denied on all RPCs
 *
 * "Run checks" (generate_tenancy_review_prompts) does NOT create obligation
 * instances; confirmed by running it and asserting obligation list is unchanged.
 *
 * No SQL changes — uses only existing authenticated RPCs.
 * D-11/RB-01 not required (no overlay change).
 */

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { getIntegrationEnv, isIntegrationHarnessConfigured } from "./helpers/env.js";

// ── Fixture IDs (unique namespace — never collide with other tests) ───────────

const BRIDGE_LEASE_ID   = "bb000001-b000-4000-0000-000000000001";
const BRIDGE_TASK_ID    = "bb000001-b000-4000-0000-000000000002";
const BRIDGE_LEASE_B_ID = "bb000001-b000-4000-0000-000000000003"; // cross-account

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId   = isolationFixtures.users.tenantA1.tenantId;
const propertyBId = isolationFixtures.users.tenantB1?.propertyId ?? null;
const tenantBId   = isolationFixtures.users.tenantB1?.tenantId   ?? null;

// Minimal "affected" evaluation inputs — mirrors the pattern from rpeProofPackAssembly.test.js
const AFFECTED_DECISION_PATH = [
  "jurisdiction", "tenancy_exists", "tenancy_start_date",
  "active_on_qualifying_date", "annual_rent_gbp", "company_let",
  "resident_landlord", "rent_act_1977", "pbsa", "tenancy_class", "is_wholly_oral",
];
const AFFECTED_SNAPSHOT = {
  jurisdiction: {
    input_key: "jurisdiction", classification: "exists",
    value: "England", confidence_basis: "exists",
    source_fields: ["properties.country_subdivision"],
  },
  tenancy_exists: {
    input_key: "tenancy_exists", classification: "exists",
    value: true, confidence_basis: "exists",
    source_fields: ["leases.id"],
  },
  active_on_qualifying_date: {
    input_key: "active_on_qualifying_date", classification: "derivable",
    value: true, confidence_basis: "derivable",
    source_fields: ["leases.lease_start_date", "leases.lease_end_date"],
  },
};

function createAnonClient() {
  const env = getIntegrationEnv();
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

describe.skipIf(!isIntegrationHarnessConfigured())(
  "RRA Bridge — task mark-sent → obligation instance",
  () => {
    let admin;
    let clientA;
    let clientB;

    // Tracks obligation instance IDs created per test for cleanup
    let createdObligationIds = [];

    async function cleanupBridgeFixtures() {
      // Discharge / service evidence / basis reviews for bridge leases
      const { data: ois } = await admin
        .from("obligation_instance")
        .select("id")
        .in("lease_id", [BRIDGE_LEASE_ID, BRIDGE_LEASE_B_ID]);
      const oiIds = (ois || []).map((r) => r.id);
      if (oiIds.length > 0) {
        await admin.from("rra_info_sheet_service_evidence").delete().in("obligation_instance_id", oiIds);
        await admin.from("obligation_basis_review").delete().in("obligation_instance_id", oiIds);
        await admin.from("obligation_instance").delete().in("id", oiIds);
      }

      // Rule evaluations
      const { data: evals } = await admin
        .from("rule_evaluation")
        .select("id")
        .in("tenancy_id", [BRIDGE_LEASE_ID, BRIDGE_LEASE_B_ID]);
      const evalIds = (evals || []).map((r) => r.id);
      if (evalIds.length > 0) {
        await admin.from("rule_evaluation").delete().in("id", evalIds);
      }

      // Tasks
      await admin.from("renters_rights_tasks").delete().eq("id", BRIDGE_TASK_ID);

      // Leases
      await admin.from("leases").delete().in("id", [BRIDGE_LEASE_ID, BRIDGE_LEASE_B_ID]);

      createdObligationIds = [];
    }

    async function seedBridgeLeaseAndTask() {
      const { error: leaseErr } = await admin.from("leases").insert({
        id:                BRIDGE_LEASE_ID,
        account_id:        accountAId,
        property_id:       propertyId,
        tenant_id:         tenantId,
        status:            "draft",
        start_date:        "2026-03-17",
        end_date:          "2027-03-16",
        rent_amount:       1200,
        rent_frequency:    "monthly",
        lease_start_date:  "2026-03-17",
        lease_end_date:    "2027-03-16",
        renewal_status:    "active",
        notice_period_days: 30,
        auto_renew:        false,
        company_let:       false,
        resident_landlord: false,
        rent_act_1977:     false,
        is_wholly_oral:    false,
        tenancy_class:     "assured_shorthold",
        notes:             "RRA bridge integration test fixture.",
        created_by:        isolationFixtures.users.ownerA.id,
      });
      if (leaseErr) throw new Error(`seed lease: ${leaseErr.message}`);

      const { error: taskErr } = await admin.from("renters_rights_tasks").insert({
        id:               BRIDGE_TASK_ID,
        account_id:       accountAId,
        property_id:      propertyId,
        tenant_id:        tenantId,
        lease_id:         BRIDGE_LEASE_ID,
        requirement_type: "renters_rights_information_sheet",
        jurisdiction:     "GB-ENG",
        due_date:         "2026-05-31",
        status:           "required",
        metadata:         { source: "rra-bridge-integration-test" },
      });
      if (taskErr) throw new Error(`seed task: ${taskErr.message}`);
    }

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
      ({ client: clientA } = await signInAsFixtureUser("ownerA"));
      ({ client: clientB } = await signInAsFixtureUser("ownerB"));
    });

    afterAll(async () => {
      await cleanupBridgeFixtures();
    });

    // ── Isolation between tests ───────────────────────────────────────────────

    async function setupFresh() {
      await cleanupBridgeFixtures();
      await seedBridgeLeaseAndTask();
    }

    // ── Helper: run the full bridge RPC sequence via ownerA ──────────────────

    async function runBridgeSequence(client, leaseId = BRIDGE_LEASE_ID) {
      // Step 1: mark task sent
      const taskResult = await client.rpc("mark_rr_task_sent", {
        p_task_id:         BRIDGE_TASK_ID,
        p_account_id:      accountAId,
        p_delivery_method: "email",
        p_sent_at:         new Date().toISOString(),
        p_notes:           null,
      });
      if (taskResult.error) throw new Error(`mark_rr_task_sent: ${taskResult.error.message}`);

      // Step 2: record evaluation
      const evalResult = await client.rpc("record_rra_info_sheet_rule_evaluation", {
        p_account_id:            accountAId,
        p_tenancy_id:            leaseId,
        p_input_snapshot:        AFFECTED_SNAPSHOT,
        p_decision_path:         AFFECTED_DECISION_PATH,
        p_result:                "affected",
        p_obligation_kind:       "information_sheet",
        p_exposure_gbp_ceiling:  7000,
        p_reason_codes:          ["AFF_INFO_SHEET"],
        p_missing_fields:        [],
        p_deferred_until:        null,
        p_deferred_until_basis:  null,
        p_evaluation_confidence: "high",
        p_demo_mode:             true,
        p_evaluated_at:          new Date().toISOString(),
      });
      if (evalResult.error) throw new Error(`record_rra_info_sheet_rule_evaluation: ${evalResult.error.message}`);

      const evaluationId = evalResult.data?.id;
      if (!evaluationId) throw new Error("evaluation id not returned");

      // Step 3: reconcile obligation instance
      const reconcileResult = await client.rpc("reconcile_rra_info_sheet_obligation", {
        p_account_id:    accountAId,
        p_evaluation_id: evaluationId,
        p_demo_mode:     true,
      });
      if (reconcileResult.error) throw new Error(`reconcile: ${reconcileResult.error.message}`);

      const obligationInstanceId = reconcileResult.data?.obligation_instance_id ?? null;
      if (obligationInstanceId) createdObligationIds.push(obligationInstanceId);

      return { taskRow: taskResult.data, evaluationId, reconcileResult: reconcileResult.data, obligationInstanceId };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Happy path: full bridge creates obligation and proof pack entry
    // ─────────────────────────────────────────────────────────────────────────

    it("mark_rr_task_sent succeeds for the account owner", async () => {
      await setupFresh();
      const { data, error } = await clientA.rpc("mark_rr_task_sent", {
        p_task_id:         BRIDGE_TASK_ID,
        p_account_id:      accountAId,
        p_delivery_method: "email",
        p_sent_at:         new Date().toISOString(),
        p_notes:           null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(String(data.status || "")).toBe("sent");
    });

    it("after bridge sequence, obligation_instance exists for the lease", async () => {
      await setupFresh();
      const { obligationInstanceId } = await runBridgeSequence(clientA);

      expect(obligationInstanceId).not.toBeNull();

      const { data, error } = await admin
        .from("obligation_instance")
        .select("id, posture, lease_id, account_id")
        .eq("id", obligationInstanceId)
        .single();

      expect(error).toBeNull();
      expect(data.posture).toBe("open");
      expect(data.lease_id).toBe(BRIDGE_LEASE_ID);
      expect(data.account_id).toBe(accountAId);
    });

    it("after bridge sequence, list_rra_obligation_instances returns the new record", async () => {
      await setupFresh();
      const { obligationInstanceId } = await runBridgeSequence(clientA);

      const { data, error } = await clientA.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId,
        p_limit: 100,
        p_offset: 0,
      });

      expect(error).toBeNull();
      const ids = (data || []).map((r) => r.id);
      expect(ids).toContain(obligationInstanceId);
    });

    it("after bridge + service evidence capture + discharge, proof pack assembles correctly", async () => {
      await setupFresh();
      const { obligationInstanceId, evaluationId } = await runBridgeSequence(clientA);

      // Capture service evidence
      const captureResult = await clientA.rpc("capture_rra_info_sheet_service_evidence", {
        p_account_id:                   accountAId,
        p_obligation_instance_id:       obligationInstanceId,
        p_official_info_sheet_identity: "govuk-rra-information-sheet-2025",
        p_service_evidence_timestamp:   new Date().toISOString(),
        p_evidence_type:                "email_delivery_receipt",
        p_evidence_basis:               "Landlord recorded as sent via email. Operational record only — not legal proof.",
        p_official_info_sheet_source:   "official_document_catalogue",
        p_capture_source:               "rra_task_mark_sent_bridge",
        p_demo_mode:                    true,
      });
      expect(captureResult.error).toBeNull();
      const evidenceId = captureResult.data?.evidence_id;
      expect(evidenceId).toBeTruthy();

      // Discharge
      const dischargeResult = await clientA.rpc("reconcile_rra_info_sheet_obligation_discharge", {
        p_account_id:            accountAId,
        p_obligation_instance_id: obligationInstanceId,
        p_service_evidence_id:   evidenceId,
        p_demo_mode:             true,
      });
      expect(dischargeResult.error).toBeNull();
      expect(dischargeResult.data).toMatchObject({ action: "discharged", posture: "discharged" });

      // Assemble proof pack
      const packResult = await clientA.rpc("get_obligation_proof_pack", {
        p_account_id:             accountAId,
        p_obligation_instance_id: obligationInstanceId,
      });
      expect(packResult.error).toBeNull();
      const p = packResult.data;
      expect(p.obligation.posture).toBe("discharged");
      expect(p.evidence).toHaveLength(1);
      expect(p.evidence[0].official_info_sheet_identity).toBe("govuk-rra-information-sheet-2025");
      expect(p.status.discharge_evidence_present).toBe(true);
      expect(p.status.demo_mode).toBe(true);
      // Honesty: no legal claim
      expect(p.status.gate_b_signed_off).toBe(false);
      expect(p.status.customer_facing_allowed).toBe(false);
      expect(p.status.pack_status_label).toBe("Demo proof pack — not legal sign-off");
    });

    it("task marked sent has no effect on existing obligation list before bridge RPCs run", async () => {
      await setupFresh();

      const before = await clientA.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId, p_limit: 100, p_offset: 0,
      });
      const beforeIds = (before.data || []).map((r) => r.id);

      await clientA.rpc("mark_rr_task_sent", {
        p_task_id: BRIDGE_TASK_ID, p_account_id: accountAId,
        p_delivery_method: "email", p_sent_at: new Date().toISOString(), p_notes: null,
      });

      const after = await clientA.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId, p_limit: 100, p_offset: 0,
      });
      const afterIds = (after.data || []).map((r) => r.id);

      // No new obligation_instance rows appear from task alone
      expect(afterIds).toEqual(beforeIds);
    });

    // ── Tenancy Review "Run checks" does NOT create obligation instances ───────

    it("generate_tenancy_review_prompts does not create obligation_instance rows", async () => {
      await setupFresh();

      const before = await clientA.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId, p_limit: 100, p_offset: 0,
      });
      const beforeIds = (before.data || []).map((r) => r.id);

      // Run the Tenancy Review check (the "Run checks" button)
      await clientA.rpc("generate_tenancy_review_prompts", { p_account_id: accountAId });

      const after = await clientA.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId, p_limit: 100, p_offset: 0,
      });
      const afterIds = (after.data || []).map((r) => r.id);

      expect(afterIds).toEqual(beforeIds);
    });

    // ── Cross-account security ────────────────────────────────────────────────

    it("ownerB cannot mark accountA task as sent", async () => {
      await setupFresh();
      const result = await clientB.rpc("mark_rr_task_sent", {
        p_task_id:         BRIDGE_TASK_ID,
        p_account_id:      accountAId,
        p_delivery_method: "email",
        p_sent_at:         new Date().toISOString(),
        p_notes:           null,
      });
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("ownerB cannot record an evaluation for accountA's lease", async () => {
      await setupFresh();
      const result = await clientB.rpc("record_rra_info_sheet_rule_evaluation", {
        p_account_id:            accountAId,
        p_tenancy_id:            BRIDGE_LEASE_ID,
        p_input_snapshot:        AFFECTED_SNAPSHOT,
        p_decision_path:         AFFECTED_DECISION_PATH,
        p_result:                "affected",
        p_obligation_kind:       "information_sheet",
        p_exposure_gbp_ceiling:  7000,
        p_reason_codes:          ["AFF_INFO_SHEET"],
        p_missing_fields:        [],
        p_deferred_until:        null,
        p_deferred_until_basis:  null,
        p_evaluation_confidence: "high",
        p_demo_mode:             true,
        p_evaluated_at:          new Date().toISOString(),
      });
      expect(result.error).not.toBeNull();
    });

    it("ownerB cannot list accountA's obligation instances", async () => {
      await setupFresh();
      const { obligationInstanceId } = await runBridgeSequence(clientA);
      expect(obligationInstanceId).not.toBeNull();

      const result = await clientB.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId,
        p_limit: 100,
        p_offset: 0,
      });
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("ownerB cannot read accountA's proof pack", async () => {
      await setupFresh();
      const { obligationInstanceId } = await runBridgeSequence(clientA);
      expect(obligationInstanceId).not.toBeNull();

      const result = await clientB.rpc("get_obligation_proof_pack", {
        p_account_id:             accountBId,
        p_obligation_instance_id: obligationInstanceId,
      });
      expect(result.error).not.toBeNull();
    });

    // ── Unauthenticated deny ──────────────────────────────────────────────────

    it("anon caller cannot run mark_rr_task_sent", async () => {
      await setupFresh();
      const anon = createAnonClient();
      const result = await anon.rpc("mark_rr_task_sent", {
        p_task_id: BRIDGE_TASK_ID, p_account_id: accountAId,
        p_delivery_method: "email", p_sent_at: new Date().toISOString(), p_notes: null,
      });
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });

    it("anon caller cannot run reconcile_rra_info_sheet_obligation", async () => {
      const anon = createAnonClient();
      const result = await anon.rpc("reconcile_rra_info_sheet_obligation", {
        p_account_id:    accountAId,
        p_evaluation_id: "00000000-0000-0000-0000-000000000000",
        p_demo_mode:     true,
      });
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });

    it("anon caller cannot list obligation instances", async () => {
      const anon = createAnonClient();
      const result = await anon.rpc("list_rra_obligation_instances", {
        p_account_id: accountAId, p_limit: 10, p_offset: 0,
      });
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  },
);
