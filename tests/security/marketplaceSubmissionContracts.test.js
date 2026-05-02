import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("marketplace submission contracts", () => {
  it("keeps Checkatrade submission behind an authenticated manager-only Edge Function seam", () => {
    const source = readSource("supabase/functions/submit-marketplace-handoff/index.ts");

    expect(source).toContain('buildCorsHeaders');
    expect(source).toContain('buildJsonHeaders');
    expect(source).toContain('safeErrorResponse');
    expect(source).toContain('assert_manage_account_access');
    expect(source).toContain('marketplace_integration_settings');
    expect(source).toContain('external_marketplace_jobs');
    expect(source).toContain('CHECKATRADE_API_KEY');
    expect(source).toContain('CHECKATRADE_API_SECRET');
    expect(source).toContain('submitMarketplaceTransport');
    expect(source).toContain('edge_record_marketplace_submission_result');
    expect(source).toContain('already_submitted');
    expect(source).toContain('marketplace_provider_not_enabled');
    expect(source).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it("keeps the frontend on the Edge Function seam instead of direct provider calls", () => {
    const source = readSource("src/services/marketplaceIntegrationService.js");

    expect(source).toContain('supabase.functions.invoke("submit-marketplace-handoff"');
    expect(source).not.toContain('fetch("https://www.checkatrade.com');
    expect(source).not.toContain("fetch('https://www.checkatrade.com");
  });
});
