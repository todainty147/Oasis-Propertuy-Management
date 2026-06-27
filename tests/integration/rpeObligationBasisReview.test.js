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
  idempotentNotAffected: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d101",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d102",
  },
  idempotentNeedsData: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d103",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d104",
  },
  kindSwitch: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d105",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d106",
  },
  deferredEdge: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d107",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d108",
  },
  exposure: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d109",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d110",
  },
  exposureOpen: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d111",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d112",
  },
  readModel: {
    leaseId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d113",
    taskId: "8b4f16d3-2a79-4787-ae54-01e4c6e2d114",
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

const needsDataSnapshot = {
  ...affectedSnapshot,
  tenancy_class: {
    input_key: "tenancy_class", classification: "missing",
    value: null, confidence_basis: null,
    source_fields: ["leases.tenancy_class"],
  },
};

async function deleteMaybe(queryPromise) {
  const { error } = await queryPromise;
  if (error) throw error;
}

describe.skipIf(!isIntegrationHarnessConfigured())("RPE VS-2D obligation basis-review", () => {
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
      notes: "RPE VS-2D integration fixture.",
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
      metadata: { source: "rpe-vs2d-integration" },
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

  async function createDischargedObligation(record) {
    await seedLeaseAndTask(record);
    const evaluation = await recordEvaluation(record);
    const reconciliation = await reconcile(evaluation.id);
    expect(reconciliation).toMatchObject({ action: "created", posture: "open" });
    const obligationId = reconciliation.obligation_instance_id;

    const captured = await ownerAClient.rpc("capture_rra_info_sheet_service_evidence", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
      p_official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      p_service_evidence_timestamp: new Date().toISOString(),
      p_evidence_type: "delivery_confirmation",
      p_evidence_basis: "provider delivery receipt id demo-vs2d",
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

    return { obligationId, evaluation };
  }

  async function loadBasisReviews(obligationId) {
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

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    ({ client: ownerAClient } = await signInAsFixtureUser("ownerA"));
    ({ client: ownerBClient } = await signInAsFixtureUser("ownerB"));
  });

  afterEach(async () => {
    await cleanup();
  });

  // ─────── Idempotency: repeated not_affected_after_discharge ───────

  it("repeated not_affected_after_discharge evaluations update ONE active basis-review row, not duplicates", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.idempotentNotAffected);

    const eval1 = await recordEvaluation(records.idempotentNotAffected, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r1 = await reconcile(eval1.id);
    expect(r1).toMatchObject({
      action: "basis_change_recorded",
      posture: "discharged",
      basis_change_kind: "not_affected_after_discharge",
      review_required: true,
    });

    let reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    const firstReviewId = reviews[0].id;
    expect(reviews[0].latest_evaluation_id).toBe(eval1.id);

    // Repeat
    const eval2 = await recordEvaluation(records.idempotentNotAffected, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r2 = await reconcile(eval2.id);
    expect(r2).toMatchObject({
      action: "basis_change_recorded",
      posture: "discharged",
      basis_change_kind: "not_affected_after_discharge",
    });

    // Still one row, updated
    reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(firstReviewId);
    expect(reviews[0].latest_evaluation_id).toBe(eval2.id);

    // Each recording still emits a provenance event (append-only trail)
    const events = await loadBasisReviewEvents(firstReviewId);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.event_type === "rpe.obligation.basis_change_recorded")).toBe(true);
  });

  // ─────── Idempotency: repeated unprovable_after_discharge ───────

  it("repeated unprovable_after_discharge evaluations update ONE active basis-review row", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.idempotentNeedsData);

    const eval1 = await recordEvaluation(records.idempotentNeedsData, {
      result: "needs_data", obligationKind: null, exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: new Date().toISOString(),
    });
    await reconcile(eval1.id);

    const eval2 = await recordEvaluation(records.idempotentNeedsData, {
      result: "needs_data", obligationKind: null, exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: new Date().toISOString(),
    });
    await reconcile(eval2.id);

    const reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].basis_change_kind).toBe("unprovable_after_discharge");
    expect(reviews[0].latest_evaluation_id).toBe(eval2.id);
  });

  // ─────── Kind switch: updates current row rather than stacking ───────

  it("switching kind (not_affected → needs_data) updates the current review row, not stacks", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.kindSwitch);

    const eval1 = await recordEvaluation(records.kindSwitch, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r1 = await reconcile(eval1.id);
    expect(r1.basis_change_kind).toBe("not_affected_after_discharge");

    let reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    const reviewId = reviews[0].id;

    // Switch to needs_data
    const eval2 = await recordEvaluation(records.kindSwitch, {
      result: "needs_data", obligationKind: null, exposureGbpCeiling: null,
      missingFields: ["tenancy_class"],
      evaluatedAt: new Date().toISOString(),
    });
    const r2 = await reconcile(eval2.id);
    expect(r2.basis_change_kind).toBe("unprovable_after_discharge");

    // Same row updated, not a new row
    reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(reviewId);
    expect(reviews[0].basis_change_kind).toBe("unprovable_after_discharge");
    expect(reviews[0].latest_evaluation_id).toBe(eval2.id);
    expect(reviews[0].latest_evaluation_result).toBe("needs_data");

    // Provenance events for both recordings
    const events = await loadBasisReviewEvents(reviewId);
    expect(events).toHaveLength(2);
  });

  // ─────── Deferred edge: later affected after basis change ───────

  it("later affected after basis change records latest result without creating or reviving obligations", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.deferredEdge);

    // First: basis change via not_affected
    const evalNotAffected = await recordEvaluation(records.deferredEdge, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    const r1 = await reconcile(evalNotAffected.id);
    expect(r1.basis_change_kind).toBe("not_affected_after_discharge");

    let reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    const reviewId = reviews[0].id;

    // Then: later affected
    const evalAffected = await recordEvaluation(records.deferredEdge, {
      result: "affected",
      evaluatedAt: new Date().toISOString(),
    });
    const r2 = await reconcile(evalAffected.id);
    expect(r2).toMatchObject({
      action: "basis_change_recorded",
      posture: "discharged",
      latest_evaluation_result: "affected",
      basis_change_kind: "not_affected_after_discharge",
    });

    // Posture stays discharged
    const obligation = await admin
      .from("obligation_instance")
      .select("posture")
      .eq("id", obligationId)
      .single();
    expect(obligation.data.posture).toBe("discharged");

    // No new obligation created
    const allObligations = await admin
      .from("obligation_instance")
      .select("id")
      .eq("lease_id", records.deferredEdge.leaseId);
    expect(allObligations.data).toHaveLength(1);

    // Basis-review row updated with affected, keeps original kind
    reviews = await loadBasisReviews(obligationId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(reviewId);
    expect(reviews[0].latest_evaluation_result).toBe("affected");
    expect(reviews[0].basis_change_kind).toBe("not_affected_after_discharge");
    expect(reviews[0].review_required).toBe(true);
  });

  // ─────── Exposure semantics: excluded from exposure, surfaced in review ───────

  it("discharged-then-changed is excluded from current exposure but surfaced in review-needed count", async () => {
    await cleanup();

    // Create one discharged+changed and one open obligation
    const { obligationId: changedId } = await createDischargedObligation(records.exposure);
    const evalNotAffected = await recordEvaluation(records.exposure, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    await reconcile(evalNotAffected.id);

    await seedLeaseAndTask(records.exposureOpen);
    const evalOpen = await recordEvaluation(records.exposureOpen);
    const openReconcile = await reconcile(evalOpen.id);
    expect(openReconcile.posture).toBe("open");

    const summary = await ownerAClient.rpc("rra_obligation_posture_summary", {
      p_account_id: accountAId,
    });
    expect(summary.error).toBeNull();

    const dischargedRow = summary.data.find((row) => row.posture === "discharged");
    const openRow = summary.data.find((row) => row.posture === "open");

    // Discharged stays in discharged bucket, not open/exposure
    expect(dischargedRow).toMatchObject({
      obligation_count: 1,
      basis_review_required_count: 1,
    });
    // Open obligation is separate
    expect(openRow).toMatchObject({ obligation_count: 1 });

    // The discharged-changed obligation is NOT in open exposure
    const list = await ownerAClient.rpc("list_rra_obligation_instances", {
      p_account_id: accountAId, p_limit: 20, p_offset: 0,
    });
    expect(list.error).toBeNull();
    const changed = list.data.find((row) => row.id === changedId);
    expect(changed.posture).toBe("discharged");
    expect(changed.basis_review_required).toBe(true);
    expect(changed.basis_change_kind).toBe("not_affected_after_discharge");
  });

  // ─────── Read model: list_obligation_basis_reviews ───────

  it("list_obligation_basis_reviews returns correct data and supports resource-scoped filtering", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.readModel);

    const evalNotAffected = await recordEvaluation(records.readModel, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    await reconcile(evalNotAffected.id);

    // Account-wide list
    const allReviews = await ownerAClient.rpc("list_obligation_basis_reviews", {
      p_account_id: accountAId,
    });
    expect(allReviews.error).toBeNull();
    expect(allReviews.data.length).toBeGreaterThanOrEqual(1);
    const review = allReviews.data.find((r) => r.obligation_instance_id === obligationId);
    expect(review).toMatchObject({
      obligation_instance_id: obligationId,
      basis_change_kind: "not_affected_after_discharge",
      latest_evaluation_result: "not_affected",
      review_required: true,
      obligation_posture: "discharged",
      obligation_kind: "information_sheet",
      demo_mode: true,
    });

    // Resource-scoped list
    const scoped = await ownerAClient.rpc("list_obligation_basis_reviews", {
      p_account_id: accountAId,
      p_obligation_instance_id: obligationId,
    });
    expect(scoped.error).toBeNull();
    expect(scoped.data).toHaveLength(1);
    expect(scoped.data[0].obligation_instance_id).toBe(obligationId);
  });

  // ─────── Read model: proof-pack-facing read shows both discharge evidence and later basis review ───────

  it("proof-pack-facing read returns both discharge evidence and later evaluation change", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.readModel);

    const evalNotAffected = await recordEvaluation(records.readModel, {
      result: "not_affected", obligationKind: null, exposureGbpCeiling: null,
      reasonCodes: ["EXCL_JURISDICTION"],
      evaluatedAt: new Date().toISOString(),
    });
    await reconcile(evalNotAffected.id);

    // list_rra_obligation_instances returns both evidence and basis-review columns
    const list = await ownerAClient.rpc("list_rra_obligation_instances", {
      p_account_id: accountAId, p_limit: 20, p_offset: 0,
    });
    expect(list.error).toBeNull();
    const row = list.data.find((r) => r.id === obligationId);

    // Discharge evidence present
    expect(row.latest_service_evidence_id).toBeTruthy();
    expect(row.latest_official_info_sheet_identity).toBe("govuk-rra-info-sheet:v1:sha256-demo");

    // Later basis-review change present
    expect(row.basis_review_id).toBeTruthy();
    expect(row.basis_change_kind).toBe("not_affected_after_discharge");
    expect(row.basis_latest_evaluation_result).toBe("not_affected");
    expect(row.basis_review_required).toBe(true);
  });

  // ─────── Cross-account: Shape 2 on list_obligation_basis_reviews ───────

  it("list_obligation_basis_reviews throws on Shape 2 (own account + foreign obligation)", async () => {
    await cleanup();
    const { obligationId } = await createDischargedObligation(records.readModel);

    const result = await ownerBClient.rpc("list_obligation_basis_reviews", {
      p_account_id: accountBId,
      p_obligation_instance_id: obligationId,
    });
    expect(result.error).toBeTruthy();
    expect(String(result.error.message || "").toLowerCase()).toMatch(/not found|not authorized/);
  });
});
