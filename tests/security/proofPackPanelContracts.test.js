import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const panelSrc = readFileSync(
  join(process.cwd(), "src/components/compliance/ObligationProofPackPanel.jsx"),
  "utf8",
);

const diagnosticPageSrc = readFileSync(
  join(process.cwd(), "src/pages/compliance/RpeDiagnosticPage.jsx"),
  "utf8",
);

// ─── VS-2 load-bearing boundary: payload-only ────────────────────────────────

describe("Proof Pack VS-2 panel — payload-only boundary (load-bearing)", () => {
  it("does NOT import supabase — the renderer has no direct data source", () => {
    expect(panelSrc).not.toMatch(/from\s+["'].*supabase/);
    expect(panelSrc).not.toContain("import { supabase");
    expect(panelSrc).not.toContain("supabase.rpc");
    expect(panelSrc).not.toContain("supabase.from");
  });

  it("does NOT import any RPE service functions", () => {
    expect(panelSrc).not.toMatch(/from\s+["'].*regulatoryProofEngineService/);
    expect(panelSrc).not.toMatch(/from\s+["'].*regulatoryProofEngine["']/);
  });

  it("takes payload as a prop — no internal data fetching", () => {
    expect(panelSrc).toMatch(/function\s+ObligationProofPackPanel\s*\(\s*\{\s*payload\s*\}/);
    expect(panelSrc).not.toContain("useEffect");
    expect(panelSrc).not.toContain("fetch(");
  });

  it("does NOT call any RPC — no .rpc( in the renderer", () => {
    expect(panelSrc).not.toContain(".rpc(");
    expect(panelSrc).not.toContain(".from(");
  });

  it("performs no writes or mutations", () => {
    expect(panelSrc).not.toContain("INSERT");
    expect(panelSrc).not.toContain("UPDATE");
    expect(panelSrc).not.toContain("DELETE");
    expect(panelSrc).not.toContain("mutation");
  });
});

// ─── VS-2 no aggregate verdict ───────────────────────────────────────────────

describe("Proof Pack VS-2 panel — no aggregate verdict (PO non-negotiable)", () => {
  it("does NOT produce forbidden verdict language", () => {
    const lower = panelSrc.toLowerCase();
    const forbidden = [
      "compliant",
      "court-ready",
      "court ready",
      "legal risk",
      "overall status",
      "overall: compliant",
      "safe",
      "passed",
    ];
    for (const word of forbidden) {
      expect(lower).not.toContain(word);
    }
  });

  it("does NOT contain any aggregate verdict badge or roll-up status element", () => {
    expect(panelSrc).not.toMatch(/compliance.?status/i);
    expect(panelSrc).not.toMatch(/overall.*compliant/i);
    expect(panelSrc).not.toMatch(/score/i);
    const verdictMatches = [...panelSrc.matchAll(/verdict/gi)];
    for (const m of verdictMatches) {
      const ctx = panelSrc.slice(Math.max(0, m.index - 30), m.index + 40);
      expect(ctx).toMatch(/not a legal verdict/i);
    }
  });

  it("uses 'Evidence state summary' as the top-line — not a compliance headline", () => {
    expect(panelSrc).toContain("Evidence state summary");
  });

  it("renders component states — evaluation recorded, obligation created, discharge evidence", () => {
    expect(panelSrc).toContain("Evaluation recorded");
    expect(panelSrc).toContain("Obligation created");
    expect(panelSrc).toContain("Discharge evidence recorded");
    expect(panelSrc).toContain("Discharge evidence: not recorded");
    expect(panelSrc).toContain("Provenance trail present");
  });
});

// ─── VS-2 demo/Gate-B watermark ──────────────────────────────────────────────

describe("Proof Pack VS-2 panel — demo/Gate-B watermark (PO persistent, non-dismissable)", () => {
  it("renders the watermark with the correct primary text", () => {
    expect(panelSrc).toContain("Demo proof pack — not legal sign-off");
  });

  it("renders the secondary disclaimer text", () => {
    expect(panelSrc).toContain(
      "This view shows recorded evidence state only. It is not a legal verdict.",
    );
  });

  it("reads watermark label from payload.status.pack_status_label", () => {
    expect(panelSrc).toContain("status?.pack_status_label");
  });

  it("watermark is NOT dismissable — no close/dismiss handler on the watermark element", () => {
    const watermarkSection = panelSrc.slice(
      panelSrc.indexOf("proof-pack-demo-watermark"),
      panelSrc.indexOf("proof-pack-headline"),
    );
    expect(watermarkSection).not.toContain("onClose");
    expect(watermarkSection).not.toContain("onDismiss");
    expect(watermarkSection).not.toContain("dismiss");
    expect(watermarkSection).not.toMatch(/onClick.*close/i);
    expect(watermarkSection).not.toMatch(/onClick.*dismiss/i);
  });

  it("watermark is at the top of the panel — before all other sections", () => {
    const watermarkIdx = panelSrc.indexOf("proof-pack-demo-watermark");
    const headlineIdx = panelSrc.indexOf("proof-pack-headline");
    const obligationIdx = panelSrc.indexOf(">Obligation<");
    const evaluationIdx = panelSrc.indexOf(">Evaluation<");
    expect(watermarkIdx).toBeLessThan(headlineIdx);
    expect(watermarkIdx).toBeLessThan(obligationIdx);
    expect(watermarkIdx).toBeLessThan(evaluationIdx);
  });

  it("has a data-testid for the watermark element", () => {
    expect(panelSrc).toContain('data-testid="proof-pack-demo-watermark"');
  });
});

// ─── VS-2 basis-review — review, not breach ─────────────────────────────────

describe("Proof Pack VS-2 panel — basis-review flag (PO review, not breach)", () => {
  it("renders review-recommended wording", () => {
    expect(panelSrc).toContain("Review recommended");
    expect(panelSrc).toContain("Basis changed after discharge — review recommended");
  });

  it("does NOT use breach, non-compliant, at risk, or failed language", () => {
    const lower = panelSrc.toLowerCase();
    expect(lower).not.toContain("breach");
    expect(lower).not.toContain("non-compliant");
    expect(lower).not.toContain("at risk");
    expect(lower).not.toContain("failed");
    const reviewSection = panelSrc.slice(
      panelSrc.indexOf("proof-pack-basis-review-flag"),
      panelSrc.indexOf("proof-pack-basis-review-flag") + 800,
    );
    expect(reviewSection.toLowerCase()).not.toContain("exposure");
  });

  it("uses informational styling — blue, not red/danger", () => {
    const reviewSection = panelSrc.slice(
      panelSrc.indexOf("proof-pack-basis-review-flag"),
      panelSrc.indexOf("proof-pack-basis-review-flag") + 600,
    );
    expect(reviewSection).toContain("blue-");
    expect(reviewSection).not.toContain("red-");
    expect(reviewSection).not.toContain("danger");
  });

  it("conditionally renders only when basis_review.review_required is truthy", () => {
    expect(panelSrc).toContain("basis_review?.review_required");
  });

  it("has a data-testid for the basis-review flag", () => {
    expect(panelSrc).toContain('data-testid="proof-pack-basis-review-flag"');
  });
});

// ─── VS-2 provenance: trace status prominent, trail expandable ───────────────

describe("Proof Pack VS-2 panel — provenance rendering (PO)", () => {
  it("renders trace status prominently with complete/incomplete labels", () => {
    expect(panelSrc).toContain("Provenance trail: complete");
    expect(panelSrc).toContain("Provenance trail: incomplete");
    expect(panelSrc).toContain("Expected events present:");
    expect(panelSrc).toContain("Missing event types:");
  });

  it("renders raw provenance trail as expandable — not always visible", () => {
    expect(panelSrc).toContain("provenanceExpanded");
    expect(panelSrc).toContain("aria-expanded");
    expect(panelSrc).toContain("proof-pack-provenance-toggle");
  });

  it("does NOT re-sort the provenance trail — renders in payload order", () => {
    expect(panelSrc).not.toContain(".sort(");
    expect(panelSrc).not.toContain(".toSorted(");
    expect(panelSrc).not.toContain("orderBy");
  });

  it("trace status is rendered before the expandable trail", () => {
    const traceStatusIdx = panelSrc.indexOf("proof-pack-trace-status");
    const trailIdx = panelSrc.indexOf("proof-pack-provenance-trail");
    expect(traceStatusIdx).toBeLessThan(trailIdx);
  });

  it("has data-testids for trace status and trail elements", () => {
    expect(panelSrc).toContain('data-testid="proof-pack-trace-status"');
    expect(panelSrc).toContain('data-testid="proof-pack-provenance-trail"');
  });
});

// ─── VS-2 section rendering — absent sections show 'not recorded' ────────────

describe("Proof Pack VS-2 panel — section completeness", () => {
  it("shows 'not recorded' when evidence is absent", () => {
    expect(panelSrc).toContain("Discharge evidence: not recorded");
  });

  it("shows 'not recorded' when evaluation is absent", () => {
    expect(panelSrc).toContain("Evaluation: not recorded");
  });

  it("renders all six sections in the prompt-specified narrative order", () => {
    const watermarkIdx = panelSrc.indexOf("proof-pack-demo-watermark");
    const headlineIdx = panelSrc.indexOf("Evidence state summary");
    const obligationIdx = panelSrc.indexOf(">Obligation<");
    const evaluationIdx = panelSrc.indexOf(">Evaluation<");
    const evidenceIdx = panelSrc.indexOf(">Evidence<");
    const currentStateIdx = panelSrc.indexOf(">Current state<");
    const provenanceIdx = panelSrc.indexOf(">Provenance<");

    expect(watermarkIdx).toBeLessThan(headlineIdx);
    expect(headlineIdx).toBeLessThan(obligationIdx);
    expect(obligationIdx).toBeLessThan(evaluationIdx);
    expect(evaluationIdx).toBeLessThan(evidenceIdx);
    expect(evidenceIdx).toBeLessThan(currentStateIdx);
    expect(currentStateIdx).toBeLessThan(provenanceIdx);
  });

  it("renders evaluation fields from the payload: result, confidence, input_snapshot_hash, evaluated_at", () => {
    expect(panelSrc).toContain("evaluation.result");
    expect(panelSrc).toContain("evaluation.confidence");
    expect(panelSrc).toContain("evaluation.input_snapshot_hash");
    expect(panelSrc).toContain("evaluation.evaluated_at");
  });

  it("renders obligation fields: obligation_kind, posture, exposure_gbp_ceiling", () => {
    expect(panelSrc).toContain("obligation?.obligation_kind");
    expect(panelSrc).toContain("obligation?.posture");
    expect(panelSrc).toContain("obligation?.exposure_gbp_ceiling");
  });

  it("renders evidence fields: official_info_sheet_identity, evidence_type, service_evidence_timestamp", () => {
    expect(panelSrc).toContain("official_info_sheet_identity");
    expect(panelSrc).toContain("evidence_type");
    expect(panelSrc).toContain("service_evidence_timestamp");
  });
});

// ─── VS-2 data loading — parent calls RPC, not the panel ────────────────────

describe("Proof Pack VS-2 — diagnostic page integration", () => {
  it("diagnostic page imports getObligationProofPack and passes payload to panel", () => {
    expect(diagnosticPageSrc).toContain("getObligationProofPack");
    expect(diagnosticPageSrc).toContain("ObligationProofPackPanel");
    expect(diagnosticPageSrc).toContain("payload={proofPackPayload}");
  });

  it("diagnostic page imports listRraObligationInstances for obligation selection", () => {
    expect(diagnosticPageSrc).toContain("listRraObligationInstances");
  });
});

// ─── VS-2 accessibility and quality floor ────────────────────────────────────

describe("Proof Pack VS-2 panel — quality floor", () => {
  it("uses semantic HTML — role, aria attributes on watermark", () => {
    expect(panelSrc).toContain('role="status"');
    expect(panelSrc).toContain("aria-live");
  });

  it("provenance toggle is keyboard-focusable (button element)", () => {
    const toggleIdx = panelSrc.indexOf("proof-pack-provenance-toggle");
    const toggleSection = panelSrc.slice(
      Math.max(0, toggleIdx - 500),
      toggleIdx + 50,
    );
    expect(toggleSection).toMatch(/<button\b/);
  });

  it("no inline styles — uses Tailwind classes throughout", () => {
    expect(panelSrc).not.toMatch(/style=\{/);
    expect(panelSrc).not.toMatch(/style="/);
  });
});

// ─── VS-2 out-of-scope absent ────────────────────────────────────────────────

describe("Proof Pack VS-2 panel — out-of-scope absent", () => {
  it("no PDF/export functionality", () => {
    const lower = panelSrc.toLowerCase();
    expect(lower).not.toContain("pdf");
    expect(lower).not.toContain("download");
    expect(lower).not.toContain("print");
    const exportMatches = [...lower.matchAll(/export/g)];
    for (const m of exportMatches) {
      const ctx = panelSrc.slice(Math.max(0, m.index - 5), m.index + 30);
      expect(ctx).toMatch(/export default/i);
    }
  });

  it("no scoring or rating system", () => {
    const lower = panelSrc.toLowerCase();
    expect(lower).not.toContain("score");
    expect(lower).not.toContain("rating");
    expect(lower).not.toContain("grade");
  });
});
