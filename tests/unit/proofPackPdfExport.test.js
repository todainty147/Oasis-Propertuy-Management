import { describe, expect, it } from "vitest";

const { generateProofPackPdf } = await import(
  "../../src/utils/proofPackPdfExport.js"
);

// ─── Mock payloads (same shapes as VS-2 tests) ────────────────────────────

const OPEN_PAYLOAD = {
  evaluation: {
    evaluation_id: "eval-1",
    result: "affected",
    confidence: "high",
    decision_path: ["node_a", "node_b"],
    input_snapshot_hash: "abc123def456",
    evaluated_at: "2026-06-15T10:00:00Z",
    demo_mode: true,
  },
  obligation: {
    obligation_instance_id: "obl-1",
    posture: "open",
    obligation_kind: "rra_information_sheet",
    exposure_gbp_ceiling: 7000,
    created_at: "2026-06-15T10:00:01Z",
    last_transition_at: "2026-06-15T10:00:01Z",
  },
  evidence: [],
  basis_review: null,
  provenance: [
    {
      event_id: "pe-1",
      entity_type: "rule_evaluation",
      entity_id: "eval-1",
      event_type: "evaluation_run",
      recorded_at: "2026-06-15T10:00:00Z",
      sequence_number: 1,
      summary: "Evaluation recorded",
      reason: null,
      metadata: {},
    },
    {
      event_id: "pe-2",
      entity_type: "obligation_instance",
      entity_id: "obl-1",
      event_type: "rpe.obligation.created",
      recorded_at: "2026-06-15T10:00:01Z",
      sequence_number: 2,
      summary: "Obligation created",
      reason: null,
      metadata: {},
    },
  ],
  status: {
    evaluation_recorded: true,
    obligation_created: true,
    discharge_evidence_present: false,
    provenance_trail_intact: true,
    basis_review_required: false,
    evidence_missing: true,
    provenance_trace_status: {
      expected_events_present: true,
      missing_event_types: [],
    },
    demo_mode: true,
    gate_b_signed_off: false,
    customer_facing_allowed: false,
    pack_status_label: "Demo proof pack — not legal sign-off",
  },
};

const DISCHARGED_PAYLOAD = {
  ...OPEN_PAYLOAD,
  obligation: {
    ...OPEN_PAYLOAD.obligation,
    posture: "discharged",
  },
  evidence: [
    {
      evidence_id: "ev-1",
      official_info_sheet_identity: "RRA-IS-2026-001",
      service_evidence_timestamp: "2026-06-16T14:00:00Z",
      evidence_type: "gov_uk_information_sheet",
      captured_by: "user-1",
      captured_at: "2026-06-16T14:01:00Z",
    },
  ],
  status: {
    ...OPEN_PAYLOAD.status,
    discharge_evidence_present: true,
    evidence_missing: false,
  },
};

const BASIS_CHANGED_PAYLOAD = {
  ...DISCHARGED_PAYLOAD,
  basis_review: {
    basis_review_id: "br-1",
    latest_evaluation_id: "eval-2",
    latest_evaluation_result: "not_affected",
    basis_change_kind: "evaluation_result_changed",
    review_required: true,
    review_flagged_at: "2026-06-17T09:00:00Z",
    last_seen_at: "2026-06-17T09:00:00Z",
  },
  status: {
    ...DISCHARGED_PAYLOAD.status,
    basis_review_required: true,
  },
};

const INCOMPLETE_PROVENANCE_PAYLOAD = {
  ...OPEN_PAYLOAD,
  status: {
    ...OPEN_PAYLOAD.status,
    provenance_trace_status: {
      expected_events_present: false,
      missing_event_types: ["rpe.obligation.created"],
    },
  },
};

function buildLongPayload() {
  const manyEvents = [];
  for (let i = 0; i < 60; i++) {
    manyEvents.push({
      event_id: `pe-${i}`,
      entity_type: "rule_evaluation",
      entity_id: `eval-${i}`,
      event_type: `event_type_${i}`,
      recorded_at: `2026-06-15T10:${String(i).padStart(2, "0")}:00Z`,
      sequence_number: i + 1,
      summary: `Event summary line ${i}`,
      reason: null,
      metadata: {},
    });
  }
  return {
    ...OPEN_PAYLOAD,
    provenance: manyEvents,
  };
}

function extractPdfText(doc) {
  const pages = doc.internal.pages;
  const result = [];
  for (let i = 1; i < pages.length; i++) {
    const pageContent = pages[i];
    if (!pageContent) {
      result.push("");
      continue;
    }
    const lines = Array.isArray(pageContent)
      ? pageContent.join("\n")
      : String(pageContent);
    result.push(lines);
  }
  return result;
}

function extractAllText(doc) {
  return extractPdfText(doc).join("\n");
}

// ─── ★ PDF artefact: payload-only (renders from mock, no data layer) ──────

describe("★ Proof Pack VS-3 PDF — payload-only artefact (closure test)", () => {
  it("generates a PDF from open payload mock alone — no data layer needed", () => {
    const { doc, exportedAt } = generateProofPackPdf(OPEN_PAYLOAD);
    expect(doc).toBeDefined();
    expect(exportedAt).toBeTruthy();
    const output = doc.output("arraybuffer");
    expect(output.byteLength).toBeGreaterThan(100);
  });

  it("generates a PDF from discharged payload mock alone", () => {
    const { doc } = generateProofPackPdf(DISCHARGED_PAYLOAD);
    const output = doc.output("arraybuffer");
    expect(output.byteLength).toBeGreaterThan(100);
  });

  it("generates a PDF from basis-changed payload mock alone", () => {
    const { doc } = generateProofPackPdf(BASIS_CHANGED_PAYLOAD);
    const output = doc.output("arraybuffer");
    expect(output.byteLength).toBeGreaterThan(100);
  });

  it("throws on null payload — does not silently produce empty PDF", () => {
    expect(() => generateProofPackPdf(null)).toThrow("Payload is required");
  });
});

// ─── ★ PDF artefact: per-page demo watermark (escape-the-context defense) ──

describe("★ Proof Pack VS-3 PDF — per-page demo watermark (closure test)", () => {
  it("single-page PDF has demo watermark text in its content", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const allText = extractAllText(doc);
    expect(allText).toContain("Demo proof pack");
  });

  it("multi-page PDF has demo header/footer text on EVERY page", () => {
    const longPayload = buildLongPayload();
    const { doc } = generateProofPackPdf(longPayload);
    const pages = extractPdfText(doc);
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 0; i < pages.length; i++) {
      expect(pages[i]).toContain("Demo proof pack");
      expect(pages[i]).toContain("not legal sign-off");
    }
  });

  it("watermark reads from payload.status.pack_status_label — not hardcoded only", () => {
    const customPayload = {
      ...OPEN_PAYLOAD,
      status: { ...OPEN_PAYLOAD.status, pack_status_label: "Custom watermark label for test" },
    };
    const { doc } = generateProofPackPdf(customPayload);
    const allText = extractAllText(doc);
    expect(allText).toContain("Custom watermark label for test");
  });

  it("watermark header/footer text on every page of multi-page PDF", () => {
    const longPayload = buildLongPayload();
    const { doc } = generateProofPackPdf(longPayload);
    const pages = extractPdfText(doc);
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 0; i < pages.length; i++) {
      expect(pages[i]).toContain("Demo proof pack");
      expect(pages[i]).toContain("not legal sign-off");
    }
  });
});

// ─── ★ PDF artefact: zero writes ──────────────────────────────────────────

describe("★ Proof Pack VS-3 PDF — zero writes (closure test)", () => {
  it("generating PDF does not modify the input payload", () => {
    const payloadCopy = JSON.parse(JSON.stringify(OPEN_PAYLOAD));
    generateProofPackPdf(payloadCopy);
    expect(payloadCopy).toEqual(OPEN_PAYLOAD);
  });

  it("exported_at is the only new value — generated at export time", () => {
    const before = new Date().toISOString();
    const { exportedAt } = generateProofPackPdf(OPEN_PAYLOAD);
    const after = new Date().toISOString();
    expect(exportedAt >= before).toBe(true);
    expect(exportedAt <= after).toBe(true);
  });
});

// ─── ★ PDF artefact: no aggregate verdict ─────────────────────────────────

describe("★ Proof Pack VS-3 PDF — no aggregate verdict (closure test)", () => {
  it("PDF text contains no forbidden verdict language", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD]) {
      const { doc } = generateProofPackPdf(p);
      const text = extractAllText(doc).toLowerCase();
      expect(text).not.toContain("compliant");
      expect(text).not.toContain("court-ready");
      expect(text).not.toContain("court ready");
      expect(text).not.toMatch(/\bsafe\b/);
      expect(text).not.toContain("passed");
      expect(text).not.toContain("overall status");
      expect(text).not.toContain("all checks");
      expect(text).not.toContain("compliance status");
    }
  });

  it("PDF text contains no roll-up badge/score/grade or forbidden-in-spirit roll-ups", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD, INCOMPLETE_PROVENANCE_PAYLOAD]) {
      const { doc } = generateProofPackPdf(p);
      const text = extractAllText(doc).toLowerCase();
      expect(text).not.toContain("score");
      expect(text).not.toContain("grade");
      expect(text).not.toContain("rating");
      expect(text).not.toMatch(/status:\s*✓/);
      expect(text).not.toContain("will succeed");
      expect(text).not.toContain("safe from enforcement");
      expect(text).not.toContain("all checks passed");
      expect(text).not.toMatch(/\boverall\b/);
      expect(text).not.toMatch(/\bready\b/);
      expect(text).not.toMatch(/\bclear\b/);
      expect(text).not.toMatch(/\bapproved\b/);
    }
  });

  it("top-line is 'Evidence state summary' — not a compliance headline", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const allText = extractAllText(doc);
    expect(allText).toContain("Evidence state summary");
  });
});

// ─── PDF artefact: anchors and wording ────────────────────────────────────

describe("Proof Pack VS-3 PDF — anchors present in artefact", () => {
  it("PDF contains input_snapshot_hash from the payload", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("abc123def456");
  });

  it("PDF contains evaluation_id from the payload", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("eval-1");
  });

  it("PDF contains obligation_instance_id from the payload", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("obl-1");
  });

  it("PDF contains exported_at timestamp", () => {
    const { doc, exportedAt } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain(exportedAt);
  });

  it("'Exported at' and 'Evaluated at' are distinctly labelled", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("Exported at");
    expect(text).toContain("Evaluated at");
  });

  it("contains the honest rendering note", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("rendering of recorded evidence state");
  });

  it("does NOT claim verification or legal proof", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc).toLowerCase();
    expect(text).not.toContain("verified legal proof");
    expect(text).not.toContain("legally verified");
    expect(text).not.toContain("certification");
  });
});

// ─── PDF artefact: basis-review wording ─────────────────────────────────────

describe("Proof Pack VS-3 PDF — basis-review in artefact", () => {
  it("basis-changed payload shows review-recommended wording in PDF", () => {
    const { doc } = generateProofPackPdf(BASIS_CHANGED_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("Review recommended");
    expect(text).toContain("Basis changed after discharge");
  });

  it("basis-changed payload shows both truths in PDF", () => {
    const { doc } = generateProofPackPdf(BASIS_CHANGED_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("discharged");
    expect(text).toContain("Basis changed");
  });

  it("basis-review uses no breach/exposure language in PDF", () => {
    const { doc } = generateProofPackPdf(BASIS_CHANGED_PAYLOAD);
    const text = extractAllText(doc).toLowerCase();
    expect(text).not.toContain("breach");
    expect(text).not.toContain("non-compliant");
    expect(text).not.toContain("at risk");
    expect(text).not.toContain("failed");
  });

  it("basis-review section is absent from PDF when review_required is false", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).not.toContain("Review recommended");
    expect(text).not.toContain("Basis changed after discharge");
  });
});

// ─── PDF artefact: provenance ──────────────────────────────────────────────

describe("Proof Pack VS-3 PDF — provenance in artefact", () => {
  it("renders trace status in PDF — complete vs incomplete", () => {
    const { doc: completeDoc } = generateProofPackPdf(OPEN_PAYLOAD);
    expect(extractAllText(completeDoc)).toContain("Provenance trail: complete");

    const { doc: incompleteDoc } = generateProofPackPdf(INCOMPLETE_PROVENANCE_PAYLOAD);
    expect(extractAllText(incompleteDoc)).toContain("Provenance trail: incomplete");
  });

  it("renders missing event types in PDF when provenance incomplete", () => {
    const { doc } = generateProofPackPdf(INCOMPLETE_PROVENANCE_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("Missing event types:");
    expect(text).toContain("rpe.obligation.created");
  });

  it("renders provenance events in payload order in PDF", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    const idx1 = text.indexOf("evaluation_run");
    const idx2 = text.indexOf("rpe.obligation.created");
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(-1);
    expect(idx1).toBeLessThan(idx2);
  });
});

// ─── PDF artefact: section completeness ───────────────────────────────────

describe("Proof Pack VS-3 PDF — section completeness", () => {
  it("discharged payload renders evidence identity in PDF", () => {
    const { doc } = generateProofPackPdf(DISCHARGED_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("RRA-IS-2026-001");
    expect(text).toContain("gov_uk_information_sheet");
  });

  it("open payload shows 'not recorded' for absent evidence in PDF", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("Discharge evidence: not recorded");
  });

  it("renders component states in PDF", () => {
    const { doc } = generateProofPackPdf(OPEN_PAYLOAD);
    const text = extractAllText(doc);
    expect(text).toContain("Evaluation recorded");
    expect(text).toContain("Obligation created");
  });

  it("null evaluation renders 'not recorded' in PDF", () => {
    const noEvalPayload = { ...OPEN_PAYLOAD, evaluation: null };
    const { doc } = generateProofPackPdf(noEvalPayload);
    const text = extractAllText(doc);
    expect(text).toContain("Evaluation: not recorded");
  });
});
