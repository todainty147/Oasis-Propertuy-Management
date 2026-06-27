import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

const panelSrc = readFileSync(
  join(process.cwd(), "src/components/compliance/ObligationProofPackPanel.jsx"),
  "utf8",
);

const { default: ObligationProofPackPanel } = await import(
  "../../src/components/compliance/ObligationProofPackPanel.jsx"
);

// ─── Mock payloads representing distinct obligation shapes ───────────────────

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

// ─── Shape correctness — each payload variant renders the right sections ─────

describe("Proof Pack VS-2 panel — open obligation shape", () => {
  it("source handles the open posture — shows 'not recorded' for absent evidence", () => {
    expect(panelSrc).toContain("Discharge evidence: not recorded");
  });

  it("source does not fabricate evidence when evidence array is empty", () => {
    expect(panelSrc).toContain("evidenceItems.length > 0");
  });
});

describe("Proof Pack VS-2 panel — discharged obligation shape", () => {
  it("source renders evidence fields when present", () => {
    expect(panelSrc).toContain("official_info_sheet_identity");
    expect(panelSrc).toContain("service_evidence_timestamp");
    expect(panelSrc).toContain("evidence_type");
    expect(panelSrc).toContain("captured_at");
  });
});

describe("Proof Pack VS-2 panel — basis-changed obligation shape", () => {
  it("source conditionally renders basis-review section only when review_required", () => {
    expect(panelSrc).toContain("basis_review?.review_required");
  });

  it("renders basis_change_kind and review_flagged_at in the review section", () => {
    expect(panelSrc).toContain("basis_review.basis_change_kind");
    expect(panelSrc).toContain("basis_review.review_flagged_at");
  });

  it("uses 'Discharged. Basis changed after discharge — review recommended.' wording", () => {
    expect(panelSrc).toContain(
      "Discharged. Basis changed after discharge — review recommended.",
    );
  });
});

describe("Proof Pack VS-2 panel — incomplete provenance shape", () => {
  it("source displays missing event types from the trace status", () => {
    expect(panelSrc).toContain("missingEvents.join");
    expect(panelSrc).toContain("Missing event types:");
  });

  it("source distinguishes complete vs incomplete provenance trail", () => {
    expect(panelSrc).toContain("traceStatus?.expected_events_present");
    expect(panelSrc).toContain("Provenance trail: complete");
    expect(panelSrc).toContain("Provenance trail: incomplete");
  });
});

// ─── Provenance ordering — rendered in payload order, no re-sort ─────────────

describe("Proof Pack VS-2 panel — provenance ordering invariant", () => {
  it("iterates provenanceItems with .map() — no sorting operation", () => {
    expect(panelSrc).toContain("provenanceItems.map(");
    expect(panelSrc).not.toContain("provenanceItems.sort(");
    expect(panelSrc).not.toContain("provenanceItems.toSorted(");
    expect(panelSrc).not.toContain("[...provenanceItems]");
  });

  it("reads provenance array directly from payload — no transformation", () => {
    expect(panelSrc).toMatch(
      /const\s+provenanceItems\s*=\s*Array\.isArray\(provenance\)\s*\?\s*provenance\s*:/,
    );
  });
});

// ─── Null/absent payload handling ────────────────────────────────────────────

describe("Proof Pack VS-2 panel — null payload handling", () => {
  it("renders a placeholder when payload is null/undefined", () => {
    expect(panelSrc).toContain("No proof pack loaded");
    expect(panelSrc).toMatch(/if\s*\(!payload\)/);
  });

  it("uses nullish coalescing for optional fields — never throws on absent data", () => {
    expect(panelSrc).toContain('?? "Not recorded"');
  });
});

// ─── Mock payload shape validation ──────────────────────────────────────────

describe("Mock payload shapes match the VS-1 RPC return structure", () => {
  it("open payload has all top-level keys", () => {
    const keys = Object.keys(OPEN_PAYLOAD);
    expect(keys).toContain("evaluation");
    expect(keys).toContain("obligation");
    expect(keys).toContain("evidence");
    expect(keys).toContain("basis_review");
    expect(keys).toContain("provenance");
    expect(keys).toContain("status");
  });

  it("open payload has status.provenance_trace_status", () => {
    expect(OPEN_PAYLOAD.status.provenance_trace_status).toBeDefined();
    expect(OPEN_PAYLOAD.status.provenance_trace_status.expected_events_present).toBe(true);
  });

  it("discharged payload has non-empty evidence array", () => {
    expect(DISCHARGED_PAYLOAD.evidence.length).toBeGreaterThan(0);
    expect(DISCHARGED_PAYLOAD.evidence[0]).toHaveProperty("official_info_sheet_identity");
  });

  it("basis-changed payload has basis_review with review_required: true", () => {
    expect(BASIS_CHANGED_PAYLOAD.basis_review).not.toBeNull();
    expect(BASIS_CHANGED_PAYLOAD.basis_review.review_required).toBe(true);
    expect(BASIS_CHANGED_PAYLOAD.basis_review.latest_evaluation_id).toBeDefined();
  });

  it("incomplete provenance payload has missing event types", () => {
    const ts = INCOMPLETE_PROVENANCE_PAYLOAD.status.provenance_trace_status;
    expect(ts.expected_events_present).toBe(false);
    expect(ts.missing_event_types.length).toBeGreaterThan(0);
  });

  it("all payloads carry demo_mode: true and gate_b_signed_off: false", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD, INCOMPLETE_PROVENANCE_PAYLOAD]) {
      expect(p.status.demo_mode).toBe(true);
      expect(p.status.gate_b_signed_off).toBe(false);
      expect(p.status.customer_facing_allowed).toBe(false);
    }
  });

  it("provenance events are already in sequence_number order", () => {
    const seqs = OPEN_PAYLOAD.provenance.map((e) => e.sequence_number);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });
});

// ─── ★ BEHAVIORAL: renders from mock payload alone, zero data-layer calls ───

function renderPanel(payload) {
  return renderToString(createElement(ObligationProofPackPanel, { payload }));
}

describe("★ Proof Pack VS-2 — BEHAVIORAL payload-only render (closure verdict 1)", () => {
  it("renders an open obligation from mock payload alone — no data layer needed", () => {
    const html = renderPanel(OPEN_PAYLOAD);
    expect(html).toContain("Evidence state summary");
    expect(html).toContain("Demo proof pack");
    expect(html).toContain("rra_information_sheet");
    expect(html).toContain("open");
    expect(html).toContain("affected");
    expect(html).toContain("abc123def456");
  });

  it("renders a discharged obligation from mock payload alone", () => {
    const html = renderPanel(DISCHARGED_PAYLOAD);
    expect(html).toContain("discharged");
    expect(html).toContain("RRA-IS-2026-001");
    expect(html).toContain("gov_uk_information_sheet");
  });

  it("renders a basis-changed obligation from mock payload alone", () => {
    const html = renderPanel(BASIS_CHANGED_PAYLOAD);
    expect(html).toContain("Review recommended");
    expect(html).toContain("Basis changed after discharge");
    expect(html).toContain("evaluation_result_changed");
  });

  it("renders an incomplete-provenance obligation from mock payload alone", () => {
    const html = renderPanel(INCOMPLETE_PROVENANCE_PAYLOAD);
    expect(html).toContain("Provenance trail: incomplete");
    expect(html).toContain("rpe.obligation.created");
  });

  it("renders null payload as empty state — no crash, no data fetch", () => {
    const html = renderPanel(null);
    expect(html).toContain("No proof pack loaded");
    expect(html).not.toContain("Evidence state summary");
  });

  it("triggers zero supabase/RPC/fetch calls — pure function of the payload prop", () => {
    expect(panelSrc).not.toContain("supabase");
    expect(panelSrc).not.toContain("useEffect");
    expect(panelSrc).not.toContain("fetch(");
    expect(panelSrc).not.toContain(".rpc(");
    expect(panelSrc).not.toContain(".from(");

    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD]) {
      const html = renderPanel(p);
      expect(html.length).toBeGreaterThan(100);
    }
  });
});

// ─── ★ BEHAVIORAL: no aggregate verdict / roll-up element (closure verdict 2) ─

describe("★ Proof Pack VS-2 — BEHAVIORAL no aggregate verdict (closure verdict 2)", () => {
  it("open payload renders individual component states — no single roll-up element", () => {
    const html = renderPanel(OPEN_PAYLOAD);
    expect(html).toContain("Evaluation recorded");
    expect(html).toContain("Obligation created");
    expect(html).toContain("Discharge evidence: not recorded");
    expect(html).toContain("Provenance trail present");

    const lower = html.toLowerCase();
    expect(lower).not.toContain("compliant");
    expect(lower).not.toContain("court-ready");
    expect(lower).not.toContain("court ready");
    expect(lower).not.toMatch(/\bsafe\b/);
    expect(lower).not.toContain("passed");
    expect(lower).not.toContain("overall status");
    expect(lower).not.toContain("all checks");
    expect(lower).not.toContain("compliance status");
  });

  it("discharged payload has no aggregate conclusion badge", () => {
    const html = renderPanel(DISCHARGED_PAYLOAD);
    const lower = html.toLowerCase();
    expect(lower).not.toContain("compliant");
    expect(lower).not.toContain("court-ready");
    expect(lower).not.toMatch(/\bsafe\b/);
    expect(lower).not.toContain("passed");
    expect(lower).not.toContain("overall");
    expect(lower).not.toContain("all checks");
  });

  it("basis-changed payload has no aggregate conclusion badge", () => {
    const html = renderPanel(BASIS_CHANGED_PAYLOAD);
    const lower = html.toLowerCase();
    expect(lower).not.toContain("compliant");
    expect(lower).not.toContain("court-ready");
    expect(lower).not.toMatch(/\bsafe\b/);
    expect(lower).not.toContain("passed");
    expect(lower).not.toContain("overall");
    expect(lower).not.toContain("all checks");
  });

  it("top-line heading is 'Evidence state summary' — not a compliance headline", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD]) {
      const html = renderPanel(p);
      expect(html).toContain("Evidence state summary");
      expect(html.toLowerCase()).not.toContain("compliance status");
      expect(html.toLowerCase()).not.toContain("overall: compliant");
      expect(html.toLowerCase()).not.toMatch(/legal risk/);
    }
  });

  it("no roll-up badge/score/grade element exists across all shapes", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD, INCOMPLETE_PROVENANCE_PAYLOAD]) {
      const html = renderPanel(p);
      const lower = html.toLowerCase();
      expect(lower).not.toContain("score");
      expect(lower).not.toContain("grade");
      expect(lower).not.toContain("rating");
      expect(lower).not.toMatch(/status:\s*✓/);
      expect(lower).not.toMatch(/status:\s*pass/);
      expect(lower).not.toMatch(/will succeed/);
      expect(lower).not.toContain("safe from enforcement");
    }
  });
});

// ─── BEHAVIORAL: watermark renders FROM payload.status, every shape ──────────

describe("Proof Pack VS-2 — BEHAVIORAL watermark rendering", () => {
  it("watermark text comes from payload.status.pack_status_label", () => {
    const custom = {
      ...OPEN_PAYLOAD,
      status: { ...OPEN_PAYLOAD.status, pack_status_label: "Custom demo label for test" },
    };
    const html = renderPanel(custom);
    expect(html).toContain("Custom demo label for test");
  });

  it("watermark renders on every obligation shape", () => {
    for (const p of [OPEN_PAYLOAD, DISCHARGED_PAYLOAD, BASIS_CHANGED_PAYLOAD, INCOMPLETE_PROVENANCE_PAYLOAD]) {
      const html = renderPanel(p);
      expect(html).toContain("Demo proof pack");
      expect(html).toContain("not legal sign-off");
      expect(html).toContain("recorded evidence state only");
    }
  });

  it("watermark appears before all section content in the rendered HTML", () => {
    const html = renderPanel(OPEN_PAYLOAD);
    const watermarkIdx = html.indexOf("Demo proof pack");
    const headlineIdx = html.indexOf("Evidence state summary");
    const obligationIdx = html.indexOf("Obligation");
    expect(watermarkIdx).toBeLessThan(headlineIdx);
    expect(watermarkIdx).toBeLessThan(obligationIdx);
  });
});

// ─── BEHAVIORAL: basis-review renders both truths, review-not-breach ─────────

describe("Proof Pack VS-2 — BEHAVIORAL basis-review rendering", () => {
  it("basis-changed payload shows both truths: discharged AND basis changed", () => {
    const html = renderPanel(BASIS_CHANGED_PAYLOAD);
    expect(html).toContain("discharged");
    expect(html).toContain("Basis changed after discharge");
    expect(html).toContain("review recommended");
  });

  it("basis-review section uses no breach/exposure language in rendered output", () => {
    const html = renderPanel(BASIS_CHANGED_PAYLOAD);
    const lower = html.toLowerCase();
    expect(lower).not.toContain("breach");
    expect(lower).not.toContain("non-compliant");
    expect(lower).not.toContain("at risk");
    expect(lower).not.toContain("failed");
  });

  it("basis-review section is absent when review_required is false", () => {
    const html = renderPanel(OPEN_PAYLOAD);
    expect(html).not.toContain("Review recommended");
    expect(html).not.toContain("Basis changed after discharge");
  });
});

// ─── BEHAVIORAL: provenance trail rendered in payload order ──────────────────

describe("Proof Pack VS-2 — BEHAVIORAL provenance rendering", () => {
  it("trace status renders prominently — complete vs incomplete", () => {
    const completeHtml = renderPanel(OPEN_PAYLOAD);
    expect(completeHtml).toContain("Provenance trail: complete");
    const cleanComplete = completeHtml.replace(/<!--.*?-->/g, "");
    expect(cleanComplete).toContain("Expected events present: yes");

    const incompleteHtml = renderPanel(INCOMPLETE_PROVENANCE_PAYLOAD);
    expect(incompleteHtml).toContain("Provenance trail: incomplete");
    const cleanIncomplete = incompleteHtml.replace(/<!--.*?-->/g, "");
    expect(cleanIncomplete).toContain("Expected events present: no");
  });

  it("missing event types render when provenance is incomplete", () => {
    const html = renderPanel(INCOMPLETE_PROVENANCE_PAYLOAD);
    expect(html).toContain("Missing event types:");
    expect(html).toContain("rpe.obligation.created");
  });
});
