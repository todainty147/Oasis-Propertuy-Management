import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTERS,
  DEFAULT_HOSTED_EVENT_FILTERS,
  ALERT_CLASSIFICATIONS,
  HOSTED_EVENT_KINDS,
  filtersFromSearchParams,
  pageFromSearchParams,
  alertStatusFromSearchParams,
  focusedAlertIdFromSearchParams,
  focusedHostedEventIdFromSearchParams,
  buildSearchParams,
  sanitizeFilePart,
  escapeSqlLiteral,
  formatDateTime,
  formatBytes,
  clampInt,
  shortenId,
  summarizeMetadata,
  hiddenExportJobsKey,
} from "../../src/pages/security-audit/utils.js";

import {
  anomalySeverityTone,
  alertStatusTone,
  hostedEventKindTone,
  startCase,
  normalizeSecurityKey,
  describeHostedEventSurface,
  describeHostedEventReason,
  describeHostedEventKind,
  hostedEventSeverity,
  hostedEventSeverityTone,
  describeHostedEventSeverity,
  hostedEventRecommendationTone,
  buildHostedEventSummary,
  buildHostedEventContext,
  summarizeHostedEvents,
  buildHostedEventRecommendedAction,
  groupHostedEventCorrelations,
  findRelatedAnomalyAlertForHostedEvent,
  findRelatedHostedEventForAnomalyAlert,
} from "../../src/pages/security-audit/hostedEventHelpers.js";

import {
  buildHostedEventsEmptyGuidance,
  buildAnomalyEmptyGuidance,
  buildAnomalyFlagContext,
  buildAlertWorkflowSummary,
  buildInvestigationEntityContext,
  buildInvestigationEntityLinks,
  buildInvestigationTimelineItems,
  timelineTone,
  buildInvestigationContextSummary,
} from "../../src/pages/security-audit/investigationHelpers.js";

const t = (key, vars) => {
  if (!vars) return key;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    key,
  );
};

describe("security-audit utils", () => {
  it("exports stable constant shapes", () => {
    expect(DEFAULT_FILTERS).toMatchObject({ dateFrom: "", action: "", entityId: "" });
    expect(DEFAULT_HOSTED_EVENT_FILTERS).toMatchObject({ kind: "", limit: 25 });
    expect(ALERT_CLASSIFICATIONS).toContain("suspicious");
    expect(HOSTED_EVENT_KINDS).toContain("authorization_denied");
  });

  it("filtersFromSearchParams reads url params", () => {
    const sp = new URLSearchParams("from=2024-01-01&action=login&actor=abc");
    const f = filtersFromSearchParams(sp);
    expect(f.dateFrom).toBe("2024-01-01");
    expect(f.action).toBe("login");
    expect(f.actorUserId).toBe("abc");
    expect(f.entityId).toBe("");
  });

  it("pageFromSearchParams clamps to minimum 1", () => {
    expect(pageFromSearchParams(new URLSearchParams("page=3"))).toBe(3);
    expect(pageFromSearchParams(new URLSearchParams("page=-1"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams(""))).toBe(1);
  });

  it("alertStatusFromSearchParams restricts to known values", () => {
    expect(alertStatusFromSearchParams(new URLSearchParams("alertStatus=resolved"))).toBe("resolved");
    expect(alertStatusFromSearchParams(new URLSearchParams("alertStatus=garbage"))).toBe("active");
    expect(alertStatusFromSearchParams(new URLSearchParams(""))).toBe("active");
  });

  it("focusedAlertIdFromSearchParams and focusedHostedEventIdFromSearchParams read correct keys", () => {
    const sp = new URLSearchParams("alert=alert-1&hosted=event-2");
    expect(focusedAlertIdFromSearchParams(sp)).toBe("alert-1");
    expect(focusedHostedEventIdFromSearchParams(sp)).toBe("event-2");
  });

  it("buildSearchParams round-trips filters", () => {
    const f = { dateFrom: "2024-01-01", dateTo: "", action: "login", actorUserId: "", entityType: "property", entityId: "" };
    const params = buildSearchParams(f, 2, "ev-1", "resolved", "al-1", "he-1");
    expect(params.get("from")).toBe("2024-01-01");
    expect(params.get("page")).toBe("2");
    expect(params.get("alertStatus")).toBe("resolved");
    expect(params.get("event")).toBe("ev-1");
    expect(params.get("alert")).toBe("al-1");
    expect(params.get("hosted")).toBe("he-1");
    expect(params.has("to")).toBe(false);
  });

  it("buildSearchParams omits defaults (page=1, alertStatus=active)", () => {
    const params = buildSearchParams(DEFAULT_FILTERS, 1, "", "active", "", "");
    expect(params.toString()).toBe("");
  });

  it("sanitizeFilePart replaces special chars and spaces", () => {
    expect(sanitizeFilePart("hello world!", "fb")).toBe("hello_world_");
    expect(sanitizeFilePart("", "fallback")).toBe("fallback");
    expect(sanitizeFilePart(null, "fb")).toBe("fb");
  });

  it("escapeSqlLiteral doubles single quotes", () => {
    expect(escapeSqlLiteral("it's")).toBe("it''s");
    expect(escapeSqlLiteral("")).toBe("");
    expect(escapeSqlLiteral(null)).toBe("");
  });

  it("formatDateTime returns — for null/invalid", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(typeof formatDateTime("2024-01-01T12:00:00Z")).toBe("string");
  });

  it("formatBytes handles edge cases", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("clampInt clamps to range and returns fallback for invalid", () => {
    expect(clampInt("5", 1, 1, 10)).toBe(5);
    expect(clampInt("15", 1, 1, 10)).toBe(10);
    expect(clampInt("0", 1, 1, 10)).toBe(1);
    expect(clampInt("abc", 3, 1, 10)).toBe(3);
  });

  it("shortenId truncates long ids and leaves short ones intact", () => {
    expect(shortenId("abc")).toBe("abc");
    expect(shortenId("")).toBe("—");
    const long = "abcdefghijklmnop";
    const result = shortenId(long);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(long.length);
  });

  it("summarizeMetadata uses prioritized keys when present", () => {
    const meta = { old_role: "staff", new_role: "admin", unrelated: "x" };
    const result = summarizeMetadata(meta, t);
    expect(result).toContain("old_role");
    expect(result).toContain("new_role");
  });

  it("summarizeMetadata falls back to first 3 entries when no prioritized keys match", () => {
    const meta = { foo: "bar", baz: "qux" };
    const result = summarizeMetadata(meta, t);
    expect(result).toContain("foo");
  });

  it("summarizeMetadata returns empty key for null/non-object", () => {
    expect(summarizeMetadata(null, t)).toBe("securityAudit.metadata.empty");
    expect(summarizeMetadata("string", t)).toBe("securityAudit.metadata.empty");
    expect(summarizeMetadata([], t)).toBe("securityAudit.metadata.empty");
  });

  it("hiddenExportJobsKey includes accountId", () => {
    expect(hiddenExportJobsKey("acc-1")).toContain("acc-1");
    expect(hiddenExportJobsKey(null)).toContain("unknown");
  });
});

describe("hostedEventHelpers", () => {
  it("anomalySeverityTone returns rose for urgent", () => {
    expect(anomalySeverityTone("urgent")).toContain("rose");
    expect(anomalySeverityTone("action")).toContain("amber");
    expect(anomalySeverityTone("info")).toContain("slate");
    expect(anomalySeverityTone("URGENT")).toContain("rose");
  });

  it("alertStatusTone distinguishes resolved/acknowledged/open", () => {
    expect(alertStatusTone("resolved")).toContain("emerald");
    expect(alertStatusTone("acknowledged")).toContain("blue");
    expect(alertStatusTone("open")).toContain("amber");
  });

  it("hostedEventKindTone returns rose for authorization_denied", () => {
    expect(hostedEventKindTone("authorization_denied")).toContain("rose");
    expect(hostedEventKindTone("unexpected_security_failure")).toContain("amber");
  });

  it("startCase capitalizes each word", () => {
    expect(startCase("work_order")).toBe("Work Order");
    expect(startCase("maintenance-request")).toBe("Maintenance Request");
    expect(startCase("")).toBe("");
  });

  it("normalizeSecurityKey lowercases and replaces spaces/dashes with underscores", () => {
    expect(normalizeSecurityKey("Command Center")).toBe("command_center");
    expect(normalizeSecurityKey("auth-denied")).toBe("auth_denied");
  });

  it("describeHostedEventSurface maps known surfaces", () => {
    expect(describeHostedEventSurface("command_center", t)).toBe("securityAudit.hostedEvents.surface.commandCenter");
    expect(describeHostedEventSurface("finance", t)).toBe("securityAudit.hostedEvents.surface.finance");
    expect(describeHostedEventSurface("unknown_xyz", t)).toBe("Unknown Xyz");
    expect(describeHostedEventSurface("", t)).toBe("securityAudit.hostedEvents.summary.unknownSurface");
  });

  it("describeHostedEventReason maps known reasons", () => {
    expect(describeHostedEventReason("rls_policy", t)).toBe("securityAudit.hostedEvents.reason.rlsDenied");
    expect(describeHostedEventReason("guard_denied", t)).toBe("securityAudit.hostedEvents.reason.guardDenied");
    expect(describeHostedEventReason("", t)).toBe("—");
  });

  it("describeHostedEventKind maps authorization_denied and unexpected_security_failure", () => {
    expect(describeHostedEventKind("authorization_denied", t)).toBe("securityAudit.hostedEvents.kind.authorizationDenied");
    expect(describeHostedEventKind("unexpected_security_failure", t)).toBe("securityAudit.hostedEvents.kind.unexpectedFailure");
    expect(describeHostedEventKind("", t)).toBe("—");
  });

  it("hostedEventSeverity classifies correctly", () => {
    expect(hostedEventSeverity({ kind: "authorization_denied" })).toBe("urgent");
    expect(hostedEventSeverity({ guard_denied: true, kind: "other" })).toBe("urgent");
    expect(hostedEventSeverity({ kind: "unexpected_security_failure" })).toBe("action");
    expect(hostedEventSeverity({ kind: "other" })).toBe("info");
    expect(hostedEventSeverity(null)).toBe("info");
  });

  it("hostedEventSeverityTone delegates to anomalySeverityTone", () => {
    expect(hostedEventSeverityTone("urgent")).toBe(anomalySeverityTone("urgent"));
    expect(hostedEventSeverityTone("action")).toBe(anomalySeverityTone("action"));
    expect(hostedEventSeverityTone("info")).toContain("slate");
  });

  it("describeHostedEventSeverity returns i18n key", () => {
    expect(describeHostedEventSeverity("urgent", t)).toBe("securityAudit.severity.urgent");
    expect(describeHostedEventSeverity("action", t)).toBe("securityAudit.severity.action");
    expect(describeHostedEventSeverity("info", t)).toBe("securityAudit.severity.info");
  });

  it("hostedEventRecommendationTone returns blue for authorization_denied", () => {
    expect(hostedEventRecommendationTone("authorization_denied")).toContain("blue");
    expect(hostedEventRecommendationTone("unexpected_security_failure")).toContain("violet");
  });

  it("buildHostedEventSummary returns surface+entity summary", () => {
    const row = { kind: "authorization_denied", surface: "finance", entity_type: "payment" };
    const result = buildHostedEventSummary(row, t);
    expect(result).toContain("authorizationDenied");
  });

  it("buildHostedEventContext includes guard/reason/entity/correlation parts", () => {
    const row = {
      guard_denied: true,
      reason: "rls_policy",
      entity_type: "property",
      entity_id: "prop-123",
      correlation_id: "corr-456",
    };
    const result = buildHostedEventContext(row, t);
    expect(result).toContain("securityAudit.hostedEvents.context.guardDenied");
    expect(result).toContain("securityAudit.hostedEvents.context.reason");
    expect(result).toContain("securityAudit.hostedEvents.context.entity");
    expect(result).toContain("securityAudit.hostedEvents.context.correlation");
  });

  it("summarizeHostedEvents counts denied, unexpected, guardDenied, topSurface", () => {
    const rows = [
      { kind: "authorization_denied", surface: "finance", guard_denied: true },
      { kind: "authorization_denied", surface: "finance" },
      { kind: "unexpected_security_failure", surface: "documents" },
    ];
    const s = summarizeHostedEvents(rows);
    expect(s.total).toBe(3);
    expect(s.denied).toBe(2);
    expect(s.unexpected).toBe(1);
    expect(s.guardDenied).toBe(1);
    expect(s.topSurface).toBe("finance");
  });

  it("summarizeHostedEvents handles empty array", () => {
    const s = summarizeHostedEvents([]);
    expect(s.total).toBe(0);
    expect(s.topSurface).toBe("");
  });

  it("buildHostedEventRecommendedAction returns kind-specific string", () => {
    const row = { kind: "authorization_denied", surface: "finance" };
    const result = buildHostedEventRecommendedAction(row, t);
    expect(result).toContain("authorizationDenied");
  });

  it("groupHostedEventCorrelations groups by surface+entityType+reason", () => {
    const rows = [
      { surface: "finance", entity_type: "payment", reason: "rls", created_at: "2024-01-02" },
      { surface: "finance", entity_type: "payment", reason: "rls", created_at: "2024-01-01" },
      { surface: "documents", entity_type: "document", reason: "guard", created_at: "2024-01-03" },
    ];
    const groups = groupHostedEventCorrelations(rows);
    expect(groups[0].count).toBe(2);
    expect(groups[0].surface).toBe("finance");
    expect(groups[0].latestAt).toBe("2024-01-02");
    expect(groups.length).toBe(2);
  });

  it("findRelatedAnomalyAlertForHostedEvent matches by entityType+entityId", () => {
    const row = { entity_type: "property", entity_id: "prop-1" };
    const alerts = [
      { entityType: "payment", metadata: { recommended_filters: { entityId: "pay-1" } } },
      { entityType: "property", metadata: { recommended_filters: { entityId: "prop-1" } } },
    ];
    const result = findRelatedAnomalyAlertForHostedEvent(row, alerts);
    expect(result).toBe(alerts[1]);
  });

  it("findRelatedAnomalyAlertForHostedEvent matches by latest_event_id", () => {
    const row = { id: "ev-123", entity_type: "payment", entity_id: "pay-1" };
    const alerts = [
      { entityType: "payment", metadata: { latest_event_id: "ev-123", recommended_filters: { entityId: "pay-99" } } },
    ];
    expect(findRelatedAnomalyAlertForHostedEvent(row, alerts)).toBe(alerts[0]);
  });

  it("findRelatedAnomalyAlertForHostedEvent returns null when no match", () => {
    expect(findRelatedAnomalyAlertForHostedEvent({ entity_type: "tenant", entity_id: "t-1" }, [])).toBeNull();
  });

  it("findRelatedHostedEventForAnomalyAlert matches by entityType+entityId", () => {
    const alert = { entityType: "property", metadata: { recommended_filters: { entityId: "prop-1" } } };
    const rows = [
      { entity_type: "payment", entity_id: "pay-1" },
      { entity_type: "property", entity_id: "prop-1" },
    ];
    expect(findRelatedHostedEventForAnomalyAlert(alert, rows)).toBe(rows[1]);
  });
});

describe("investigationHelpers", () => {
  it("buildHostedEventsEmptyGuidance returns filtered guidance when filters active", () => {
    const g = buildHostedEventsEmptyGuidance({ category: "", kind: "authorization_denied", surface: "" }, t);
    expect(g.title).toBe("securityAudit.hostedEvents.emptyGuidance.filteredTitle");
  });

  it("buildHostedEventsEmptyGuidance returns quiet guidance when no filters", () => {
    const g = buildHostedEventsEmptyGuidance({ category: "", kind: "", surface: "" }, t);
    expect(g.title).toBe("securityAudit.hostedEvents.emptyGuidance.quietTitle");
    expect(g.checks.length).toBeGreaterThan(0);
  });

  it("buildAnomalyEmptyGuidance returns 3 checks", () => {
    const g = buildAnomalyEmptyGuidance(t);
    expect(g.checks.length).toBe(3);
  });

  it("buildAnomalyFlagContext builds entity+count+actor parts", () => {
    const alert = {
      entityType: "property",
      entityId: "prop-1",
      alertCount: 3,
      actorLabel: "Alice",
      metadata: { recommended_filters: {} },
    };
    const result = buildAnomalyFlagContext(alert, t);
    expect(result).toContain("entity");
    expect(result).toContain("repeatCount");
    expect(result).toContain("actor");
  });

  it("buildAnomalyFlagContext returns empty string for empty alert", () => {
    expect(buildAnomalyFlagContext({}, t)).toBe("");
  });

  it("buildAlertWorkflowSummary builds status+assignee+classification", () => {
    const alert = { status: "open", assignedToLabel: "Bob", classification: "suspicious" };
    const result = buildAlertWorkflowSummary(alert, t);
    expect(result).toContain("status");
    expect(result).toContain("assignee");
    expect(result).toContain("classification");
  });

  it("buildInvestigationEntityContext returns detail array with entity/actor fields", () => {
    const details = buildInvestigationEntityContext({
      hostedEvent: { entity_type: "property", entity_id: "prop-1", surface: "finance", reason: "rls" },
      anomalyAlert: null,
      selectedEvent: null,
      t,
    });
    expect(Array.isArray(details)).toBe(true);
    expect(details.some((d) => d.label.includes("entity"))).toBe(true);
  });

  it("buildInvestigationEntityContext appends alertStatus and classification for anomaly", () => {
    const details = buildInvestigationEntityContext({
      hostedEvent: null,
      anomalyAlert: { entityType: "tenant", entityId: "t-1", status: "open", classification: "suspicious", metadata: { recommended_filters: {} } },
      selectedEvent: null,
      t,
    });
    expect(details.some((d) => d.label.includes("alertStatus"))).toBe(true);
    expect(details.some((d) => d.value === "suspicious")).toBe(true);
  });

  it("buildInvestigationEntityLinks generates property/tenant links from entityType", () => {
    const links = buildInvestigationEntityLinks({
      hostedEvent: { entity_type: "property", entity_id: "prop-1" },
      anomalyAlert: null,
      selectedEvent: null,
      t,
    });
    expect(links.some((l) => l.to.includes("/properties/prop-1"))).toBe(true);
  });

  it("buildInvestigationEntityLinks respects 6-link cap", () => {
    const metadata = {
      property_id: "p1",
      tenant_id: "t1",
      work_order_id: "w1",
      document_id: "d1",
      maintenance_request_id: "m1",
    };
    const links = buildInvestigationEntityLinks({
      hostedEvent: { entity_type: "payment", entity_id: "pay-1", surface: "finance" },
      anomalyAlert: null,
      selectedEvent: { entity_type: "payment", entity_id: "pay-1", metadata },
      t,
    });
    expect(links.length).toBeLessThanOrEqual(6);
  });

  it("buildInvestigationEntityLinks deduplicates identical links", () => {
    const links = buildInvestigationEntityLinks({
      hostedEvent: { entity_type: "property", entity_id: "p1" },
      anomalyAlert: null,
      selectedEvent: { entity_type: "property", entity_id: "p1", metadata: { property_id: "p1" } },
      t,
    });
    const toSet = new Set(links.map((l) => l.to));
    expect(toSet.size).toBe(links.length);
  });

  it("buildInvestigationTimelineItems sorts events by timestamp descending", () => {
    const items = buildInvestigationTimelineItems({
      hostedEvent: { id: "h1", created_at: "2024-01-01T10:00:00Z", kind: "authorization_denied", surface: "finance", reason: "rls" },
      anomalyAlert: { id: "a1", createdAt: "2024-01-02T10:00:00Z", lastSeenAt: "2024-01-03T10:00:00Z", severity: "urgent", status: "open", title: "Alert", summary: "", metadata: { recommended_filters: {} } },
      selectedEvent: { id: "e1", created_at: "2024-01-04T10:00:00Z", action: "login", entity_type: "property", entity_id: "p1" },
      t,
    });
    expect(items.length).toBe(4);
    expect(items[0].timestamp > items[1].timestamp).toBe(true);
  });

  it("buildInvestigationTimelineItems returns empty array when no timestamps", () => {
    const items = buildInvestigationTimelineItems({ hostedEvent: null, anomalyAlert: null, selectedEvent: null, t });
    expect(items).toEqual([]);
  });

  it("timelineTone returns amber for hosted, rose for anomaly, slate for ledger", () => {
    expect(timelineTone("hosted")).toContain("amber");
    expect(timelineTone("anomaly")).toContain("rose");
    expect(timelineTone("ledger")).toContain("slate");
  });

  it("buildInvestigationContextSummary includes entity/hostedEvent/anomaly/ledger parts", () => {
    const summary = buildInvestigationContextSummary({
      hostedEvent: { entity_type: "property", entity_id: "p1", kind: "authorization_denied" },
      anomalyAlert: { entityType: "property", title: "Alert", metadata: { recommended_filters: { entityId: "p1" } } },
      selectedEvent: { entity_type: "property", entity_id: "p1", action: "update" },
      filters: { entityType: "", entityId: "" },
      t,
    });
    expect(summary).toContain("investigationContext.entity");
    expect(summary).toContain("investigationContext.hostedEvent");
    expect(summary).toContain("investigationContext.anomaly");
    expect(summary).toContain("investigationContext.ledgerEvent");
  });

  it("buildInvestigationContextSummary returns empty string when no context", () => {
    const summary = buildInvestigationContextSummary({
      hostedEvent: null,
      anomalyAlert: null,
      selectedEvent: null,
      filters: { entityType: "", entityId: "" },
      t,
    });
    expect(summary).toBe("");
  });
});
