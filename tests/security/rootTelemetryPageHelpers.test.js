import { describe, expect, it } from "vitest";

import {
  buildRootTelemetryBucketDrilldown,
  buildRootTelemetrySaturationRows,
  buildRootTelemetryTrendBars,
  buildTrendDelta,
  buildRootTelemetryLatencyRows,
  buildRootTelemetrySummary,
  buildRootTelemetrySurfaceRows,
  buildRootTelemetryWorkflowRows,
  filterRootTelemetryEventsByWindow,
} from "../../src/pages/RootTelemetryPage.jsx";
import { canAccessRootTelemetry, getRootTelemetryAccessMode } from "../../src/utils/telemetryAccess";

describe("root telemetry page helpers", () => {
  const t = (key, params = {}) =>
    ({
      "securityAudit.hostedEvents.surface.documents": "Documents",
      "securityAudit.hostedEvents.surface.invitations": "Invitations",
      "securityAudit.hostedEvents.surface.finance": "Finance",
      "securityAudit.hostedEvents.surface.maintenance": "Maintenance",
      "securityAudit.hostedEvents.surface.workOrders": "Work Orders",
      "securityAudit.hostedEvents.surface.commandCenter": "Command Center",
      "securityAudit.hostedEvents.surface.attentionCenter": "Attention Center",
      "securityAudit.hostedEvents.surface.dashboard": "Dashboard",
      "securityAudit.hostedEvents.surface.portfolioHealth": "Portfolio Health",
      "rootTelemetry.workflows.uploads": "Uploads",
      "rootTelemetry.workflows.invites": "Invites",
      "rootTelemetry.workflows.finance": "Finance reporting",
      "rootTelemetry.workflows.maintenance": "Maintenance operations",
      "rootTelemetry.surfaceRisk.latestSeen": `Latest seen ${params.timestamp || ""}`,
      "rootTelemetry.surfaceRisk.breakdown": `${params.denials || 0} denials / ${params.failures || 0} failures`,
      "rootTelemetry.latency.latestSeen": `Latest slow signal ${params.timestamp || ""}`,
      "rootTelemetry.latency.samples": `Samples ${params.count || 0}`,
      "rootTelemetry.latency.slowCount": `Slow signals ${params.count || 0}`,
      "rootTelemetry.latency.p50": `p50 ${params.duration || ""}`,
      "rootTelemetry.latency.p95": `p95 ${params.duration || ""}`,
      "rootTelemetry.latency.target": `Target ${params.duration || ""}`,
      "rootTelemetry.latency.maxDuration": `Slowest seen ${params.duration || ""}`,
      "rootTelemetry.latency.status.healthy": "Healthy",
      "rootTelemetry.latency.status.watch": "Watch",
      "rootTelemetry.latency.status.breach": "Breach",
      "rootTelemetry.saturation.status.watch": "Watch",
      "rootTelemetry.saturation.status.burst": "Burst",
    }[key] || key);

  it("filters telemetry events by the selected recent window", () => {
    const rows = filterRootTelemetryEventsByWindow(
      [
        { created_at: "2026-03-28T11:55:00.000Z" },
        { created_at: "2026-03-28T11:10:00.000Z" },
        { created_at: "2026-03-28T09:30:00.000Z" },
      ],
      "1h",
      new Date("2026-03-28T12:00:00.000Z"),
    );

    expect(rows).toHaveLength(2);
  });

  it("builds a simple numeric trend delta", () => {
    expect(buildTrendDelta(5, 2)).toBe(3);
    expect(buildTrendDelta(2, 5)).toBe(-3);
    expect(buildTrendDelta(2, 2)).toBe(0);
  });

  it("builds normalized trend bars from aggregated buckets", () => {
    const bars = buildRootTelemetryTrendBars([
      { bucketStart: "2026-03-28T11:30:00.000Z", totalSignals: 1 },
      { bucketStart: "2026-03-28T11:40:00.000Z", totalSignals: 5 },
      { bucketStart: "2026-03-28T11:50:00.000Z", totalSignals: 3 },
    ]);

    expect(bars[0].barHeight).toBeGreaterThan(0);
    expect(bars[1].barHeight).toBe(100);
    expect(bars[2].barHeight).toBeGreaterThan(bars[0].barHeight);
  });

  it("builds the root telemetry summary from observability events", () => {
    const summary = buildRootTelemetrySummary(
      [
        { kind: "authorization_denied", surface: "documents", reason: "rls_denied" },
        { kind: "unexpected_security_failure", surface: "documents", reason: "timeout" },
        { kind: "unexpected_security_failure", surface: "invitations", reason: "invalid_request" },
        { kind: "unexpected_security_failure", surface: "finance", reason: "timeout" },
        { kind: "latency_threshold_exceeded", surface: "dashboard", reason: "slow_response" },
      ],
      { activeAlertsTotal: 3 },
    );

    expect(summary.signalVolume).toBe(5);
    expect(summary.authorizationDenials).toBe(1);
    expect(summary.unexpectedFailures).toBe(3);
    expect(summary.storageFailures).toBe(2);
    expect(summary.inviteFailures).toBe(1);
    expect(summary.paymentsFailures).toBe(2);
    expect(summary.slowResponses).toBe(1);
    expect(summary.activeAlertsTotal).toBe(3);
  });

  it("groups surface rows with counts and latest seen time", () => {
    const rows = buildRootTelemetrySurfaceRows(
      [
        { kind: "authorization_denied", surface: "documents", created_at: "2026-03-28T10:00:00.000Z" },
        { kind: "unexpected_security_failure", surface: "documents", created_at: "2026-03-28T11:00:00.000Z" },
        { kind: "unexpected_security_failure", surface: "invitations", created_at: "2026-03-28T09:00:00.000Z" },
      ],
      t,
    );

    expect(rows[0]).toMatchObject({
      key: "documents",
      label: "Documents",
      count: 2,
      denials: 1,
      failures: 1,
      latestSeenAt: "2026-03-28T11:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      key: "invitations",
      label: "Invitations",
      count: 1,
    });
  });

  it("builds workflow rows for uploads, invites, finance, and maintenance", () => {
    const rows = buildRootTelemetryWorkflowRows(
      [
        { surface: "documents", created_at: "2026-03-28T10:00:00.000Z" },
        { surface: "invitations", created_at: "2026-03-28T09:00:00.000Z" },
        { surface: "finance", created_at: "2026-03-28T08:00:00.000Z" },
        { surface: "maintenance", created_at: "2026-03-28T07:00:00.000Z" },
      ],
      t,
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "uploads", label: "Uploads", count: 1, to: "/documents" }),
        expect.objectContaining({ key: "invites", label: "Invites", count: 1, to: "/invitations" }),
        expect.objectContaining({ key: "finance", label: "Finance reporting", count: 1, to: "/finance" }),
        expect.objectContaining({ key: "maintenance", label: "Maintenance operations", count: 1, to: "/maintenance-inbox" }),
      ]),
    );
  });

  it("builds bucket drilldown rows from the selected history bucket", () => {
    const rows = buildRootTelemetryBucketDrilldown(
      [
        { surface: "documents", kind: "authorization_denied", created_at: "2026-03-28T11:02:00.000Z" },
        { surface: "documents", kind: "unexpected_security_failure", created_at: "2026-03-28T11:03:00.000Z" },
        { surface: "finance", kind: "latency_threshold_exceeded", created_at: "2026-03-28T11:04:00.000Z" },
        { surface: "invitations", kind: "authorization_denied", created_at: "2026-03-28T11:11:00.000Z" },
      ],
      "2026-03-28T11:00:00.000Z",
      10,
      t,
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "uploads",
          label: "Uploads",
          count: 2,
          denials: 1,
          failures: 1,
          slowCount: 0,
          to: "/documents",
        }),
        expect.objectContaining({
          key: "finance",
          label: "Finance reporting",
          count: 1,
          denials: 0,
          failures: 0,
          slowCount: 1,
          to: "/finance",
        }),
      ]),
    );
  });

  it("builds latency rows from slow-response telemetry events", () => {
    const rows = buildRootTelemetryLatencyRows(
      [
        {
          kind: "latency_sample",
          surface: "finance",
          created_at: "2026-03-28T09:55:00.000Z",
          metadata: { duration_ms: 820, target_ms: 1200 },
        },
        {
          kind: "latency_threshold_exceeded",
          surface: "finance",
          created_at: "2026-03-28T10:00:00.000Z",
          metadata: { duration_ms: 1630 },
        },
        {
          kind: "latency_sample",
          surface: "finance",
          created_at: "2026-03-28T10:30:00.000Z",
          metadata: { duration_ms: 1630, target_ms: 1200 },
        },
        {
          kind: "latency_sample",
          surface: "finance",
          created_at: "2026-03-28T11:00:00.000Z",
          metadata: { duration_ms: 1940, target_ms: 1200 },
        },
        {
          kind: "latency_threshold_exceeded",
          surface: "finance",
          created_at: "2026-03-28T11:00:00.000Z",
          metadata: { duration_ms: 1940, threshold_ms: 1200 },
        },
        {
          kind: "latency_sample",
          surface: "dashboard",
          created_at: "2026-03-28T09:00:00.000Z",
          metadata: { duration_ms: 910, target_ms: 1200 },
        },
      ],
      t,
    );

    expect(rows[0]).toMatchObject({
      key: "finance",
      label: "Finance",
      sampleCount: 3,
      slowCount: 2,
      p50DurationMs: 1630,
      p95DurationMs: 1940,
      targetMs: 1200,
      status: "breach",
      maxDurationMs: 1940,
      latestSeenAt: "2026-03-28T11:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      key: "dashboard",
      label: "Dashboard",
      sampleCount: 1,
      slowCount: 0,
      p50DurationMs: 910,
      p95DurationMs: 910,
      targetMs: 1200,
      status: "healthy",
      maxDurationMs: 910,
    });
  });

  it("builds saturation rows from repeated failure bursts", () => {
    const rows = buildRootTelemetrySaturationRows(
      [
        {
          kind: "unexpected_security_failure",
          surface: "documents",
          reason: "timeout",
          created_at: "2026-03-28T11:40:00.000Z",
        },
        {
          kind: "unexpected_security_failure",
          surface: "documents",
          reason: "timeout",
          created_at: "2026-03-28T11:45:00.000Z",
        },
        {
          kind: "authorization_denied",
          surface: "documents",
          reason: "rls_denied",
          created_at: "2026-03-28T11:50:00.000Z",
        },
        {
          kind: "authorization_denied",
          surface: "documents",
          reason: "rls_denied",
          created_at: "2026-03-28T11:55:00.000Z",
        },
      ],
      t,
    );

    expect(rows[0]).toMatchObject({
      key: "documents:rls_denied",
      label: "Documents",
      burstCount: 2,
      denials: 2,
      failures: 0,
      slowCount: 0,
    });
    expect(rows[1]).toMatchObject({
      key: "documents:timeout",
      label: "Documents",
      burstCount: 2,
      denials: 0,
      failures: 2,
      slowCount: 0,
    });
  });

  it("keeps telemetry access root-only today while leaving room for future support access", () => {
    expect(
      canAccessRootTelemetry({
        isRootOperator: true,
        activeRole: "owner",
        user: { app_metadata: {} },
      }),
    ).toBe(true);

    expect(
      canAccessRootTelemetry({
        isRootOperator: false,
        activeRole: "owner",
        user: { app_metadata: { oasis_support_roles: ["telemetry"] } },
      }),
    ).toBe(false);

    expect(
      getRootTelemetryAccessMode({
        isRootOperator: false,
        activeRole: null,
        user: { app_metadata: { oasis_support_roles: ["telemetry"] } },
      }),
    ).toBe("support");
  });
});
