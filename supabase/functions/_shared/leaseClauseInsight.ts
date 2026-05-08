import { buildUntrustedJsonPrompt, redactForAiPrompt } from "./aiSafety.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeaseClauseInput = {
  accountId: string;
  leaseId: string;
  generatedAt?: string | null;
  extractedText: string;
  documentName?: string | null;
  characterCount?: number | null;
  lease?: {
    propertyLabel?: string | null;
    tenantLabel?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
};

export type LeaseClauseFinding = {
  clause_ref: string;
  clause_text: string;
  risk_level: "low" | "medium" | "high" | "critical";
  category: string;
  explanation: string;
};

export type LeaseClauseOutput = {
  findings: LeaseClauseFinding[];
  summary: string;
  overall_risk: "low" | "medium" | "high" | "critical";
  clause_count_reviewed: number;
  source: "openai" | "fallback";
  generated_at: string;
};

// ── Prompt ────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "break_clause", "rent_review", "repair_obligation", "deposit",
  "assignment", "subletting", "insurance", "service_charges",
  "alterations", "dispute_resolution", "other",
];

const MAX_TEXT_CHARS = 60_000;

export function buildLeaseClausePrompt(input: LeaseClauseInput): string {
  const text = String(input.extractedText || "").slice(0, MAX_TEXT_CHARS);
  const docName = redactForAiPrompt(input.documentName || "Lease document", 200);
  const propertyLabel = redactForAiPrompt(input.lease?.propertyLabel || "", 200);
  const tenantLabel = redactForAiPrompt(input.lease?.tenantLabel || "", 100);

  return buildUntrustedJsonPrompt({
    document_name: docName,
    property: propertyLabel || null,
    tenant_alias: tenantLabel ? `tenant:${tenantLabel.slice(0, 8)}` : null,
    lease_start: input.lease?.startDate || null,
    lease_end: input.lease?.endDate || null,
    extracted_text: text,
  });
}

// ── Fallback ──────────────────────────────────────────────────────────────────

export function buildFallbackLeaseClauseOutput(input: LeaseClauseInput): LeaseClauseOutput {
  return {
    findings: [],
    summary: "AI clause analysis is temporarily unavailable. Add findings manually using the form below.",
    overall_risk: "low",
    clause_count_reviewed: 0,
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

// ── Parser ────────────────────────────────────────────────────────────────────

function normaliseRisk(value: unknown): "low" | "medium" | "high" | "critical" {
  const v = String(value || "").trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high" || v === "critical") return v;
  return "medium";
}

function normaliseCategory(value: unknown): string {
  const v = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return VALID_CATEGORIES.includes(v) ? v : "other";
}

export function parseLeaseClauseOutput(payload: unknown, input: LeaseClauseInput): LeaseClauseOutput {
  const p = payload as Record<string, unknown>;
  const rawFindings = Array.isArray(p?.findings) ? p.findings : [];

  const findings: LeaseClauseFinding[] = rawFindings.slice(0, 30).map((f) => {
    const row = f as Record<string, unknown>;
    return {
      clause_ref:  String(row?.clause_ref  || "").trim().slice(0, 200),
      clause_text: String(row?.clause_text || "").trim().slice(0, 2000),
      risk_level:  normaliseRisk(row?.risk_level),
      category:    normaliseCategory(row?.category),
      explanation: String(row?.explanation || "").trim().slice(0, 1000),
    };
  });

  return {
    findings,
    summary:              String(p?.summary || "").trim().slice(0, 1000),
    overall_risk:         normaliseRisk(p?.overall_risk),
    clause_count_reviewed: Number(p?.clause_count_reviewed || findings.length),
    source:               "openai",
    generated_at:         input.generatedAt || new Date().toISOString(),
  };
}
