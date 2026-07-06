/**
 * Headless harness for Compliance Proof Pack v0 PDF generation.
 *
 * Produces an actual PDF file from a static discharged-scenario fixture and
 * verifies the required sections are present. The generated PDF is written to
 * artifacts/compliance-proof-pack-v0-demo.pdf for visual review.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rraProofPackLabels } from "../../src/components/compliance/proofPackPresentation.js";
import { generateProofPackPdf } from "../../src/utils/proofPackPdfExport.js";

const ARTIFACT_PATH = path.join(process.cwd(), "artifacts", "compliance-proof-pack-v0-demo.pdf");

// Static fixture: discharged obligation scenario
const DISCHARGED_PAYLOAD = {
  evaluation: {
    evaluation_id: "aaaaaa00-1234-0000-0000-000000000001",
    result: "affected",
    confidence: "high",
    decision_path: [
      "jurisdiction", "tenancy_exists", "tenancy_start_date",
      "active_on_qualifying_date", "annual_rent_gbp", "company_let",
      "resident_landlord", "rent_act_1977", "pbsa", "tenancy_class", "is_wholly_oral",
    ],
    input_snapshot_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    evaluated_at: "2026-07-01T12:00:00.000Z",
    demo_mode: true,
    reason_codes: ["AFF_INFO_SHEET"],
    impact_rule_version: 1,
  },
  obligation: {
    obligation_instance_id: "bbbbbb00-5678-0000-0000-000000000002",
    posture: "discharged",
    obligation_kind: "information_sheet",
    exposure_gbp_ceiling: 7000,
    created_at: "2026-07-01T12:01:00.000Z",
    last_transition_at: "2026-07-01T12:05:00.000Z",
  },
  property: {
    property_id: "cccccc00-0000-0000-0000-000000000003",
    address: "12 Demo Lane",
    city: "London",
  },
  tenancy: {
    lease_id: "dddddd00-0000-0000-0000-000000000004",
    start_date: "2026-03-17",
    end_date: "2026-05-12",
    rent_amount: 1200,
    rent_frequency: "monthly",
    tenancy_class: "assured_shorthold",
  },
  evidence: [
    {
      evidence_id: "eeeeee00-0000-0000-0000-000000000005",
      official_info_sheet_identity: "govuk-rra-info-sheet:v1:sha256-demo",
      service_evidence_timestamp: "2026-07-01T12:03:00.000Z",
      evidence_type: "delivery_confirmation",
      captured_at: "2026-07-01T12:04:00.000Z",
    },
  ],
  basis_review: null,
  provenance: [
    {
      event_id: "fff00000-0000-0000-0000-000000000001",
      entity_type: "rule_evaluation",
      entity_id: "aaaaaa00-1234-0000-0000-000000000001",
      event_type: "evaluation_run",
      recorded_at: "2026-07-01T12:00:00.000Z",
      sequence_number: 1,
      summary: "RRA information sheet impact evaluated: affected",
    },
    {
      event_id: "fff00000-0000-0000-0000-000000000002",
      entity_type: "obligation_instance",
      entity_id: "bbbbbb00-5678-0000-0000-000000000002",
      event_type: "rpe.obligation.created",
      recorded_at: "2026-07-01T12:01:00.000Z",
      sequence_number: 2,
      summary: "Obligation created with posture: open",
    },
    {
      event_id: "fff00000-0000-0000-0000-000000000003",
      entity_type: "rra_info_sheet_service_evidence",
      entity_id: "eeeeee00-0000-0000-0000-000000000005",
      event_type: "rpe.service_evidence.captured",
      recorded_at: "2026-07-01T12:04:00.000Z",
      sequence_number: 3,
      summary: "Service evidence captured",
    },
    {
      event_id: "fff00000-0000-0000-0000-000000000004",
      entity_type: "obligation_instance",
      entity_id: "bbbbbb00-5678-0000-0000-000000000002",
      event_type: "rpe.obligation.discharged",
      recorded_at: "2026-07-01T12:05:00.000Z",
      sequence_number: 4,
      summary: "Obligation discharged",
    },
  ],
  status: {
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
    provenance_trace_status: {
      expected_events_present: true,
      missing_event_types: [],
    },
  },
};

let rawPdfBuffer;

beforeAll(() => {
  const { doc } = generateProofPackPdf(DISCHARGED_PAYLOAD, { labels: rraProofPackLabels });
  rawPdfBuffer = Buffer.from(doc.output("arraybuffer"));
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, rawPdfBuffer);
});

afterAll(() => {
  // Leave artifact in place for visual review.
});

describe("Proof Pack PDF — generation", () => {
  it("produces a valid PDF file", () => {
    expect(rawPdfBuffer.length).toBeGreaterThan(1000);
    expect(rawPdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("writes the PDF artifact to disk", () => {
    expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
  });
});

describe("Proof Pack PDF — required content", () => {
  function pdfContains(str) {
    return rawPdfBuffer.toString("binary").includes(str);
  }

  it("renders the pack title", () => {
    expect(pdfContains("RRA Information Sheet Proof Pack")).toBe(true);
  });

  it("renders the demo/legal-status label", () => {
    expect(pdfContains("Demo proof pack")).toBe(true);
  });

  it("labels input_snapshot_hash as Evidence fingerprint", () => {
    expect(pdfContains("Evidence fingerprint")).toBe(true);
  });

  it("does not claim pack_content_hash", () => {
    const raw = rawPdfBuffer.toString("binary");
    expect(raw.includes("pack_content_hash")).toBe(false);
    expect(raw.includes("Pack content hash")).toBe(false);
    expect(raw.includes("Pack hash")).toBe(false);
  });

  it("renders the Important limitations section", () => {
    expect(pdfContains("Important limitations")).toBe(true);
  });

  it("renders the disclosure-basis caveat", () => {
    expect(pdfContains("disclosure-basis tracking is not yet enabled")).toBe(true);
  });

  it("renders Evaluation and proof-chain trail section", () => {
    expect(pdfContains("Evaluation and proof-chain trail")).toBe(true);
  });

  it("renders regulation and obligation section", () => {
    expect(pdfContains("Regulation and obligation")).toBe(true);
  });

  it("renders reason codes in landlord-readable language", () => {
    expect(pdfContains("Tenancy qualifies for the information sheet requirement")).toBe(true);
  });

  it("renders rule version", () => {
    expect(pdfContains("Version 1")).toBe(true);
  });

  it("renders property summary", () => {
    expect(pdfContains("12 Demo Lane")).toBe(true);
  });

  it("renders tenancy summary with tenancy type", () => {
    expect(pdfContains("Assured Shorthold Tenancy")).toBe(true);
  });
});

describe("Proof Pack PDF — Phase 2 humanization", () => {
  function pdfContains(str) {
    return rawPdfBuffer.toString("binary").includes(str);
  }

  it("renders human date format for evaluated_at (no ISO strings in reader-facing PDF)", () => {
    // "2026-07-01T12:00:00.000Z" → "1 July 2026, 12:00 (UTC)"
    expect(pdfContains("1 July 2026")).toBe(true);
    expect(pdfContains("2026-07-01T12:00:00.000Z")).toBe(false);
  });

  it("renders human date format for tenancy start date", () => {
    // "2026-03-17" → "17 March 2026"
    expect(pdfContains("17 March 2026")).toBe(true);
    expect(pdfContains("2026-03-17")).toBe(false);
  });

  it("renders humanized event type for evaluation_run", () => {
    expect(pdfContains("Compliance check run")).toBe(true);
  });

  it("renders humanized event type for rpe.obligation.discharged", () => {
    expect(pdfContains("Obligation discharged")).toBe(true);
  });

  it("renders humanized official document identity", () => {
    expect(pdfContains("GOV.UK RRA Information Sheet")).toBe(true);
    expect(pdfContains("govuk-rra-info-sheet:v1:sha256-demo")).toBe(false);
  });

  it("renders humanized evidence type", () => {
    expect(pdfContains("Delivery confirmation")).toBe(true);
    expect(pdfContains("delivery_confirmation")).toBe(false);
  });

  it("renders rent frequency as plain English", () => {
    expect(pdfContains("per month")).toBe(true);
  });

  it("renders What's on file section heading", () => {
    expect(pdfContains("What")).toBe(true);
  });

  it("renders traceComplete label from rraProofPackLabels", () => {
    expect(pdfContains("Expected compliance events present: Yes")).toBe(true);
  });

  it("renders sub-headline describing what the pack covers", () => {
    expect(pdfContains("A record of what Tenaqo checked")).toBe(true);
  });

  it("renders Important limitations — please read header (ASCII-safe check)", () => {
    expect(pdfContains("please read")).toBe(true);
  });
});
