/**
 * Real-data end-to-end proof for Compliance Proof Pack v0.
 *
 * Seeds a discharged obligation on the live local DB, calls get_obligation_proof_pack
 * (the actual SQL read model), feeds the returned payload to generateProofPackPdf,
 * and saves the PDF to artifacts/compliance-proof-pack-v0-demo-realdata.pdf.
 *
 * This test DOES NOT hand-build a payload. Every field comes from the DB.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rraProofPackLabels } from "../../src/components/compliance/proofPackPresentation.js";
import { generateProofPackPdf } from "../../src/utils/proofPackPdfExport.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ARTIFACT_PATH = path.join(process.cwd(), "artifacts", "compliance-proof-pack-v0-demo-realdata.pdf");

const accountAId = isolationFixtures.accounts.accountA.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const REAL_DATA_LEASE_ID = "9d5c2a11-0000-4000-a000-000000000001";
const REAL_DATA_TASK_ID  = "9d5c2a11-0000-4000-a000-000000000002";

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

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Compliance Proof Pack v0 — real-data PDF generation",
  () => {
    const admin = getIntegrationAdminClient();
    let ownerAClient;
    let seededUsers;
    let obligationId;
    let realPayload;
    let rawPdfBuffer;

    async function cleanup() {
      const { data: evaluations } = await admin
        .from("rule_evaluation").select("id").in("tenancy_id", [REAL_DATA_LEASE_ID]);
      const evaluationIds = (evaluations || []).map((r) => r.id);

      await admin.from("obligation_basis_review").delete().in("account_id", [accountAId]);
      if (evaluationIds.length > 0) {
        await admin.from("rra_info_sheet_service_evidence").delete().in(
          "obligation_instance_id",
          (await admin.from("obligation_instance").select("id").in("lease_id", [REAL_DATA_LEASE_ID]).then((r) => (r.data || []).map((x) => x.id))),
        );
        await admin.from("obligation_instance").delete().in("lease_id", [REAL_DATA_LEASE_ID]);
        await admin.from("rule_evaluation").delete().in("id", evaluationIds);
      }
      await admin.from("renters_rights_tasks").delete().eq("id", REAL_DATA_TASK_ID);
      await admin.from("leases").delete().eq("id", REAL_DATA_LEASE_ID);
    }

    beforeAll(async () => {
      seededUsers = await ensureIsolationHarnessSeed();
      ({ client: ownerAClient } = await signInAsFixtureUser("ownerA"));

      await cleanup();

      // Seed lease
      const { error: leaseError } = await admin.from("leases").insert({
        id: REAL_DATA_LEASE_ID,
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
        notes: "Proof Pack v0 real-data PDF integration fixture.",
      });
      if (leaseError) throw new Error(`Lease seed failed: ${leaseError.message}`);

      // Seed task
      const { error: taskError } = await admin.from("renters_rights_tasks").insert({
        id: REAL_DATA_TASK_ID,
        account_id: accountAId,
        property_id: propertyId,
        tenant_id: tenantId,
        lease_id: REAL_DATA_LEASE_ID,
        requirement_type: "renters_rights_information_sheet",
        jurisdiction: "GB-ENG",
        due_date: "2026-05-31",
        status: "required",
        metadata: { source: "proof-pack-v0-real-data-integration" },
      });
      if (taskError) throw new Error(`Task seed failed: ${taskError.message}`);

      // Record evaluation
      const evalResult = await ownerAClient.rpc("record_rra_info_sheet_rule_evaluation", {
        p_account_id: accountAId,
        p_tenancy_id: REAL_DATA_LEASE_ID,
        p_input_snapshot: affectedSnapshot,
        p_decision_path: affectedDecisionPath,
        p_result: "affected",
        p_obligation_kind: "information_sheet",
        p_exposure_gbp_ceiling: 7000,
        p_reason_codes: ["AFF_INFO_SHEET"],
        p_missing_fields: [],
        p_deferred_until: null,
        p_deferred_until_basis: null,
        p_evaluation_confidence: "high",
        p_demo_mode: true,
        p_evaluated_at: new Date().toISOString(),
      });
      if (evalResult.error) throw new Error(`Evaluation RPC failed: ${evalResult.error.message}`);

      // Reconcile → obligation created (open)
      const reconcileResult = await ownerAClient.rpc("reconcile_rra_info_sheet_obligation", {
        p_account_id: accountAId,
        p_evaluation_id: evalResult.data.id,
        p_demo_mode: true,
      });
      if (reconcileResult.error) throw new Error(`Reconcile RPC failed: ${reconcileResult.error.message}`);
      obligationId = reconcileResult.data.obligation_instance_id;

      // Capture evidence
      const evidenceResult = await ownerAClient.rpc("capture_rra_info_sheet_service_evidence", {
        p_account_id: accountAId,
        p_obligation_instance_id: obligationId,
        p_official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
        p_service_evidence_timestamp: new Date().toISOString(),
        p_evidence_type: "delivery_confirmation",
        p_evidence_basis: "provider delivery receipt — pp-v0-real-data",
        p_official_info_sheet_source: "official_document_catalogue",
        p_capture_source: "manual_rpe_service_evidence_capture",
        p_demo_mode: true,
      });
      if (evidenceResult.error) throw new Error(`Evidence RPC failed: ${evidenceResult.error.message}`);

      // Discharge obligation
      const dischargeResult = await ownerAClient.rpc("reconcile_rra_info_sheet_obligation_discharge", {
        p_account_id: accountAId,
        p_obligation_instance_id: obligationId,
        p_service_evidence_id: evidenceResult.data.evidence_id,
        p_demo_mode: true,
      });
      if (dischargeResult.error) throw new Error(`Discharge RPC failed: ${dischargeResult.error.message}`);

      // ── Call the actual get_obligation_proof_pack read model ────────────
      const packResult = await ownerAClient.rpc("get_obligation_proof_pack", {
        p_account_id: accountAId,
        p_obligation_instance_id: obligationId,
      });
      if (packResult.error) throw new Error(`get_obligation_proof_pack failed: ${packResult.error.message}`);
      realPayload = packResult.data;

      // ── Generate PDF from real payload ────────────────────────────────
      const { doc } = generateProofPackPdf(realPayload, { labels: rraProofPackLabels });
      rawPdfBuffer = Buffer.from(doc.output("arraybuffer"));
      fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
      fs.writeFileSync(ARTIFACT_PATH, rawPdfBuffer);
    });

    afterAll(async () => {
      await cleanup();
    });

    // ── Payload shape assertions ─────────────────────────────────────────

    it("property block is populated from DB", () => {
      expect(realPayload.property).not.toBeNull();
      expect(realPayload.property.property_id).toBeTruthy();
      expect(realPayload.property.address).toBeTruthy();
      expect(realPayload.property.city).toBeTruthy();
    });

    it("tenancy block is populated from DB", () => {
      expect(realPayload.tenancy).not.toBeNull();
      expect(realPayload.tenancy.lease_id).toBe(REAL_DATA_LEASE_ID);
      expect(realPayload.tenancy.start_date).toBeTruthy();
      expect(realPayload.tenancy.rent_amount).toBeGreaterThan(0);
      expect(realPayload.tenancy.tenancy_class).toBeTruthy();
    });

    it("assessment/evaluation data is present", () => {
      expect(realPayload.evaluation).not.toBeNull();
      expect(realPayload.evaluation.evaluation_id).toBeTruthy();
      expect(realPayload.evaluation.result).toBe("affected");
      expect(realPayload.evaluation.confidence).toBe("high");
      expect(realPayload.evaluation.input_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("obligation data is present", () => {
      expect(realPayload.obligation).not.toBeNull();
      expect(realPayload.obligation.obligation_instance_id).toBe(obligationId);
      expect(realPayload.obligation.posture).toBe("discharged");
      expect(realPayload.obligation.obligation_kind).toBe("information_sheet");
      expect(realPayload.obligation.exposure_gbp_ceiling).toBe(7000);
    });

    it("evidence is present (discharged scenario)", () => {
      expect(realPayload.evidence).toHaveLength(1);
      expect(realPayload.evidence[0].official_info_sheet_identity).toBe(
        "govuk-rra-info-sheet:v1:sha256-demo",
      );
      expect(realPayload.evidence[0].evidence_type).toBe("delivery_confirmation");
    });

    it("proof trail is present and complete", () => {
      expect(realPayload.provenance.length).toBeGreaterThanOrEqual(4);
      const eventTypes = realPayload.provenance.map((e) => e.event_type);
      expect(eventTypes).toContain("evaluation_run");
      expect(eventTypes).toContain("rpe.obligation.created");
      expect(eventTypes).toContain("rpe.service_evidence.captured");
      expect(eventTypes).toContain("rpe.obligation.discharged");
      expect(realPayload.status.provenance_trace_status.expected_events_present).toBe(true);
    });

    it("reason_codes and impact_rule_version are present on evaluation", () => {
      expect(realPayload.evaluation.reason_codes).toContain("AFF_INFO_SHEET");
      expect(realPayload.evaluation.impact_rule_version).toBeGreaterThanOrEqual(1);
    });

    // ── PDF assertions ────────────────────────────────────────────────────

    it("PDF file exists on disk", () => {
      expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
    });

    it("PDF starts with %PDF- header", () => {
      expect(rawPdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
    });

    it("PDF byte size is substantial (not empty)", () => {
      const byteSize = rawPdfBuffer.length;
      expect(byteSize).toBeGreaterThan(5000);
      console.log(`Real-data PDF byte size: ${byteSize} bytes`);
    });

    it("PDF contains property address from DB", () => {
      expect(rawPdfBuffer.toString("binary").includes("11 Starlight Avenue")).toBe(true);
    });

    it("PDF contains tenancy class from DB", () => {
      expect(rawPdfBuffer.toString("binary").includes("Assured Shorthold Tenancy")).toBe(true);
    });

    it("honesty: Evidence fingerprint label present, no pack hash claims", () => {
      const raw = rawPdfBuffer.toString("binary");
      expect(raw.includes("Evidence fingerprint")).toBe(true);
      expect(raw.includes("pack_content_hash")).toBe(false);
      expect(raw.includes("Pack content hash")).toBe(false);
      expect(raw.includes("Pack hash")).toBe(false);
    });

    it("honesty: demo/legal-status label present", () => {
      expect(rawPdfBuffer.toString("binary").includes("Demo proof pack")).toBe(true);
    });

    it("honesty: Important limitations section present", () => {
      expect(rawPdfBuffer.toString("binary").includes("Important limitations")).toBe(true);
    });
  },
);
