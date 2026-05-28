import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HMRC MTD Phase 1 security contracts", () => {
  it("adds HMRC account-level flags without adding live submission to plan entitlements", () => {
    const entitlements = read("src/lib/entitlements.js");
    ["hmrc_mtd_connection", "hmrc_mtd_sandbox", "hmrc_mtd_read_only", "hmrc_mtd_sandbox_test_data", "hmrc_mtd_live_submission"].forEach((flag) => {
      expect(entitlements).toContain(flag);
    });
    const planSection = entitlements.slice(entitlements.indexOf("const STARTER_FEATURES"), entitlements.indexOf("export const PLAN_ENTITLEMENTS"));
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION");
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_READ_ONLY");
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_LIVE_SUBMISSION");
  });

  it("creates isolated HMRC tables and avoids browser token access", () => {
    const sql = read("supabase/hmrc_mtd_phase1.sql");
    ["hmrc_connections", "hmrc_oauth_states", "hmrc_api_audit_log", "account_feature_flags"].forEach((table) => {
      expect(sql).toContain(`public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    });
    expect(sql).toContain("access_token_ciphertext");
    expect(sql).toContain("refresh_token_ciphertext");
    expect(sql).toContain("revoke all on public.account_feature_flags from anon, authenticated");
    expect(sql).toContain("revoke all on public.hmrc_connections from anon, authenticated");
    expect(sql).toContain("grant select (");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on public\.hmrc_connections to authenticated/i);
    expect(sql).not.toMatch(/account_feature_flags_manage_managers/);
  });

  it("adds HMRC readiness checks with manager-only read access", () => {
    const sql = read("supabase/hmrc_mtd_phase2_readonly.sql");
    expect(sql).toContain("create table if not exists public.hmrc_readiness_checks");
    expect(sql).toContain("business_details");
    expect(sql).toContain("obligations_income_and_expenditure");
    expect(sql).toContain("property_business_read");
    expect(sql).toContain("alter table public.hmrc_readiness_checks enable row level security");
    expect(sql).toContain("using (public.user_can_manage_account(account_id))");
    expect(sql).toContain("revoke all on public.hmrc_readiness_checks from anon, authenticated");
    expect(sql).toContain("grant select on public.hmrc_readiness_checks to authenticated");
  });

  it("keeps HMRC credentials out of frontend Vite env usage", () => {
    const frontend = [
      read("src/services/hmrcMtdService.js"),
      read("src/pages/compliance/HmrcConnectionPage.jsx"),
      read("src/lib/supabase.js"),
    ].join("\n");
    expect(frontend).not.toContain("HMRC_CLIENT_SECRET");
    expect(frontend).not.toContain("VITE_HMRC");
    expect(frontend).not.toContain("access_token");
    expect(frontend).not.toContain("refresh_token");
  });

  it("routes the HMRC UI behind the connection feature flag", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");
    expect(routes).toContain('path="compliance/hmrc-connection"');
    expect(routes).toContain("ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION");
    expect(sidebar).toContain('to="/compliance/hmrc-connection"');
    expect(sidebar).toContain("ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION");
  });

  it("allows the HMRC OAuth callback to receive browser redirects without Supabase JWT", () => {
    const config = read("supabase/config.toml");
    expect(config).toContain("[functions.hmrc-oauth-callback]");
    expect(config).toMatch(/\[functions\.hmrc-oauth-callback\][\s\S]*verify_jwt\s*=\s*false/);
  });

  it("implements only sandbox OAuth and read-only Edge Functions", () => {
    const files = [
      "hmrc-start-oauth",
      "hmrc-oauth-callback",
      "hmrc-refresh-token",
      "hmrc-disconnect",
      "hmrc-get-connection-status",
      "hmrc-test-readonly-call",
    ].map((name) => read(`supabase/functions/${name}/index.ts`)).join("\n");

    expect(files).toContain("ensureSandboxOnly");
    expect(files).toContain("validateHmrcScopes");
    expect(files).toContain("encrypt");
    expect(files).not.toMatch(/submit\s+return|final declaration|periodic update/i);
    expect(files).not.toMatch(/VITE_HMRC|console\.log\([^)]*(token|secret|code)/i);
  });

  it("uses the harmless HMRC Hello scope only for the sandbox connection probe", () => {
    const helper = read("supabase/functions/_shared/hmrcMtd.ts");
    const page = read("src/pages/compliance/HmrcConnectionPage.jsx");
    const startFunction = read("supabase/functions/hmrc-start-oauth/index.ts");
    const testFunction = read("supabase/functions/hmrc-test-readonly-call/index.ts");
    expect(helper).toContain('"hello"');
    expect(helper).toContain("ensureSandboxProbeScope");
    expect(page).toContain('["hello", "read:self-assessment"]');
    expect(startFunction).toContain("ensureSandboxProbeScope(validateHmrcScopes");
    expect(testFunction).toContain('scopes.includes("hello")');
    expect(testFunction).toContain("needs_reconnect");
    expect(testFunction).toContain('callHmrcJson("/hello/user"');
    expect(testFunction).toContain('callHmrcJson("/sandbox/hello/user"');
    expect(testFunction).toContain('callHmrcJson("/hello/world"');
    expect(testFunction).toContain("sandbox_reachable");
  });

  it("implements real MTD read-only sandbox probes without write endpoints", () => {
    const files = [
      "hmrc-read-business-details",
      "hmrc-read-obligations",
      "hmrc-read-property-business",
      "hmrc-run-readonly-verification",
      "hmrc-save-sandbox-profile",
    ].map((name) => read(`supabase/functions/${name}/index.ts`)).join("\n");
    const shared = `${read("supabase/functions/_shared/hmrcMtdReadOnly.ts")}\n${read("supabase/functions/_shared/hmrcMtdReadOnlyHelpers.ts")}`;
    expect(files).toContain("hmrc_mtd_read_only");
    expect(files).toContain("ensureSandboxOnly");
    expect(files).toContain("writeHmrcReadinessCheck");
    expect(files).toContain("/individuals/business/details/");
    expect(files).toContain("/individuals/obligations/income-and-expenditure/");
    expect(files).toContain("/individuals/business/property/");
    expect(shared).toContain("application/vnd.hmrc.2.0+json");
    expect(shared).toContain("application/vnd.hmrc.3.0+json");
    expect(shared).toContain("application/vnd.hmrc.6.0+json");
    expect(files).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    expect(files).not.toMatch(/submit|final declaration|quarterly update/i);
  });

  it("keeps HMRC sandbox test-data setup separately flagged and sandbox-only", () => {
    const sql = read("supabase/hmrc_mtd_phase3_sandbox_test_data.sql");
    const files = [
      "hmrc-create-test-business",
      "hmrc-create-test-itsa-status",
      "hmrc-delete-test-business",
    ].map((name) => read(`supabase/functions/${name}/index.ts`)).join("\n");
    const helper = `${read("supabase/functions/_shared/hmrcMtd.ts")}\n${read("supabase/functions/_shared/hmrcMtdReadOnly.ts")}\n${read("supabase/functions/_shared/hmrcMtdReadOnlyHelpers.ts")}`;
    const page = read("src/pages/compliance/HmrcConnectionPage.jsx");

    expect(sql).toContain("hmrc_mtd_sandbox_test_data");
    expect(files).toContain("ensureSandboxOnly");
    expect(files).toContain("hmrc_mtd_sandbox_test_data");
    expect(files).toContain("assertWriteSelfAssessmentScope");
    expect(files).toContain("/individuals/self-assessment-test-support/business/");
    expect(files).toContain("/individuals/self-assessment-test-support/itsa-status/");
    expect(files).toContain('status: "blocked"');
    expect(files).not.toContain("safeCode: \"missing_test_identifier\",\n      }, 400)");
    expect(helper).toContain("application/vnd.hmrc.1.0+json");
    expect(helper).toContain('"write:self-assessment"');
    expect(page).toContain("Sandbox test-data setup");
    expect(page).toContain("Reconnect with test-data scope");
    expect(`${files}\n${page}`).not.toMatch(/access_token|refresh_token|HMRC_CLIENT_SECRET|VITE_HMRC/);
  });

  it("surfaces read-only verification controls without exposing secrets", () => {
    const page = read("src/pages/compliance/HmrcConnectionPage.jsx");
    const service = read("src/services/hmrcMtdService.js");
    expect(page).toContain("MTD Sandbox Verification");
    expect(page).toContain("Run read-only verification");
    expect(page).toContain("Check Business Details");
    expect(page).toContain("Check Obligations");
    expect(page).toContain("Check Property Business");
    expect(page).toContain("Live submission disabled");
    expect(read("supabase/functions/_shared/hmrcMtdReadOnly.ts")).toContain("Gov-Test-Scenario");
    expect(service).toContain("hmrc-run-readonly-verification");
    expect(service).toContain("hmrc-read-business-details");
    expect(`${page}\n${service}`).not.toMatch(/access_token|refresh_token|HMRC_CLIENT_SECRET|VITE_HMRC/);
  });

  it("allows HMRC Edge Function CORS from APP_URL and ALLOWED_APP_ORIGINS", () => {
    const edge = read("supabase/functions/_shared/hmrcEdge.ts");
    expect(edge).toContain("HMRC_CORS_ALLOWED_ORIGINS");
    expect(edge).toContain("[APP_URL, ALLOWED_APP_ORIGINS]");
    expect(edge).toContain("buildJsonHeaders(req, HMRC_CORS_ALLOWED_ORIGINS)");
    expect(edge).toContain("buildCorsHeaders(req, HMRC_CORS_ALLOWED_ORIGINS)");
  });

  it("does not fall back to raw APP_URL when building HMRC callback redirects", () => {
    const edge = read("supabase/functions/_shared/hmrcEdge.ts");
    const redirectHelper = edge.slice(edge.indexOf("export function appRedirectUrl"));
    expect(redirectHelper).toContain("if (!resolved.origin)");
    expect(redirectHelper).toContain('new URL(path, resolved.origin)');
    expect(redirectHelper).not.toContain("resolved.origin || APP_URL");
  });

  it("documents secret handling and unfinished scope", () => {
    const setup = read("docs/integrations/hmrc-mtd-sandbox-setup.md");
    const security = read("docs/integrations/hmrc-mtd-security.md");
    expect(setup).toContain("Supabase Edge Function secrets");
    expect(setup).toContain("APP_URL=https://app.tenaqo.com");
    expect(setup).toContain("Do not set `APP_URL` to the old `https://www.oasisrentalmgt.app` domain");
    expect(setup).toContain("ALLOWED_APP_ORIGINS");
    expect(setup).toContain("`hello` for the harmless HMRC Hello API read-only connection probe");
    expect(setup).toContain("sandbox_reachable");
    expect(setup).toContain("No 'Access-Control-Allow-Origin' header");
    expect(setup).toContain("No live submission");
    expect(setup).toContain("No quarterly update submission");
    expect(setup).toContain("Business Details (MTD) 2.0");
    expect(setup).toContain("Property Business (MTD) 6.0");
    expect(read("docs/integrations/hmrc-mtd-readonly-verification.md")).toContain("Business Details (MTD) 2.0");
    expect(security).toContain("Never log");
    expect(security).toContain("Tenants cannot access HMRC connection data");
    expect(security).toContain("Contractors cannot access HMRC connection data");
  });
});
