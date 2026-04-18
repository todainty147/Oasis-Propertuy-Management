import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
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
});
