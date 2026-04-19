import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import nextConfig from "../../marketing-site/next.config.mjs";

function headersToMap(headers) {
  return new Map(headers.map((header) => [header.key.toLowerCase(), header.value]));
}

describe("browser security headers", () => {
  it("configures the SPA Vercel deployment with a production security header baseline", () => {
    const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
    const headerRule = vercelConfig.headers?.find((rule) => rule.source === "/(.*)");
    const headers = headersToMap(headerRule?.headers || []);
    const csp = headers.get("content-security-policy-report-only");

    expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com");
    expect(csp).toContain("frame-src 'self' blob: https://*.supabase.co");
    expect(vercelConfig.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
    expect(vercelConfig.routes).toBeUndefined();
  });

  it("configures the marketing site with the same enforced headers and report-only CSP", async () => {
    const rules = await nextConfig.headers();
    const rootRule = rules.find((rule) => rule.source === "/:path*");
    const headers = headersToMap(rootRule?.headers || []);
    const csp = headers.get("content-security-policy-report-only");

    expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("permissions-policy")).toContain("microphone=()");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-src 'none'");
  });
});
