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
    expect(rootTelemetryPage).toContain("hasFeature(activeAccountPlan, ENTITLEMENT_FEATURES.ROOT_TELEMETRY)");
    expect(rootTelemetryPage).toContain("!canAccessTelemetryView || !accountHasRootTelemetryEntitlement");
    expect(rootTelemetryPage).toContain("!isRootTelemetryAdmin || !accountHasRootTelemetryEntitlement");
    expect(rootTelemetryPage).toContain("<FeatureAccessCard");
  });
});
