import { describe, expect, it } from "vitest";
import { scanText } from "../../scripts/checkSecrets.mjs";

describe("tracked-file secret scanner contracts", () => {
  it("does not flag placeholders in env examples or docs", () => {
    const text = [
      "VITE_SUPABASE_ANON_KEY=your_local_supabase_anon_key",
      "STAGING_SUPABASE_SERVICE_ROLE_KEY=your_staging_service_role_key",
      "OPENAI_API_KEY=REDACTED",
      "STRIPE_SECRET_KEY=placeholder",
    ].join("\n");

    expect(scanText(".env.example", text)).toEqual([]);
  });

  it("flags obvious real-looking secrets without exposing values", () => {
    const jwt = ["eyJ" + "a".repeat(30), "b".repeat(30), "c".repeat(30)].join(".");
    const text = [
      `VITE_SUPABASE_ANON_KEY=${jwt}`,
      `TEST_SUPABASE_SERVICE_ROLE_KEY=${"sb_secret_" + "A".repeat(24)}`,
      `OPENAI_API_KEY=${"sk-proj-" + "B".repeat(32)}`,
    ].join("\n");

    const findings = scanText("example.js", text);

    expect(findings).toEqual([
      { file: "example.js", line: 1, type: "Supabase JWT-like key" },
      { file: "example.js", line: 2, type: "Supabase sb_secret" },
      { file: "example.js", line: 3, type: "OpenAI API key" },
    ]);
  });
});
