import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildCorsHeaders,
  buildJsonHeaders,
  normalizeTrustedOrigin,
  parseAllowedOrigins,
  resolveTrustedAppOrigin,
} from "../../supabase/functions/_shared/trustedOrigin.ts";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("trusted Edge Function origin contracts", () => {
  it("normalizes only explicit http/https trusted origins", () => {
    expect(normalizeTrustedOrigin("https://app.oasis.example/settings")).toBe("https://app.oasis.example");
    expect(normalizeTrustedOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
    expect(normalizeTrustedOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeTrustedOrigin("app.oasis.example")).toBeNull();
    expect(normalizeTrustedOrigin("")).toBeNull();
  });

  it("supports explicitly configured staging and preview origins", () => {
    expect(parseAllowedOrigins("https://staging.oasis.example, https://preview.oasis.example/path")).toEqual([
      "https://staging.oasis.example",
      "https://preview.oasis.example",
    ]);
  });

  it("fails closed when no trusted app origin is configured", () => {
    expect(resolveTrustedAppOrigin({ appUrl: "", allowedOrigins: "" })).toEqual({
      origin: null,
      error: "trusted_app_origin_not_configured",
      trustedOrigins: [],
    });
  });

  it("preserves APP_URL as the primary trusted redirect origin", () => {
    expect(resolveTrustedAppOrigin({
      appUrl: "https://app.oasis.example",
      allowedOrigins: "https://staging.oasis.example",
    })).toEqual({
      origin: "https://app.oasis.example",
      error: null,
      trustedOrigins: [
        "https://app.oasis.example",
        "https://staging.oasis.example",
      ],
    });
  });

  it("uses allowed origins only when they are explicitly configured", () => {
    expect(resolveTrustedAppOrigin({
      appUrl: "",
      allowedOrigins: "https://preview.oasis.example",
    })).toEqual({
      origin: "https://preview.oasis.example",
      error: null,
      trustedOrigins: ["https://preview.oasis.example"],
    });
  });

  it("reflects CORS only for explicitly allowed request origins", () => {
    const allowedReq = new Request("https://edge.example.test", {
      headers: { Origin: "https://app.oasis.example" },
    });
    const disallowedReq = new Request("https://edge.example.test", {
      headers: { Origin: "https://evil.example" },
    });

    expect(buildCorsHeaders(allowedReq, "https://app.oasis.example")).toMatchObject({
      "Access-Control-Allow-Origin": "https://app.oasis.example",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    });
    expect(buildCorsHeaders(disallowedReq, "https://app.oasis.example")).not.toHaveProperty(
      "Access-Control-Allow-Origin",
    );
  });

  it("keeps OPTIONS-compatible headers without trusting disallowed origins", () => {
    const req = new Request("https://edge.example.test", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });

    expect(buildCorsHeaders(req, "https://app.oasis.example")).toEqual({
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    });
  });

  it("adds JSON content type while preserving allowlisted CORS behavior", () => {
    const req = new Request("https://edge.example.test", {
      headers: { Origin: "https://app.oasis.example" },
    });

    expect(buildJsonHeaders(req, "https://app.oasis.example")).toMatchObject({
      "Access-Control-Allow-Origin": "https://app.oasis.example",
      "Content-Type": "application/json",
    });
  });

  it("removes request Origin fallback from sensitive link and session functions", () => {
    const sources = [
      readSource("supabase/functions/create-checkout-session/index.ts"),
      readSource("supabase/functions/create-customer-portal-session/index.ts"),
      readSource("supabase/functions/invite-user/index.ts"),
      readSource("supabase/functions/send-password-reset-email/index.ts"),
    ];

    for (const source of sources) {
      expect(source).toContain("resolveTrustedAppOrigin");
      expect(source).toContain("ALLOWED_APP_ORIGINS");
      expect(source).toContain("trusted_app_origin_not_configured");
      expect(source).not.toContain('req.headers.get("origin")');
      expect(source).not.toContain("req.headers.get('origin')");
    }
  });

  it("migrates browser-facing sensitive functions away from wildcard CORS", () => {
    const sources = [
      readSource("supabase/functions/create-checkout-session/index.ts"),
      readSource("supabase/functions/create-customer-portal-session/index.ts"),
      readSource("supabase/functions/invite-user/index.ts"),
      readSource("supabase/functions/send-password-reset-email/index.ts"),
      readSource("supabase/functions/submit-marketplace-handoff/index.ts"),
      readSource("supabase/functions/generate-security-audit-export/index.ts"),
      readSource("supabase/functions/ingest-security-observability/index.ts"),
    ];

    for (const source of sources) {
      expect(source).toContain("buildCorsHeaders");
      expect(source).toContain("buildJsonHeaders");
      expect(source).toContain("ALLOWED_APP_ORIGINS");
      expect(source).not.toContain('"Access-Control-Allow-Origin": "*"');
    }
  });
});
