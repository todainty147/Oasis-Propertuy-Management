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
  admissibility: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c001",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c002",
  },
  nonOpenSuperseded: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c003",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c004",
  },
  nonOpenReview: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c005",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c006",
  },
  freezeNotAffected: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c007",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c008",
  },
  freezeNeedsData: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c009",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c010",
  },
  crossAccount: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c011",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2c012",
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

describe.skipIf(!isIntegrationHarnessConfigured())("RPE VS-2C obligation discharge", () => {
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
      notes: "RPE VS-2C integration fixture: draft lease avoids active-per-property conflicts.",
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
      metadata: { source: "rpe-vs2c-integration" },
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
    return {
      evaluation,
      obligationId: reconciliation.obligation_instance_id,
    };
  }

  async function captureEvidence(obligationId, overrides = {}, client = ownerAClient, accountId = accountAId) {
    return client.rpc("capture_rra_info_sheet_service_evidence", {
      p_account_id: accountId,
      p_obligation_instance_id: obligationId,
      p_official_info_sheet_identity: overrides.officialInfoSheetIdentity ?? "govuk-rra-info-sheet:v1:sha256-demo",
      p_service_evidence_timestamp: Object.hasOwn(overrides, "serviceEvidenceTimestamp")
        ? overrides.serviceEvidenceTimestamp
        : "2026-06-26T12:05:00.000Z",
      p_evidence_type: overrides.evidenceType ?? "delivery_confirmation",
      p_evidence_basis: overrides.evidenceBasis ?? "provider delivery receipt id demo-123",
      p_official_info_sheet_source: overrides.officialInfoSheetSource ?? "official_document_catalogue",
      p_capture_source: "manual_rpe_service_evidence_capture",
      p_demo_mode: true,
    });
  }

  async function discharge(obligationId, evidenceId, client = ownerAClient, accountId = accountAId) {
    return client.rpc("reconcile_rra_info_sheet_obligation_discharge", {
      p_account_id: accountId,
      p_obligation_instance_id: obligationId,
      p_service_evidence_id: evidenceId,
      p_demo_mode: true,
    });
  }

  async function loadObligation(id) {
    const result = await admin
      .from("obligation_instance")
      .select("id, lease_id, posture, obligation_kind, source_evaluation_id, review_flag, review_flag_source_evaluation_id, last_transition_at, demo_mode")
      .eq("id", id)
      .single();

    expect(result.error).toBeNull();
    return result.data;
  }

  async function loadEvidenceForObligation(id) {
    const result = await admin
      .from("rra_info_sheet_service_evidence")
      .select("id, obligation_instance_id, official_info_sheet_identity, service_evidence_timestamp, evidence_type, captured_by, capture_event_id, demo_mode")
      .eq("obligation_instance_id", id)
      .order("created_at", { ascending: true });

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

  async function loadBasisReviewsForObligation(obligationId) {
    const result = await admin
      .from("obligation_basis_review")
      .select("*")
      .eq("obligation_instance_id", obligationId)
      .order("created_at", { ascending: true });

    expect(result.error).toBeNull();
    return result.data;
  }

  async function loadBasisReviewEvents(basisReviewId) {
    const result = await admin
      .from("provenance_events")
      .select("id, event_type, metadata")
      .eq("entity_type", "obligation_basis_review")
      .eq("entity_id", basisReviewId)
      .order("recorded_at", { ascending: true });

    expect(result.error).toBeNull();
    return result.data;
  }

  async function loadEvidenceEvents(evidenceId) {
    const result = await admin
      .from("provenance_events")
      .select("id, event_type, metadata")
      .eq("entity_type", "rra_info_sheet_service_evidence")
      .eq("entity_id", evidenceId)
      .order("recorded_at", { ascending: true });

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

  it("rejects half-admissible evidence and only discharges after both artefact identity and service proof are captured", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.admissibility);
    const beforeObligation = await loadObligation(obligationId);

    const identityOnly = await captureEvidence(obligationId, {
      serviceEvidenceTimestamp: null,
    });
    expect(identityOnly.error).toBeTruthy();
    expect(String(identityOnly.error.message || "").toLowerCase()).toContain("service_evidence_timestamp is required");

    const timestampOnly = await captureEvidence(obligationId, {
      officialInfoSheetIdentity: "",
    });
    expect(timestampOnly.error).toBeTruthy();
    expect(String(timestampOnly.error.message || "").toLowerCase()).toContain("official_info_sheet_identity is required");

    const filenameSource = await captureEvidence(obligationId, {
      officialInfoSheetSource: "filename",
    });
    expect(filenameSource.error).toBeTruthy();
    expect(String(filenameSource.error.message || "").toLowerCase()).toContain("inadmissible");

    expect(await loadEvidenceForObligation(obligationId)).toEqual([]);
    expect(await loadObligation(obligationId)).toEqual(beforeObligation);

    const captured = await captureEvidence(obligationId);
    expect(captured.error).toBeNull();
    expect(captured.data?.evidence_id).toBeTruthy();

    const afterCapture = await loadObligation(obligationId);
    expect(afterCapture).toEqual(beforeObligation);

    const evidenceRows = await loadEvidenceForObligation(obligationId);
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0]).toMatchObject({
      obligation_instance_id: obligationId,
      official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      evidence_type: "delivery_confirmation",
      demo_mode: true,
    });
    expect(evidenceRows[0].capture_event_id).toBeTruthy();

    const evidenceEvents = await loadEvidenceEvents(evidenceRows[0].id);
    expect(eventTypes(evidenceEvents)).toEqual(["rpe.service_evidence.captured"]);

    const discharged = await discharge(obligationId, evidenceRows[0].id);
    expect(discharged.error).toBeNull();
    expect(discharged.data).toMatchObject({
      action: "discharged",
      posture: "discharged",
      obligation_instance_id: obligationId,
      evidence_id: evidenceRows[0].id,
      demo_mode: true,
    });

    expect(await loadObligation(obligationId)).toMatchObject({
      posture: "discharged",
      demo_mode: true,
    });
    const obligationEvents = await loadObligationEvents(obligationId);
    expect(eventTypes(obligationEvents)).toEqual([
      "rpe.obligation.created",
      "rpe.obligation.discharged",
    ]);
    expect(obligationEvents.find((event) => event.event_type === "rpe.obligation.discharged").metadata).toMatchObject({
      evidence_id: evidenceRows[0].id,
      official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      previous_posture: "open",
      new_posture: "discharged",
      demo_mode: true,
    });
  });

  it("rejects discharge capture on non-open obligations", async () => {
    await cleanup();
    const { obligationId: supersededId } = await createOpenObligation(records.nonOpenSuperseded);
    const notAffectedEval = await recordEvaluation(records.nonOpenSuperseded, {
      result: "not_affected",
      obligationKind: null,
      exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: "2026-06-26T12:15:00.000Z",
    });
    await reconcile(notAffectedEval.id);
    expect(await loadObligation(supersededId)).toMatchObject({ posture: "superseded" });

    const supersededCapture = await captureEvidence(supersededId);
    expect(supersededCapture.error).toBeTruthy();
    expect(String(supersededCapture.error.message || "").toLowerCase()).toContain("requires an open obligation");

    const { obligationId: reviewId } = await createOpenObligation(records.nonOpenReview);
    const needsDataEval = await recordEvaluation(records.nonOpenReview, {
      result: "needs_data",
      obligationKind: null,
      exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: "2026-06-26T12:20:00.000Z",
    });
    await reconcile(needsDataEval.id);
    expect(await loadObligation(reviewId)).toMatchObject({ posture: "requires_review" });

    const reviewCapture = await captureEvidence(reviewId);
    expect(reviewCapture.error).toBeTruthy();
    expect(String(reviewCapture.error.message || "").toLowerCase()).toContain("requires an open obligation");
  });

  it("freezes discharged obligations and records two-axis basis-review on later not_affected or needs_data evaluations", async () => {
    await cleanup();
    const { obligationId: notAffectedId } = await createOpenObligation(records.freezeNotAffected);
    const capturedNotAffected = await captureEvidence(notAffectedId);
    expect(capturedNotAffected.error).toBeNull();
    const dischargedNotAffected = await discharge(notAffectedId, capturedNotAffected.data.evidence_id);
    expect(dischargedNotAffected.error).toBeNull();

    const notAffectedEval = await recordEvaluation(records.freezeNotAffected, {
      result: "not_affected",
      obligationKind: null,
      exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: "2026-06-26T12:25:00.000Z",
    });
    const notAffectedReconcile = await reconcile(notAffectedEval.id);
    expect(notAffectedReconcile).toMatchObject({
      action: "basis_change_recorded",
      posture: "discharged",
      basis_change_kind: "not_affected_after_discharge",
      latest_evaluation_result: "not_affected",
      review_required: true,
      demo_mode: true,
    });
    expect(notAffectedReconcile.basis_review_id).toBeTruthy();

    // Side-columns on obligation_instance still written (backward compat)
    expect(await loadObligation(notAffectedId)).toMatchObject({
      posture: "discharged",
      review_flag: "discharged_basis_changed",
      review_flag_source_evaluation_id: notAffectedEval.id,
    });

    // Stored basis-review row exists
    const notAffectedReviews = await loadBasisReviewsForObligation(notAffectedId);
    expect(notAffectedReviews).toHaveLength(1);
    expect(notAffectedReviews[0]).toMatchObject({
      obligation_instance_id: notAffectedId,
      basis_change_kind: "not_affected_after_discharge",
      latest_evaluation_result: "not_affected",
      basis_change_status: "changed_after_discharge",
      review_required: true,
      demo_mode: true,
    });
    expect(notAffectedReviews[0].provenance_event_id).toBeTruthy();

    const { obligationId: needsDataId } = await createOpenObligation(records.freezeNeedsData);
    const capturedNeedsData = await captureEvidence(needsDataId);
    expect(capturedNeedsData.error).toBeNull();
    const dischargedNeedsData = await discharge(needsDataId, capturedNeedsData.data.evidence_id);
    expect(dischargedNeedsData.error).toBeNull();

    const needsDataEval = await recordEvaluation(records.freezeNeedsData, {
      result: "needs_data",
      obligationKind: null,
      exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: "2026-06-26T12:30:00.000Z",
    });
    const needsDataReconcile = await reconcile(needsDataEval.id);
    expect(needsDataReconcile).toMatchObject({
      action: "basis_change_recorded",
      posture: "discharged",
      basis_change_kind: "unprovable_after_discharge",
      latest_evaluation_result: "needs_data",
      review_required: true,
    });

    // Stored basis-review row preserves distinct kind
    const needsDataReviews = await loadBasisReviewsForObligation(needsDataId);
    expect(needsDataReviews).toHaveLength(1);
    expect(needsDataReviews[0].basis_change_kind).toBe("unprovable_after_discharge");

    // Read model surfaces VS-2D columns
    const list = await ownerAClient.rpc("list_rra_obligation_instances", {
      p_account_id: accountAId,
      p_limit: 20,
      p_offset: 0,
    });
    expect(list.error).toBeNull();
    const flagged = list.data.filter((row) => [notAffectedId, needsDataId].includes(row.id));
    expect(flagged).toHaveLength(2);
    expect(flagged.every((row) => row.posture === "discharged")).toBe(true);
    expect(flagged.every((row) => row.review_flag === "discharged_basis_changed")).toBe(true);
    expect(flagged.every((row) => row.basis_review_required === true)).toBe(true);
    const notAffectedRow = flagged.find((row) => row.id === notAffectedId);
    const needsDataRow = flagged.find((row) => row.id === needsDataId);
    expect(notAffectedRow.basis_change_kind).toBe("not_affected_after_discharge");
    expect(needsDataRow.basis_change_kind).toBe("unprovable_after_discharge");

    // Posture summary: discharged + basis_review_required_count
    const summary = await ownerAClient.rpc("rra_obligation_posture_summary", {
      p_account_id: accountAId,
    });
    expect(summary.error).toBeNull();
    expect(summary.data.find((row) => row.posture === "discharged")).toMatchObject({
      obligation_count: 2,
      review_flag_count: 2,
      basis_review_required_count: 2,
    });

    // Obligation events: created + discharged only (VS-2D events are on obligation_basis_review entity)
    for (const obligationId of [notAffectedId, needsDataId]) {
      expect(eventTypes(await loadObligationEvents(obligationId))).toEqual([
        "rpe.obligation.created",
        "rpe.obligation.discharged",
      ]);
    }

    // Basis-review provenance events exist
    for (const obligationId of [notAffectedId, needsDataId]) {
      const reviews = await loadBasisReviewsForObligation(obligationId);
      const basisEvents = await loadBasisReviewEvents(reviews[0].id);
      expect(basisEvents).toHaveLength(1);
      expect(basisEvents[0].event_type).toBe("rpe.obligation.basis_change_recorded");
      expect(basisEvents[0].metadata).toMatchObject({ demo_mode: true });
    }
  });

  it("keeps discharged stable for later affected evaluations and for task writes", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.crossAccount);
    const captured = await captureEvidence(obligationId);
    expect(captured.error).toBeNull();
    const discharged = await discharge(obligationId, captured.data.evidence_id);
    expect(discharged.error).toBeNull();

    const before = await loadObligation(obligationId);
    expect(before).toMatchObject({ posture: "discharged" });

    const affectedAgain = await recordEvaluation(records.crossAccount, {
      evaluatedAt: "2026-06-26T12:40:00.000Z",
    });
    const affectedAgainReconcile = await reconcile(affectedAgain.id);
    expect(affectedAgainReconcile).toMatchObject({
      action: "already_discharged",
      posture: "discharged",
      obligation_instance_id: obligationId,
    });
    expect(await loadObligation(obligationId)).toEqual(before);

    const taskWrite = await ownerAClient.rpc("mark_rr_task_sent", {
      p_task_id: records.crossAccount.taskId,
      p_account_id: accountAId,
      p_delivery_method: "email",
      p_sent_at: "2026-06-26T12:45:00.000Z",
      p_notes: "VS-2C boundary test: task write cannot move discharged posture.",
    });
    expect(taskWrite.error).toBeNull();
    expect(await loadObligation(obligationId)).toEqual(before);
  });

  it("rejects cross-account service evidence capture and discharge attempts", async () => {
    await cleanup();
    const { obligationId } = await createOpenObligation(records.crossAccount);

    const captureAsAccountA = await captureEvidence(obligationId, {}, ownerBClient, accountAId);
    expect(captureAsAccountA.error).toBeTruthy();
    expect(String(captureAsAccountA.error.message || "").toLowerCase()).toMatch(/not authorized/);

    const captureAsAccountB = await captureEvidence(obligationId, {}, ownerBClient, accountBId);
    expect(captureAsAccountB.error).toBeTruthy();
    expect(String(captureAsAccountB.error.message || "").toLowerCase()).toMatch(/not found|not authorized/);

    const captured = await captureEvidence(obligationId);
    expect(captured.error).toBeNull();

    const dischargeAsAccountA = await discharge(obligationId, captured.data.evidence_id, ownerBClient, accountAId);
    expect(dischargeAsAccountA.error).toBeTruthy();
    expect(String(dischargeAsAccountA.error.message || "").toLowerCase()).toMatch(/not authorized/);

    const dischargeAsAccountB = await discharge(obligationId, captured.data.evidence_id, ownerBClient, accountBId);
    expect(dischargeAsAccountB.error).toBeTruthy();
    expect(String(dischargeAsAccountB.error.message || "").toLowerCase()).toMatch(/not found|not authorized/);

    expect(await loadObligation(obligationId)).toMatchObject({ posture: "open" });
  });
});
