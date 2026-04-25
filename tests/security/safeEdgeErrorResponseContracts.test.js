import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { safeErrorResponse } from "../../supabase/functions/_shared/safeErrorResponse.ts";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const migratedFunctions = [
  "supabase/functions/create-checkout-session/index.ts",
  "supabase/functions/create-customer-portal-session/index.ts",
  "supabase/functions/invite-user/index.ts",
  "supabase/functions/send-password-reset-email/index.ts",
  "supabase/functions/generate-attention-insight/index.ts",
  "supabase/functions/generate-property-health-explainer/index.ts",
  "supabase/functions/generate-security-audit-export/index.ts",
  "supabase/functions/ingest-security-observability/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
];

describe("safe Edge Function error responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a stable client-safe body with a correlation ID", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = safeErrorResponse(
      new Request("https://edge.example.test", {
        headers: { Origin: "https://app.oasis.example" },
      }),
      {
        allowedOrigins: "https://app.oasis.example",
        error: new Error("relation account_members does not exist for provider request"),
        functionName: "create-checkout-session",
        message: "Operation failed",
        status: 500,
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.oasis.example");

    const body = await response.json();
    expect(body.error).toBe("Operation failed");
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(body)).not.toContain("account_members");
    expect(JSON.stringify(body)).not.toContain("provider request");
  });

  it("logs internal diagnostics server-side without returning sensitive context keys", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await safeErrorResponse(new Request("https://edge.example.test"), {
      allowedOrigins: "",
      correlationId: "corr-safe-1",
      context: {
        accountId: "account-1",
        token: "secret-token",
      },
      error: new Error("Stripe customer lookup failed"),
      functionName: "create-customer-portal-session",
      message: "Operation failed",
      status: 500,
    }).text();

    const logPayload = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logPayload.correlationId).toBe("corr-safe-1");
    expect(logPayload.error.message).toBe("Stripe customer lookup failed");
    expect(logPayload.context.accountId).toBe("account-1");
    expect(logPayload.context).not.toHaveProperty("token");
  });

  it("migrates browser-facing sensitive functions away from raw error.message responses", () => {
    for (const filePath of migratedFunctions) {
      const source = readSource(filePath);
      expect(source).toContain("safeErrorResponse");
      expect(source).not.toMatch(/return respond\(\{\s*error:\s*[^}\n]*\.message/);
      expect(source).not.toMatch(/error instanceof Error \? error\.message/);
      expect(source).not.toMatch(/return respond\(\{\s*error:\s*[^}\n]*\|\| "Unknown/);
    }
  });
});
