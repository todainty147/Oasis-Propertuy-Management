import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("golden signals documentation contracts", () => {
  it("defines launch SLOs against existing OASIS telemetry surfaces", () => {
    const doc = readSource("docs/OPERATIONAL_GOLDEN_SIGNALS.md");
    const roadmap = readSource("docs/OASIS_ENGINEERING_ROADMAP.md");
    const observabilitySql = readSource("supabase/security_observability_events.sql");
    const rootTelemetryPage = readSource("src/pages/RootTelemetryPage.jsx");

    expect(doc).toContain("## Launch SLO Targets");
    expect(doc).toContain("## Golden Signal Definitions");
    expect(doc).toContain("dashboard_snapshot");
    expect(doc).toContain("finance_snapshot");
    expect(doc).toContain("portfolio_health_snapshot");
    expect(doc).toContain("security_observability_event_feed");
    expect(doc).toContain("latency_sample");
    expect(doc).toContain("latency_threshold_exceeded");
    expect(doc).toContain("Scheduled outbound jobs");
    expect(roadmap).toContain("OPERATIONAL_GOLDEN_SIGNALS.md");
    expect(observabilitySql).toContain("security_observability_latency_rollup");
    expect(observabilitySql).toContain("security_observability_burst_rollup");
    expect(observabilitySql).toContain("security_observability_trend_series");
    expect(rootTelemetryPage).toContain("LATENCY_SLO_TARGETS");
  });

  it("does not call root telemetry RPCs when the active account lacks the root telemetry entitlement", () => {
    const rootTelemetryPage = readSource("src/pages/RootTelemetryPage.jsx");

    expect(rootTelemetryPage).toContain("accountHasRootTelemetryEntitlement");
    expect(rootTelemetryPage).toContain("isRootOperator ||");
    expect(rootTelemetryPage).toContain("hasFeature(activeAccountPlan, ENTITLEMENT_FEATURES.ROOT_TELEMETRY)");
    expect(rootTelemetryPage).toContain("!canAccessTelemetryView || !accountHasRootTelemetryEntitlement");
    expect(rootTelemetryPage).toContain("!isRootTelemetryAdmin || !accountHasRootTelemetryEntitlement");
    expect(rootTelemetryPage).toContain("<FeatureAccessCard");
  });

  it("keeps backend feature gates aligned with root operator entitlement bypass", () => {
    const entitlementSql = readSource("supabase/account_entitlements.sql");
    const rootBypassIndex = entitlementSql.indexOf("public.user_is_root_operator()");
    const planGateIndex = entitlementSql.indexOf("public.account_has_feature(p_account_id, v_feature)");

    expect(rootBypassIndex).toBeGreaterThan(-1);
    expect(planGateIndex).toBeGreaterThan(-1);
    expect(rootBypassIndex).toBeLessThan(planGateIndex);
  });

  it("formalizes operational security alert thresholds and retention guidance", () => {
    const runbook = readSource("docs/runbooks/security-alert-response.md");
    const observability = readSource("docs/SECURITY_OBSERVABILITY.md");
    const hostedSink = readSource("docs/HOSTED_SECURITY_LOG_SINK.md");
    const runbookIndex = readSource("docs/runbooks/README.md");

    expect(runbook).toContain("## Severity And SLA Model");
    expect(runbook).toContain("## Alert Matrix");
    expect(runbook).toContain("## Review Cadence");
    expect(runbook).toContain("## Retention Guidance");
    expect(runbook).toContain("Rate-limit spikes");
    expect(runbook).toContain("Repeated authorization denials");
    expect(runbook).toContain("Invite abuse");
    expect(runbook).toContain("Password reset abuse");
    expect(runbook).toContain("Provider send failures");
    expect(runbook).toContain("Security export failures");
    expect(runbook).toContain("SEV-1 Critical");
    expect(runbook).toContain("SEV-2 High");
    expect(runbook).toContain("Security owner");
    expect(runbook).toContain("Engineering owner");
    expect(runbook).toContain("Hosted security observability rows");
    expect(runbook).toContain("Durable denied events");
    expect(runbook).toContain("Outbound email/SMS events");
    expect(runbook).toContain("Security export jobs and generated files");
    expect(observability).toContain("runbooks/security-alert-response.md");
    expect(hostedSink).toContain("runbooks/security-alert-response.md");
    expect(runbookIndex).toContain("security-alert-response.md");
  });
});
