import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../");

function readFn(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const triageSource = readFn("supabase/functions/generate-maintenance-triage/index.ts");
const contractorSource = readFn("supabase/functions/generate-contractor-recommendation/index.ts");
const aiSafetySource = readFn("supabase/functions/_shared/aiSafety.ts");
const triageInsightSource = readFn("supabase/functions/_shared/maintenanceTriageInsight.ts");
const contractorInsightSource = readFn("supabase/functions/_shared/contractorRecommendationInsight.ts");

describe("generate-maintenance-triage PII minimisation", () => {
  it("does not select tenant email from the database", () => {
    expect(triageSource).not.toMatch(/select\("name, email"\)/);
    expect(triageSource).not.toMatch(/\.select\(["'`].*email.*["'`]\)/);
  });

  it("sets reporterEmail to null explicitly", () => {
    expect(triageSource).toContain("reporterEmail: null");
  });

  it("only selects tenant name (not email)", () => {
    expect(triageSource).toContain('.select("name")');
  });

  it("has max_output_tokens cap on OpenAI request", () => {
    expect(triageSource).toContain("max_output_tokens");
  });

  it("system prompt contains explicit prompt injection resistance", () => {
    const systemPromptBlock = triageSource.slice(
      triageSource.indexOf("You generate maintenance triage"),
      triageSource.indexOf("You generate maintenance triage") + 600,
    );
    expect(systemPromptBlock).toMatch(/untrusted_operational_data|untrusted user input/i);
    expect(systemPromptBlock).toMatch(/do not follow/i);
  });
});

describe("generate-contractor-recommendation PII minimisation", () => {
  it("does not select contractor email or phone from the database", () => {
    const selectLine = contractorSource.match(/\.from\("contractors"\)\s*\n?\s*\.select\([^)]+\)/)?.[0] || "";
    expect(selectLine).not.toContain("email");
    expect(selectLine).not.toContain("phone");
  });

  it("contractor objects set email and phone to null", () => {
    expect(contractorSource).toContain("email: null");
    expect(contractorSource).toContain("phone: null");
  });

  it("has max_output_tokens cap on OpenAI request", () => {
    expect(contractorSource).toContain("max_output_tokens");
  });

  it("system prompt contains explicit prompt injection resistance", () => {
    const systemPromptBlock = contractorSource.slice(
      contractorSource.indexOf("You generate read-only contractor"),
      contractorSource.indexOf("You generate read-only contractor") + 600,
    );
    expect(systemPromptBlock).toMatch(/untrusted_operational_data|untrusted user input/i);
    expect(systemPromptBlock).toMatch(/do not follow/i);
  });
});

describe("aiSafety.ts shared utilities", () => {
  it("redactForAiPrompt masks email addresses", () => {
    expect(aiSafetySource).toContain("[redacted-email]");
    expect(aiSafetySource).toContain("@");
  });

  it("redactForAiPrompt masks phone numbers", () => {
    expect(aiSafetySource).toContain("[redacted-phone]");
  });

  it("redactForAiPrompt masks URLs", () => {
    expect(aiSafetySource).toContain("[redacted-url]");
  });

  it("aliasForId creates a prefixed alias from an id", () => {
    expect(aiSafetySource).toContain("aliasForId");
    expect(aiSafetySource).toMatch(/\$\{prefix\}:\$\{/);
  });

  it("clampAiInsightPayload enforces MAX_AI_PAYLOAD_BYTES", () => {
    expect(aiSafetySource).toContain("MAX_AI_PAYLOAD_BYTES");
    expect(aiSafetySource).toContain("ai_payload_too_large");
  });

  it("assertAiDailyLimit enforces per-account per-feature limit", () => {
    expect(aiSafetySource).toContain("ai_usage_meter");
    expect(aiSafetySource).toContain("Daily AI generation limit reached");
    expect(aiSafetySource).toContain("429");
  });
});

describe("maintenance triage prompt builder PII guards", () => {
  it("uses reporterAlias not reporterName in AI prompt", () => {
    const promptFn = triageInsightSource.slice(
      triageInsightSource.indexOf("export function buildMaintenanceTriagePrompt"),
      triageInsightSource.indexOf("export function parseMaintenanceTriageInsightPayload"),
    );
    expect(promptFn).toContain("reporterAlias");
    expect(promptFn).not.toContain("reporterName:");
    expect(promptFn).not.toContain("reporterEmail:");
  });

  it("uses contractorAlias not contractorName in AI prompt", () => {
    const promptFn = triageInsightSource.slice(
      triageInsightSource.indexOf("export function buildMaintenanceTriagePrompt"),
      triageInsightSource.indexOf("export function parseMaintenanceTriageInsightPayload"),
    );
    expect(promptFn).toContain("contractorAlias");
    expect(promptFn).not.toContain('"contractorName"');
  });

  it("filters out Reported-by facts from the AI prompt", () => {
    expect(triageInsightSource).toMatch(/filter.*Reported by/i);
  });
});

describe("contractor recommendation prompt builder PII guards", () => {
  it("sends only contractor id and alias to the AI, not name or email", () => {
    const promptFn = contractorInsightSource.slice(
      contractorInsightSource.indexOf("export function buildContractorRecommendationPrompt"),
      contractorInsightSource.indexOf("export function parseContractorRecommendationPayload"),
    );
    expect(promptFn).toContain("alias:");
    expect(promptFn).not.toContain("name:");
    expect(promptFn).not.toContain("email:");
    expect(promptFn).not.toContain("phone:");
  });

  it("uses contractorAlias in work order history, not contractorName", () => {
    const promptFn = contractorInsightSource.slice(
      contractorInsightSource.indexOf("export function buildContractorRecommendationPrompt"),
      contractorInsightSource.indexOf("export function parseContractorRecommendationPayload"),
    );
    expect(promptFn).toContain("contractorAlias:");
    expect(promptFn).not.toContain("contractorName:");
  });
});
