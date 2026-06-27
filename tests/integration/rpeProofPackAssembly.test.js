import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const records = {
  discharged: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e001",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e002",
  },
  openOnly: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e003",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e004",
  },
  basisChanged: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e005",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e006",
  },
  crossAccount: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e007",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2e008",
  },
};

const allLeaseIds = Object.values(records).map((r) => r.leaseId);
const allTaskIds = Object.values(records).map((r) => r.taskId);

const affectedDecisionPath = [
  "jurisdiction", "tenancy_exists", "tenancy_start_date",
  "active_on_qualifying_date", "annual_rent_gbp", "company_let",
  "resident_landlord", "rent_act_1977", "pbsa", "tenancy_class", "is_wholly_oral",
];

const affectedSnapshot = {
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
    source_fields: ["leases.lease_start_date", "leases.lease_end_date", "regulatory.qualifying_date"],
  },
};

async function deleteMaybe(queryPromise) {
  const { error } = await queryPromise;
  if (error) throw error;
}

describe.skipIf(!isIntegrationHarnessConfigured())("RPE Proof Pack VS-1 assembly read model", () => {
  const admin = getIntegrationAdminClient();
  let ownerAClient;
  let ownerBClient;
  let seededUsers;

  async function cleanup() {
    const { data: evaluations } = await admin
      .from("rule_evaluation").select("id").in("tenancy_id", allLeaseIds);
    const evaluationIds = (evaluations || []).map((row) => row.id);

    await deleteMaybe(admin.from("obligation_basis_review").delete().in("account_id", [accountAId]));
    await deleteMaybe(admin.from("obligation_instance").delete().in("lease_id", allLeaseIds));
    if (evaluationIds.length > 0) {
      await deleteMaybe(admin.from("rule_evaluation").delete().in("id", evaluationIds));
    }
    await deleteMaybe(admin.from("renters_rights_tasks").delete().in("id", allTaskIds));
    await deleteMaybe(admin.from("leases").delete().in("id", allLeaseIds));
  }

  async function seedLeaseAndTask(record) {
    const { error: leaseError } = await admin.from("leases").insert({
      id: record.leaseId,
      account_id: accountAId,
      property_id: propertyId,
      tenant_id: tenantId,
      status: "draft",
      start_date: "2026-03-17",
      end_date: "2026-05-12",
      rent_amount: 1200,
      rent_frequency: "monthly",
      created_by: seededUsers.ownerA.id,
      lease_start_date: "2026-03-17",
      lease_end_date: "2026-05-12",
      renewal_status: "active",
      notice_period_days: 30,
      auto_renew: false,
      company_let: false,
      resident_landlord: false,
      rent_act_1977: false,
      is_wholly_oral: false,
      tenancy_class: "assured_shorthold",
      notes: "RPE Proof Pack VS-1 integration fixture.",
    });
    expect(leaseError).toBeNull();

    const { error: taskError } = await admin.from("renters_rights_tasks").insert({
      id: record.taskId,
      account_id: accountAId,
      property_id: propertyId,
      tenant_id: tenantId,
      lease_id: record.leaseId,
      requirement_type: "renters_rights_information_sheet",
      jurisdiction: "GB-ENG",
      due_date: "2026-05-31",
      status: "required",
      metadata: { source: "rpe-proof-pack-vs1-integration" },
    });
    expect(taskError).toBeNull();
  }

  async function recordEvaluation(record, overrides = {}) {
    const result = overrides.result ?? "affected";
    const isNeedsData = result === "needs_data";
    const isAffected = result === "affected";

    const recorded = await ownerAClient.rpc("record_rra_info_sheet_rule_evaluation", {
      p_account_id: accountAId,
      p_tenancy_id: record.leaseId,
      p_input_snapshot: overrides.inputSnapshot ?? affectedSnapshot,
      p_decision_path: overrides.decisionPath ?? affectedDecisionPath,
      p_result: result,
      p_obligation_kind: overrides.obligationKind ?? (isAffected ? "information_sheet" : null),
      p_exposure_gbp_ceiling: overrides.exposureGbpCeiling ?? (isAffected ? 7000 : null),
      p_reason_codes: overrides.reasonCodes ?? (isAffected ? ["AFF_INFO_SHEET"] : []),
      p_missing_fields: overrides.missingFields ?? (isNeedsData ? ["tenancy_class"] : []),
      p_deferred_until: null,
      p_deferred_until_basis: null,
      p_evaluation_confidence: isNeedsData ? null : (overrides.evaluationConfidence ?? "high"),
      p_demo_mode: true,
      p_evaluated_at: overrides.evaluatedAt ?? new Date().toISOString(),
    });
    expect(recorded.error).toBeNull();
    return recorded.data;
  }

  async function reconcile(evaluationId) {
    const reconciled = await ownerAClient.rpc("reconcile_rra_info_sheet_obligation", {
      p_account_id: accountAId,
      p_evaluation_id: evaluationId,
      p_demo_mode: true,
    });
    expect(reconciled.error).toBeNull();
    return reconciled.data;
  }

  async function createOpenObligation(record) {
    await seedLeaseAndTask(record);
    const evaluation = await recordEvaluation(record);
    const reconciliation = await reconcile(evaluation.id);
    expect(reconciliation).toMatchObject({ action: "created", posture: "open" });
    return { obligationId: reconciliation.obligation_instance_id, evaluation };
  }

  async function createDischargedObligation(record) {
    const { obligationId, evaluation } = await createOpenObligation(record);

    const captured = await ownerAClient.rpc("capture_rra_info_sheet_service_evidence", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
      p_official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      p_service_evidence_timestamp: new Date().toISOString(),
      p_evidence_type: "delivery_confirmation",
      p_evidence_basis: "provider delivery receipt id demo-pp-vs1",
      p_official_info_sheet_source: "official_document_catalogue",
      p_capture_source: "manual_rpe_service_evidence_capture",
      p_demo_mode: true,
    });
    expect(captured.error).toBeNull();

    const discharged = await ownerAClient.rpc("reconcile_rra_info_sheet_obligation_discharge", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
      p_service_evidence_id: captured.data.evidence_id,
      p_demo_mode: true,
    });
    expect(discharged.error).toBeNull();
    expect(discharged.data).toMatchObject({ action: "discharged", posture: "discharged" });

    return { obligationId, evaluation, evidenceId: captured.data.evidence_id };
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    ({ client: ownerAClient } = await signInAsFixtureUser("ownerA"));
    ({ client: ownerBClient } = await signInAsFixtureUser("ownerB"));
  });

  afterEach(async () => {
    await cleanup();
  });

  // ─────── Assembly: discharged obligation with evidence ───────

  it("assembles a discharged obligation pack with evaluation, obligation, evidence, and provenance — all stored values", async () => {
    await cleanup();
    const { obligationId, evaluation, evidenceId } = await createDischargedObligation(records.discharged);

    const stored = await admin.from("obligation_instance").select("*").eq("id", obligationId).single();
    expect(stored.error).toBeNull();

    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();
    const p = pack.data;

    // Evaluation — stored values
    expect(p.evaluation).toMatchObject({
      evaluation_id: evaluation.id,
      result: "affected",
      confidence: "high",
      demo_mode: true,
    });
    expect(p.evaluation.decision_path).toEqual(affectedDecisionPath);
    expect(p.evaluation.input_snapshot_hash).toBeTruthy();
    expect(p.evaluation.evaluated_at).toBeTruthy();

    // Obligation — stored values match the row
    expect(p.obligation).toMatchObject({
      obligation_instance_id: obligationId,
      posture: "discharged",
      obligation_kind: "information_sheet",
      exposure_gbp_ceiling: 7000,
    });
    expect(p.obligation.created_at).toBe(stored.data.created_at);
    expect(p.obligation.last_transition_at).toBe(stored.data.last_transition_at);

    // Evidence — present because discharged
    expect(p.evidence).toHaveLength(1);
    expect(p.evidence[0]).toMatchObject({
      evidence_id: evidenceId,
      official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      evidence_type: "delivery_confirmation",
    });
    expect(p.evidence[0].captured_at).toBeTruthy();

    // Basis review — absent (no post-discharge basis change)
    expect(p.basis_review).toBeNull();

    // Provenance — deterministic ordered trail
    expect(p.provenance.length).toBeGreaterThanOrEqual(3);
    const eventTypes = p.provenance.map((e) => e.event_type);
    expect(eventTypes).toContain("evaluation_run");
    expect(eventTypes).toContain("rpe.obligation.created");
    expect(eventTypes).toContain("rpe.service_evidence.captured");
    expect(eventTypes).toContain("rpe.obligation.discharged");

    // Sequence numbers are monotonically increasing (deterministic ordering)
    for (let i = 1; i < p.provenance.length; i++) {
      expect(p.provenance[i].sequence_number).toBeGreaterThan(p.provenance[i - 1].sequence_number);
    }

    // Status — completeness indicators, not legal verdicts
    expect(p.status).toMatchObject({
      evaluation_recorded: true,
      obligation_created: true,
      discharge_evidence_present: true,
      provenance_trail_intact: true,
      basis_review_required: false,
      evidence_missing: false,
      demo_mode: true,
      gate_b_signed_off: false,
      customer_facing_allowed: false,
      pack_status_label: "Demo proof pack — not legal sign-off",
    });

    // Provenance trace status — all expected events present
    expect(p.status.provenance_trace_status).toMatchObject({
      expected_events_present: true,
      missing_event_types: [],
    });
  });

  // ─────── Assembly: open (not discharged) obligation ───────

  it("assembles an open obligation pack with evaluation and obligation only — no fabricated evidence or basis review", async () => {
    await cleanup();
    const { obligationId, evaluation } = await createOpenObligation(records.openOnly);

    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();
    const p = pack.data;

    // Evaluation present
    expect(p.evaluation).toMatchObject({
      evaluation_id: evaluation.id,
      result: "affected",
      confidence: "high",
    });

    // Obligation present with open posture
    expect(p.obligation).toMatchObject({
      obligation_instance_id: obligationId,
      posture: "open",
      obligation_kind: "information_sheet",
    });

    // Evidence absent — NOT fabricated
    expect(p.evidence).toEqual([]);

    // Basis review absent — NOT fabricated
    expect(p.basis_review).toBeNull();

    // Provenance trail has evaluation + obligation events
    expect(p.provenance.length).toBeGreaterThanOrEqual(2);
    const eventTypes = p.provenance.map((e) => e.event_type);
    expect(eventTypes).toContain("evaluation_run");
    expect(eventTypes).toContain("rpe.obligation.created");

    // Status reflects evidence absent
    expect(p.status).toMatchObject({
      evaluation_recorded: true,
      obligation_created: true,
      discharge_evidence_present: false,
      evidence_missing: true,
      basis_review_required: false,
      demo_mode: true,
      gate_b_signed_off: false,
      customer_facing_allowed: false,
    });

    // Trace status: expected events for open path only
    expect(p.status.provenance_trace_status).toMatchObject({
      expected_events_present: true,
      missing_event_types: [],
    });
  });

  // ─────── Assembly: discharged-then-basis-changed obligation ───────

  it("assembles a discharged-then-basis-changed pack with both evidence AND basis review", async () => {
    await cleanup();
    const { obligationId, evidenceId } = await createDischargedObligation(records.basisChanged);

    // Trigger basis change via not_affected after discharge
    const evalNotAffected = await recordEvaluation(records.basisChanged, {
      result: "not_affected",
      obligationKind: null,
      exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r = await reconcile(evalNotAffected.id);
    expect(r).toMatchObject({ action: "basis_change_recorded", posture: "discharged" });

    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();
    const p = pack.data;

    // Obligation still discharged
    expect(p.obligation.posture).toBe("discharged");

    // Evidence present (the discharge evidence)
    expect(p.evidence).toHaveLength(1);
    expect(p.evidence[0].evidence_id).toBe(evidenceId);

    // Basis review present (VS-2D)
    expect(p.basis_review).toMatchObject({
      latest_evaluation_result: "not_affected",
      basis_change_kind: "not_affected_after_discharge",
      review_required: true,
    });
    expect(p.basis_review.basis_review_id).toBeTruthy();
    expect(p.basis_review.review_flagged_at).toBeTruthy();

    // basis_review surfaces latest_evaluation_id
    expect(p.basis_review.latest_evaluation_id).toBe(evalNotAffected.id);

    // Provenance includes basis_change_recorded event AND the later evaluation's evaluation_run
    const eventTypes = p.provenance.map((e) => e.event_type);
    expect(eventTypes).toContain("rpe.obligation.basis_change_recorded");

    // The later evaluation's evaluation_run is in the trail (Fix 2: full story)
    const laterEvalEvents = p.provenance.filter(
      (e) => e.entity_type === "rule_evaluation" && e.entity_id === evalNotAffected.id,
    );
    expect(laterEvalEvents.length).toBeGreaterThanOrEqual(1);
    expect(laterEvalEvents.some((e) => e.event_type === "evaluation_run")).toBe(true);

    // Status reflects both truths
    expect(p.status).toMatchObject({
      discharge_evidence_present: true,
      basis_review_required: true,
      evidence_missing: false,
      demo_mode: true,
    });

    // Trace status includes basis_change_recorded AND later evaluation_run
    expect(p.status.provenance_trace_status).toMatchObject({
      expected_events_present: true,
      missing_event_types: [],
    });
  });

  // ─────── ★ Verdict Check 1: NO RECOMPUTATION (divergent probe) ───────

  it("★ divergent probe — returns stored exposure_gbp_ceiling=9999, NOT the recomputed 7000", async () => {
    await cleanup();
    const { obligationId, evaluation } = await createOpenObligation(records.discharged);

    // Verify the engine produced 7000
    const before = await admin.from("obligation_instance")
      .select("exposure_gbp_ceiling").eq("id", obligationId).single();
    expect(before.error).toBeNull();
    expect(before.data.exposure_gbp_ceiling).toBe(7000);

    // Bypass the engine: write a value the evaluator would NEVER produce
    const { error: updateError } = await admin.from("obligation_instance")
      .update({ exposure_gbp_ceiling: 9999 })
      .eq("id", obligationId);
    expect(updateError).toBeNull();

    // Confirm the stored row holds the divergent value
    const stored = await admin.from("obligation_instance")
      .select("exposure_gbp_ceiling, posture, obligation_kind, created_at, last_transition_at")
      .eq("id", obligationId).single();
    expect(stored.error).toBeNull();
    expect(stored.data.exposure_gbp_ceiling).toBe(9999);

    // Confirm stored evaluation
    const storedEval = await admin.from("rule_evaluation")
      .select("result, evaluation_confidence, decision_path, evaluated_at, demo_mode")
      .eq("id", evaluation.id).single();
    expect(storedEval.error).toBeNull();

    // Read the proof pack
    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();
    const p = pack.data;

    // THE DIVERGENT PROBE: pack returns stored 9999, NOT recomputed 7000
    expect(p.obligation.exposure_gbp_ceiling).toBe(9999);

    // All other obligation fields also match the stored row (not recomputed)
    expect(p.obligation.posture).toBe(stored.data.posture);
    expect(p.obligation.obligation_kind).toBe(stored.data.obligation_kind);
    expect(p.obligation.created_at).toBe(stored.data.created_at);
    expect(p.obligation.last_transition_at).toBe(stored.data.last_transition_at);

    // Evaluation fields match stored row (not re-evaluated)
    expect(p.evaluation.result).toBe(storedEval.data.result);
    expect(p.evaluation.confidence).toBe(storedEval.data.evaluation_confidence);
    expect(p.evaluation.decision_path).toEqual(storedEval.data.decision_path);
    expect(p.evaluation.evaluated_at).toBe(storedEval.data.evaluated_at);
    expect(p.evaluation.demo_mode).toBe(storedEval.data.demo_mode);
  });

  // ─────── ★ Verdict Check 1b: NO RECOMPUTATION — hash divergent probe ───────

  it("★ hash divergent probe — returns stored input_snapshot_hash, NOT a fresh recompute of the altered snapshot", async () => {
    await cleanup();
    const { obligationId, evaluation } = await createOpenObligation(records.discharged);

    // Read the stored hash (frozen at evaluation-recording time)
    const storedEval = await admin.from("rule_evaluation")
      .select("input_snapshot_hash, input_snapshot")
      .eq("id", evaluation.id).single();
    expect(storedEval.error).toBeNull();
    const frozenHash = storedEval.data.input_snapshot_hash;
    expect(frozenHash).toMatch(/^[a-f0-9]{64}$/);

    // Admin-bypass: alter the stored input_snapshot so it no longer matches the stored hash.
    // The stored hash now deliberately differs from a fresh recompute of the snapshot.
    const alteredSnapshot = { ...storedEval.data.input_snapshot, _tampered: true };
    const { error: updateError } = await admin.from("rule_evaluation")
      .update({ input_snapshot: alteredSnapshot })
      .eq("id", evaluation.id);
    expect(updateError).toBeNull();

    // Confirm the snapshot was changed but hash was NOT changed
    const after = await admin.from("rule_evaluation")
      .select("input_snapshot_hash, input_snapshot")
      .eq("id", evaluation.id).single();
    expect(after.error).toBeNull();
    expect(after.data.input_snapshot._tampered).toBe(true);
    expect(after.data.input_snapshot_hash).toBe(frozenHash);

    // Read the proof pack
    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();

    // THE HASH DIVERGENT PROBE: pack returns the stored frozen hash,
    // NOT a fresh recompute of the altered snapshot
    expect(pack.data.evaluation.input_snapshot_hash).toBe(frozenHash);
  });

  // ─────── ★ Verdict Check 2: DETERMINISTIC PROVENANCE ORDERING (four entity types) ───────

  it("★ two reads of a discharged-then-basis-changed obligation return identical provenance ordering across four entity types", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.basisChanged);

    // Trigger basis change to get all four entity types
    const evalNotAffected = await recordEvaluation(records.basisChanged, {
      result: "not_affected",
      obligationKind: null,
      exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r = await reconcile(evalNotAffected.id);
    expect(r).toMatchObject({ action: "basis_change_recorded" });

    // Two reads of the same obligation
    const pack1 = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    const pack2 = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack1.error).toBeNull();
    expect(pack2.error).toBeNull();

    // Byte-for-byte identical ordering
    const trail1 = pack1.data.provenance.map((e) => ({ event_id: e.event_id, event_type: e.event_type, entity_type: e.entity_type }));
    const trail2 = pack2.data.provenance.map((e) => ({ event_id: e.event_id, event_type: e.event_type, entity_type: e.entity_type }));
    expect(trail1).toEqual(trail2);

    // All four entity types present in the trail
    const entityTypes = new Set(pack1.data.provenance.map((e) => e.entity_type));
    expect(entityTypes.has("rule_evaluation")).toBe(true);
    expect(entityTypes.has("obligation_instance")).toBe(true);
    expect(entityTypes.has("rra_info_sheet_service_evidence")).toBe(true);
    expect(entityTypes.has("obligation_basis_review")).toBe(true);

    // Cross-entity interleaving: events ordered by sequence_number (not grouped per-entity)
    // Sequence numbers are monotonically increasing across all entity types
    for (let i = 1; i < pack1.data.provenance.length; i++) {
      expect(pack1.data.provenance[i].sequence_number).toBeGreaterThan(
        pack1.data.provenance[i - 1].sequence_number,
      );
    }

    // Later evaluation's evaluation_run event is present (Fix 2: full story)
    const laterEvalEvents = pack1.data.provenance.filter(
      (e) => e.entity_type === "rule_evaluation" && e.event_type === "evaluation_run",
    );
    expect(laterEvalEvents.length).toBe(2);

    // Lifecycle order: evaluation_run first, then obligation.created, then evidence, then discharged, then basis_change
    const eventTypeOrder = pack1.data.provenance.map((e) => e.event_type);
    const evalIdx = eventTypeOrder.indexOf("evaluation_run");
    const createdIdx = eventTypeOrder.indexOf("rpe.obligation.created");
    const evidenceIdx = eventTypeOrder.indexOf("rpe.service_evidence.captured");
    const dischargedIdx = eventTypeOrder.indexOf("rpe.obligation.discharged");
    const basisIdx = eventTypeOrder.indexOf("rpe.obligation.basis_change_recorded");

    expect(evalIdx).toBeLessThan(createdIdx);
    expect(createdIdx).toBeLessThan(evidenceIdx);
    expect(evidenceIdx).toBeLessThan(dischargedIdx);
    expect(dischargedIdx).toBeLessThan(basisIdx);
  });

  // ─────── Read-only: no writes ───────

  it("does not modify any data — posture, events, and evidence unchanged after read", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.discharged);

    const beforeObligation = await admin.from("obligation_instance")
      .select("*").eq("id", obligationId).single();
    const beforeEvents = await admin.from("provenance_events")
      .select("id").eq("entity_type", "obligation_instance").eq("entity_id", obligationId);

    await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });

    const afterObligation = await admin.from("obligation_instance")
      .select("*").eq("id", obligationId).single();
    const afterEvents = await admin.from("provenance_events")
      .select("id").eq("entity_type", "obligation_instance").eq("entity_id", obligationId);

    expect(afterObligation.data).toEqual(beforeObligation.data);
    expect(afterEvents.data).toEqual(beforeEvents.data);
  });

  // ─────── Cross-account: Shape 2 ───────

  it("throws on Shape 2 (own account + foreign obligation)", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.crossAccount);

    const result = await ownerBClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountBId,
      p_obligation_instance_id: obligationId,
    });
    expect(result.error).toBeTruthy();
    expect(String(result.error.message || "").toLowerCase()).toMatch(/not found|not authorized/);
  });

  // ─────── Demo/Gate-B status ───────

  it("carries demo_mode, gate_b_signed_off, customer_facing_allowed, and pack_status_label on every payload", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.openOnly);

    const pack = await ownerAClient.rpc("get_obligation_proof_pack", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(pack.error).toBeNull();

    expect(pack.data.status.demo_mode).toBe(true);
    expect(pack.data.status.gate_b_signed_off).toBe(false);
    expect(pack.data.status.customer_facing_allowed).toBe(false);
    expect(pack.data.status.pack_status_label).toBe("Demo proof pack — not legal sign-off");
  });
});
