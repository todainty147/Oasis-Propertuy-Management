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
  boundary: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b001",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b002",
  },
  directWrite: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b003",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b004",
  },
  idempotency: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b005",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b006",
  },
  kindChange: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b007",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b008",
  },
  noRevival: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b009",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b010",
  },
  requiresReview: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b011",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b012",
  },
  provenance: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b013",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2b014",
  },
};

const allLeaseIds = Object.values(records).map((record) => record.leaseId);
const allTaskIds = Object.values(records).map((record) => record.taskId);

const affectedDecisionPath = [
  "jurisdiction",
  "tenancy_exists",
  "tenancy_start_date",
  "active_on_qualifying_date",
  "annual_rent_gbp",
  "company_let",
  "resident_landlord",
  "rent_act_1977",
  "pbsa",
  "tenancy_class",
  "is_wholly_oral",
];

const affectedSnapshot = {
  jurisdiction: {
    input_key: "jurisdiction",
    classification: "exists",
    value: "England",
    confidence_basis: "exists",
    source_fields: ["properties.country_subdivision"],
  },
  tenancy_exists: {
    input_key: "tenancy_exists",
    classification: "exists",
    value: true,
    confidence_basis: "exists",
    source_fields: ["leases.id"],
  },
  active_on_qualifying_date: {
    input_key: "active_on_qualifying_date",
    classification: "derivable",
    value: true,
    confidence_basis: "derivable",
    source_fields: ["leases.lease_start_date", "leases.lease_end_date", "regulatory.qualifying_date"],
  },
};

const needsDataSnapshot = {
  ...affectedSnapshot,
  tenancy_class: {
    input_key: "tenancy_class",
    classification: "missing",
    value: null,
    confidence_basis: null,
    source_fields: ["leases.tenancy_class"],
  },
};

async function deleteMaybe(queryPromise) {
  const { error } = await queryPromise;
  if (error) throw error;
}

function eventTypes(events = []) {
  return events.map((row) => row.event_type).sort();
}

function expectNoRowsOrWriteError(result) {
  if (result.error) {
    expect(String(result.error.message || "").toLowerCase()).toMatch(/row-level security|permission|policy|violates|not authorized|denied/);
    return;
  }
  expect(result.data ?? []).toEqual([]);
}

describe.skipIf(!isIntegrationHarnessConfigured())("RPE VS-2B obligation instances", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;
  let ownerAClient;
  let ownerBClient;

  async function cleanup() {
    const { data: evaluations, error: evaluationSelectError } = await admin
      .from("rule_evaluation")
      .select("id")
      .in("tenancy_id", allLeaseIds);

    if (evaluationSelectError && evaluationSelectError.code !== "42P01") {
      throw evaluationSelectError;
    }

    const evaluationIds = (evaluations || []).map((row) => row.id);

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
      notes: "RPE VS-2B integration fixture: draft lease avoids active-per-property conflicts.",
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
      metadata: { source: "rpe-vs2b-integration" },
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
      p_input_snapshot: overrides.inputSnapshot ?? (isNeedsData ? needsDataSnapshot : affectedSnapshot),
      p_decision_path: overrides.decisionPath ?? (isNeedsData
        ? ["jurisdiction", "tenancy_exists", "tenancy_start_date", "active_on_qualifying_date", "tenancy_class"]
        : affectedDecisionPath),
      p_result: result,
      p_obligation_kind: overrides.obligationKind ?? (isAffected ? "information_sheet" : null),
      p_exposure_gbp_ceiling: overrides.exposureGbpCeiling ?? (isAffected ? 7000 : null),
      p_reason_codes: overrides.reasonCodes ?? (isAffected ? ["AFF_INFO_SHEET"] : []),
      p_missing_fields: overrides.missingFields ?? (isNeedsData ? ["tenancy_class"] : []),
      p_deferred_until: null,
      p_deferred_until_basis: null,
      p_evaluation_confidence: isNeedsData ? null : (overrides.evaluationConfidence ?? "high"),
      p_demo_mode: true,
      p_evaluated_at: overrides.evaluatedAt ?? "2026-06-26T12:00:00.000Z",
    });

    expect(recorded.error).toBeNull();
    expect(recorded.data?.id).toBeTruthy();
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

  async function createOpenObligation(record, overrides = {}) {
    await seedLeaseAndTask(record);
    const evaluation = await recordEvaluation(record, overrides);
    const reconciliation = await reconcile(evaluation.id);

    expect(reconciliation).toMatchObject({
      posture: "open",
      demo_mode: true,
    });

    return {
      evaluation,
      reconciliation,
      obligationId: reconciliation.obligation_instance_id,
    };
  }

  async function loadObligation(id) {
    const result = await admin
      .from("obligation_instance")
      .select("id, lease_id, posture, obligation_kind, source_evaluation_id, related_task_id, last_transition_at, demo_mode")
      .eq("id", id)
      .single();

    expect(result.error).toBeNull();
    return result.data;
  }

  async function loadObligationEvents(id) {
    const result = await admin
      .from("provenance_events")
      .select("id, event_type, metadata")
      .eq("entity_type", "obligation_instance")
      .eq("entity_id", id)
      .like("event_type", "rpe.obligation.%")
      .order("recorded_at", { ascending: true });

    expect(result.error).toBeNull();
    return result.data;
  }

  async function loadObligationsForLease(leaseId) {
    const result = await admin
      .from("obligation_instance")
      .select("id, posture, obligation_kind, source_evaluation_id, demo_mode")
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: true });

    expect(result.error).toBeNull();
    return result.data;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    ({ client: ownerAClient } = await signInAsFixtureUser("ownerA"));
    ({ client: ownerBClient } = await signInAsFixtureUser("ownerB"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it("check 1: task writes do not move legal posture, emit events, or trigger reconciliation", async () => {
    await cleanup();
    const { evaluation, reconciliation, obligationId } = await createOpenObligation(records.boundary);
    expect(reconciliation).toMatchObject({
      action: "created",
      obligation_kind: "information_sheet",
      related_task_id: records.boundary.taskId,
    });

    const beforeObligation = await loadObligation(obligationId);
    expect(beforeObligation).toMatchObject({
      posture: "open",
      source_evaluation_id: evaluation.id,
      related_task_id: records.boundary.taskId,
    });

    const beforeEvents = await loadObligationEvents(obligationId);
    expect(eventTypes(beforeEvents)).toEqual(["rpe.obligation.created"]);

    const sent = await ownerAClient.rpc("mark_rr_task_sent", {
      p_task_id: records.boundary.taskId,
      p_account_id: accountAId,
      p_delivery_method: "email",
      p_sent_at: "2026-06-26T12:05:00.000Z",
      p_notes: "VS-2B boundary test: operational fulfilment must not move legal posture.",
    });

    expect(sent.error).toBeNull();
    expect(sent.data?.status).toBe("sent");

    const afterObligation = await loadObligation(obligationId);
    expect(afterObligation).toEqual(beforeObligation);

    const afterEvents = await loadObligationEvents(obligationId);
    expect(afterEvents).toHaveLength(beforeEvents.length);
    expect(eventTypes(afterEvents)).toEqual(["rpe.obligation.created"]);

    expect({
      obligationPosture: afterObligation.posture,
      taskStatus: sent.data.status,
      serviceEvidenceState: "missing",
    }).toEqual({
      obligationPosture: "open",
      taskStatus: "sent",
      serviceEvidenceState: "missing",
    });
  });

  it("check 2: direct posture writes and cross-account reads/writes are blocked at stored-row level", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.directWrite);
    const beforeObligation = await loadObligation(obligationId);
    const beforeEvents = await loadObligationEvents(obligationId);

    const ownerWrite = await ownerAClient
      .from("obligation_instance")
      .update({ posture: "superseded" })
      .eq("id", obligationId)
      .select("id, posture");

    expectNoRowsOrWriteError(ownerWrite);
    expect(await loadObligation(obligationId)).toEqual(beforeObligation);
    expect(await loadObligationEvents(obligationId)).toEqual(beforeEvents);

    const ownerDischargeWrite = await ownerAClient
      .from("obligation_instance")
      .update({ posture: "discharged" })
      .eq("id", obligationId)
      .select("id, posture");

    expectNoRowsOrWriteError(ownerDischargeWrite);
    expect(await loadObligation(obligationId)).toEqual(beforeObligation);

    const crossAccountRead = await ownerBClient
      .from("obligation_instance")
      .select("id, posture")
      .eq("id", obligationId);

    expect(crossAccountRead.error).toBeNull();
    expect(crossAccountRead.data).toEqual([]);

    const crossAccountWrite = await ownerBClient
      .from("obligation_instance")
      .update({ posture: "superseded" })
      .eq("id", obligationId)
      .select("id, posture");

    expectNoRowsOrWriteError(crossAccountWrite);
    expect(await loadObligation(obligationId)).toEqual(beforeObligation);
    expect(await loadObligationEvents(obligationId)).toEqual(beforeEvents);

    const crossAccountReconcile = await ownerBClient.rpc("reconcile_rra_info_sheet_obligation", {
      p_account_id: accountBId,
      p_evaluation_id: beforeObligation.source_evaluation_id,
      p_demo_mode: true,
    });

    expect(crossAccountReconcile.error).toBeTruthy();
    expect(String(crossAccountReconcile.error.message || "").toLowerCase()).toMatch(/not authorized|not found|tenancy/);
    expect(await loadObligation(obligationId)).toEqual(beforeObligation);
    expect(await loadObligationEvents(obligationId)).toEqual(beforeEvents);
  });

  it("check 3: repeated affected evaluations update the existing obligation without duplicating it", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.idempotency);
    const first = await loadObligation(obligationId);

    const secondEvaluation = await recordEvaluation(records.idempotency, {
      evaluatedAt: "2026-06-26T12:10:00.000Z",
    });
    const secondReconciliation = await reconcile(secondEvaluation.id);

    expect(secondReconciliation).toMatchObject({
      action: "idempotent_update",
      obligation_instance_id: obligationId,
      posture: "open",
      obligation_kind: "information_sheet",
    });

    const obligations = await loadObligationsForLease(records.idempotency.leaseId);
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({
      id: obligationId,
      posture: "open",
      source_evaluation_id: secondEvaluation.id,
    });
    expect(obligations[0].source_evaluation_id).not.toBe(first.source_evaluation_id);
  });

  it("check 4: obligation_kind changes supersede the old row and open a new row", async () => {
    await cleanup();
    const { obligationId: firstId } = await createOpenObligation(records.kindChange);

    const writtenStatementEval = await recordEvaluation(records.kindChange, {
      obligationKind: "written_statement",
      reasonCodes: ["AFF_WRITTEN_STATEMENT"],
      evaluatedAt: "2026-06-26T12:20:00.000Z",
    });
    const writtenStatementReconciliation = await reconcile(writtenStatementEval.id);

    expect(writtenStatementReconciliation).toMatchObject({
      action: "kind_changed_new_open",
      posture: "open",
      obligation_kind: "written_statement",
    });

    const rows = await loadObligationsForLease(records.kindChange.leaseId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === firstId)).toMatchObject({
      posture: "superseded",
      obligation_kind: "information_sheet",
    });
    expect(rows.find((row) => row.id === writtenStatementReconciliation.obligation_instance_id)).toMatchObject({
      posture: "open",
      obligation_kind: "written_statement",
      source_evaluation_id: writtenStatementEval.id,
    });

    expect(eventTypes(await loadObligationEvents(firstId))).toContain("rpe.obligation.superseded");
    expect(eventTypes(await loadObligationEvents(writtenStatementReconciliation.obligation_instance_id))).toContain("rpe.obligation.created");
  });

  it("check 5: not_affected supersedes, and later affected creates a new row without reviving superseded history", async () => {
    await cleanup();
    const { obligationId: firstId } = await createOpenObligation(records.noRevival);

    const notAffectedEval = await recordEvaluation(records.noRevival, {
      result: "not_affected",
      obligationKind: null,
      exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluationConfidence: "high",
      evaluatedAt: "2026-06-26T12:30:00.000Z",
    });
    const superseded = await reconcile(notAffectedEval.id);

    expect(superseded).toMatchObject({
      action: "superseded",
      obligation_instance_id: firstId,
      posture: "superseded",
    });
    const firstAfterSupersession = await loadObligation(firstId);
    expect(firstAfterSupersession).toMatchObject({
      posture: "superseded",
      source_evaluation_id: notAffectedEval.id,
    });

    const affectedAgainEval = await recordEvaluation(records.noRevival, {
      evaluatedAt: "2026-06-26T12:40:00.000Z",
    });
    const affectedAgain = await reconcile(affectedAgainEval.id);

    expect(affectedAgain).toMatchObject({
      action: "created",
      posture: "open",
      obligation_kind: "information_sheet",
    });
    expect(affectedAgain.obligation_instance_id).not.toBe(firstId);

    const rows = await loadObligationsForLease(records.noRevival.leaseId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === firstId)).toMatchObject({
      posture: "superseded",
      source_evaluation_id: notAffectedEval.id,
    });
    expect(rows.find((row) => row.id === affectedAgain.obligation_instance_id)).toMatchObject({
      posture: "open",
      source_evaluation_id: affectedAgainEval.id,
    });
  });

  it("check 6: needs_data moves an open obligation into a distinct requires_review bucket", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.requiresReview);

    const needsDataEval = await recordEvaluation(records.requiresReview, {
      result: "needs_data",
      obligationKind: null,
      exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: "2026-06-26T12:50:00.000Z",
    });
    const requiresReview = await reconcile(needsDataEval.id);

    expect(requiresReview).toMatchObject({
      action: "requires_review",
      obligation_instance_id: obligationId,
      posture: "requires_review",
    });
    expect(await loadObligation(obligationId)).toMatchObject({
      posture: "requires_review",
      source_evaluation_id: needsDataEval.id,
    });

    const summary = await ownerAClient.rpc("rra_obligation_posture_summary", {
      p_account_id: accountAId,
    });

    expect(summary.error).toBeNull();
    const requiresReviewBucket = summary.data.find((row) => row.posture === "requires_review");
    expect(requiresReviewBucket?.obligation_count).toBe(1);
    expect(summary.data.find((row) => row.posture === "open")).toBeUndefined();
    expect(summary.data.find((row) => row.posture === "superseded")).toBeUndefined();
    expect(summary.data.find((row) => row.posture === "discharged")).toBeUndefined();

    expect(eventTypes(await loadObligationEvents(obligationId))).toEqual([
      "rpe.obligation.created",
      "rpe.obligation.requires_review",
    ]);
  });

  it("check 7: every observed transition is atomically provenanced and demo-only", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.provenance);

    const needsDataEval = await recordEvaluation(records.provenance, {
      result: "needs_data",
      obligationKind: null,
      exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: "2026-06-26T13:00:00.000Z",
    });
    await reconcile(needsDataEval.id);

    const obligation = await loadObligation(obligationId);
    expect(obligation.demo_mode).toBe(true);

    const events = await loadObligationEvents(obligationId);
    expect(eventTypes(events)).toEqual([
      "rpe.obligation.created",
      "rpe.obligation.requires_review",
    ]);

    for (const event of events) {
      expect(event.metadata).toMatchObject({
        obligation_instance_id: obligationId,
        demo_mode: true,
      });
      for (const key of [
        "evaluation_id",
        "regulatory_change_id",
        "impact_rule_id",
        "lease_id",
        "property_id",
        "obligation_kind",
        "new_posture",
        "reason",
      ]) {
        expect(event.metadata).toHaveProperty(key);
      }
      expect(event.metadata.lease_id).toBe(records.provenance.leaseId);
      expect(event.metadata.property_id).toBe(propertyId);
    }

    expect(events.find((event) => event.event_type === "rpe.obligation.created").metadata).toMatchObject({
      previous_posture: null,
      new_posture: "open",
    });
    expect(events.find((event) => event.event_type === "rpe.obligation.requires_review").metadata).toMatchObject({
      previous_posture: "open",
      new_posture: "requires_review",
      evaluation_id: needsDataEval.id,
    });
  });
});
