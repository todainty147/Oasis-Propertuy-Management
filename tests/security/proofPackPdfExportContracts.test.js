import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const exportSrc = readFileSync(
  join(process.cwd(), "src/utils/proofPackPdfExport.js"),
  "utf8",
);

const diagnosticPageSrc = readFileSync(
  join(process.cwd(), "src/pages/compliance/RpeDiagnosticPage.jsx"),
  "utf8",
);

// ─── VS-3 payload-only boundary ─────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — payload-only boundary (load-bearing)", () => {
  it("does NOT import supabase — the export module has no direct data source", () => {
    expect(exportSrc).not.toMatch(/from\s+["'].*supabase/);
    expect(exportSrc).not.toContain("import { supabase");
    expect(exportSrc).not.toContain("supabase.rpc");
    expect(exportSrc).not.toContain("supabase.from");
  });

  it("does NOT import any RPE service functions", () => {
    expect(exportSrc).not.toMatch(/from\s+["'].*regulatoryProofEngineService/);
    expect(exportSrc).not.toMatch(/from\s+["'].*regulatoryProofEngine["']/);
  });

  it("takes payload as a function argument — no internal data fetching", () => {
    expect(exportSrc).toMatch(/function\s+generateProofPackPdf\s*\(\s*payload\s*\)/);
    expect(exportSrc).not.toContain("useEffect");
    expect(exportSrc).not.toContain("fetch(");
  });

  it("does NOT call any RPC — no .rpc( in the export module", () => {
    expect(exportSrc).not.toContain(".rpc(");
    expect(exportSrc).not.toContain(".from(");
  });
});

// ─── VS-3 zero writes ──────────────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — zero writes (PO non-negotiable)", () => {
  it("performs no database writes or mutations", () => {
    expect(exportSrc).not.toContain("INSERT");
    expect(exportSrc).not.toContain("UPDATE");
    expect(exportSrc).not.toContain("DELETE");
    expect(exportSrc).not.toContain("mutation");
  });

  it("emits no events or provenance side-effects", () => {
    expect(exportSrc).not.toContain("emit(");
    expect(exportSrc).not.toContain("dispatch(");
    expect(exportSrc).not.toContain("recordEvent");
    expect(exportSrc).not.toContain("insertEvent");
  });

  it("has no audit-log recording (deferred to separate increment)", () => {
    expect(exportSrc).not.toContain("audit");
    expect(exportSrc).not.toContain("log_export");
    expect(exportSrc).not.toContain("recordExport");
  });
});

// ─── VS-3 no aggregate verdict ──────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — no aggregate verdict (PO non-negotiable)", () => {
  it("does NOT produce forbidden verdict language", () => {
    const lower = exportSrc.toLowerCase();
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

  it("does NOT contain any aggregate verdict badge or roll-up element", () => {
    expect(exportSrc).not.toMatch(/compliance.?status/i);
    expect(exportSrc).not.toMatch(/overall.*compliant/i);
    expect(exportSrc).not.toMatch(/score/i);
  });

  it("uses 'Evidence state summary' as the top-line — not a compliance headline", () => {
    expect(exportSrc).toContain("Evidence state summary");
  });
});

// ─── VS-3 per-page demo watermark ──────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — per-page demo watermark (PO non-negotiable)", () => {
  it("has a watermark function that runs on every page", () => {
    expect(exportSrc).toContain("addPageWatermark");
  });

  it("calls watermark on the first page", () => {
    const firstWatermarkIdx = exportSrc.indexOf("addPageWatermark(doc, statusLabel)");
    const addPageIdx = exportSrc.indexOf("doc.addPage()");
    expect(firstWatermarkIdx).toBeLessThan(addPageIdx);
  });

  it("calls watermark after every addPage", () => {
    const addPageMatches = [...exportSrc.matchAll(/doc\.addPage\(\)/g)];
    for (const m of addPageMatches) {
      const after = exportSrc.slice(m.index, m.index + 200);
      expect(after).toContain("addPageWatermark");
    }
  });

  it("watermark includes header/footer and background text", () => {
    expect(exportSrc).toContain("DEMO — NOT LEGAL SIGN-OFF");
    expect(exportSrc).toContain("Demo proof pack — not legal sign-off");
  });

  it("reads watermark label from payload.status — not hardcoded only", () => {
    expect(exportSrc).toContain("status?.pack_status_label");
  });
});

// ─── VS-3 anchors and wording ───────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — anchors and wording", () => {
  it("renders the four required anchors", () => {
    expect(exportSrc).toContain("input_snapshot_hash");
    expect(exportSrc).toContain("evaluation_id");
    expect(exportSrc).toContain("obligation_instance_id");
    expect(exportSrc).toContain("exportedAt");
  });

  it("labels 'Exported at' and 'Evaluated at' distinctly", () => {
    expect(exportSrc).toContain('"Exported at"');
    expect(exportSrc).toContain('"Evaluated at"');
  });

  it("includes the honest rendering note — not a verification claim", () => {
    expect(exportSrc).toContain(
      "This export is a rendering of recorded evidence state at the time of export.",
    );
  });

  it("does NOT claim verification or legal proof", () => {
    const lower = exportSrc.toLowerCase();
    expect(lower).not.toContain("verified legal proof");
    expect(lower).not.toContain("legally verified");
    expect(lower).not.toContain("certification");
  });
});

// ─── VS-3 basis-review wording ──────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — basis-review flag (review, not breach)", () => {
  it("renders review-recommended wording", () => {
    expect(exportSrc).toContain("Review recommended");
    expect(exportSrc).toContain("Basis changed after discharge — review recommended");
  });

  it("does NOT use breach, non-compliant, at risk, or failed language", () => {
    const lower = exportSrc.toLowerCase();
    expect(lower).not.toContain("breach");
    expect(lower).not.toContain("non-compliant");
    expect(lower).not.toContain("at risk");
    expect(lower).not.toContain("failed");
  });
});

// ─── VS-3 provenance rendering ─────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — provenance rendering", () => {
  it("renders trace status labels: complete vs incomplete", () => {
    expect(exportSrc).toContain("Provenance trail: complete");
    expect(exportSrc).toContain("Provenance trail: incomplete");
  });

  it("renders expected events present and missing event types", () => {
    expect(exportSrc).toContain("Expected events present:");
    expect(exportSrc).toContain("Missing event types:");
  });

  it("does NOT re-sort the provenance trail — renders in payload order", () => {
    expect(exportSrc).not.toContain(".sort(");
    expect(exportSrc).not.toContain(".toSorted(");
    expect(exportSrc).not.toContain("orderBy");
  });
});

// ─── VS-3 diagnostic page integration ──────────────────────────────────────

describe("Proof Pack VS-3 — diagnostic page integration", () => {
  it("diagnostic page imports downloadProofPackPdf", () => {
    expect(diagnosticPageSrc).toContain("downloadProofPackPdf");
  });

  it("diagnostic page has an export PDF button", () => {
    expect(diagnosticPageSrc).toContain("Export PDF");
    expect(diagnosticPageSrc).toContain("proof-pack-export-pdf");
  });

  it("export button calls downloadProofPackPdf with the loaded payload", () => {
    expect(diagnosticPageSrc).toContain("downloadProofPackPdf(proofPackPayload)");
  });
});

// ─── VS-3 out-of-scope absent ───────────────────────────────────────────────

describe("Proof Pack VS-3 PDF export — out-of-scope absent", () => {
  it("no scoring or rating system", () => {
    const lower = exportSrc.toLowerCase();
    expect(lower).not.toContain("score");
    expect(lower).not.toContain("rating");
    expect(lower).not.toContain("grade");
  });

  it("no JSON export / machine-readable export in the PDF module", () => {
    expect(exportSrc).not.toContain("application/json");
    expect(exportSrc).not.toContain("JSON.stringify");
  });

  it("no QR code or verification URL", () => {
    const lower = exportSrc.toLowerCase();
    expect(lower).not.toContain("qr");
    expect(lower).not.toContain("verify-url");
    expect(lower).not.toContain("verification mechanism");
  });
});
