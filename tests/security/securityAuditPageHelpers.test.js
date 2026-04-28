import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InvestigationContextStrip } from "../../src/pages/security-audit/InvestigationPanel.jsx";
import {
  buildAnomalyFlagContext,
  buildAnomalyEmptyGuidance,
  buildHostedEventsEmptyGuidance,
  buildInvestigationEntityContext,
  buildInvestigationEntityLinks,
  buildInvestigationTimelineItems,
} from "../../src/pages/security-audit/investigationHelpers.js";
import { buildSearchParams } from "../../src/pages/security-audit/utils.js";
import {
  findRelatedAnomalyAlertForHostedEvent,
  findRelatedHostedEventForAnomalyAlert,
} from "../../src/pages/security-audit/hostedEventHelpers.js";

describe("security audit page helpers", () => {
  it("includes focused alert and hosted event ids in shareable search params", () => {
    const params = buildSearchParams(
      {
        dateFrom: "2026-03-01",
        dateTo: "2026-03-28",
        action: "document.delete",
        actorUserId: "user-1",
        entityType: "maintenance_request",
        entityId: "req-1",
      },
      2,
      "ledger-event-1",
      "acknowledged",
      "alert-1",
      "hosted-1",
    );

    expect(params.get("from")).toBe("2026-03-01");
    expect(params.get("to")).toBe("2026-03-28");
    expect(params.get("action")).toBe("document.delete");
    expect(params.get("actor")).toBe("user-1");
    expect(params.get("entityType")).toBe("maintenance_request");
    expect(params.get("entityId")).toBe("req-1");
    expect(params.get("page")).toBe("2");
    expect(params.get("event")).toBe("ledger-event-1");
    expect(params.get("alertStatus")).toBe("acknowledged");
    expect(params.get("alert")).toBe("alert-1");
    expect(params.get("hosted")).toBe("hosted-1");
  });

  it("matches a hosted event to a related anomaly alert by entity scope or latest event id", () => {
    const hostedEvent = {
      id: "hosted-1",
      entity_type: "maintenance_request",
      entity_id: "req-1",
    };

    const related = findRelatedAnomalyAlertForHostedEvent(hostedEvent, [
      {
        id: "alert-1",
        entityType: "maintenance_request",
        metadata: {
          recommended_filters: {
            entityType: "maintenance_request",
            entityId: "req-1",
          },
        },
      },
      {
        id: "alert-2",
        entityType: "document",
        metadata: {
          latest_event_id: "hosted-9",
          recommended_filters: {
            entityType: "document",
            entityId: "doc-1",
          },
        },
      },
    ]);

    expect(related?.id).toBe("alert-1");
  });

  it("matches an anomaly alert back to a related hosted event", () => {
    const alert = {
      id: "alert-1",
      entityType: "maintenance_request",
      metadata: {
        recommended_filters: {
          entityType: "maintenance_request",
          entityId: "req-1",
        },
      },
    };

    const related = findRelatedHostedEventForAnomalyAlert(alert, [
      {
        id: "hosted-1",
        entity_type: "maintenance_request",
        entity_id: "req-1",
      },
      {
        id: "hosted-2",
        entity_type: "document",
        entity_id: "doc-1",
      },
    ]);

    expect(related?.id).toBe("hosted-1");
  });

  it("renders the investigation context strip with summary and badges", () => {
    const html = renderToStaticMarkup(
      React.createElement(InvestigationContextStrip, {
        summary: "Entity: Maintenance Request (req-1) • Hosted event: Authorization denied",
        focusedHostedEvent: { kind: "authorization_denied", guard_denied: true },
        focusedAnomalyAlert: { severity: "urgent" },
        selectedEvent: { action: "maintenance.request.update" },
        onClear: () => {},
        t: (key, params = {}) =>
          ({
            "securityAudit.investigationContext.title": "Current investigation context",
            "securityAudit.investigationContext.empty": "No investigation context is selected yet.",
            "securityAudit.investigationContext.badgeAnomaly": `Alert: ${params.severity ?? ""}`,
            "securityAudit.investigationContext.badgeLedger": "Ledger",
            "securityAudit.investigationContext.clear": "Clear context",
            "securityAudit.severity.urgent": "Urgent",
            "securityAudit.severity.action": "Action",
            "securityAudit.severity.info": "Info",
          }[key] || key),
      }),
    );

    expect(html).toContain("Current investigation context");
    expect(html).toContain("Entity: Maintenance Request");
    expect(html).toContain("Urgent");
    expect(html).toContain("Alert: urgent");
    expect(html).toContain("Ledger");
    expect(html).toContain("Clear context");
  });

  it("builds a human-friendly anomaly flag context summary", () => {
    const summary = buildAnomalyFlagContext(
      {
        entityType: "maintenance_request",
        entityId: "req-12345678",
        actorLabel: "Tenant A1",
        alertCount: 4,
        lastSeenAt: "2026-03-28T10:00:00.000Z",
        metadata: {
          recommended_filters: {
            action: "document.delete",
          },
        },
      },
      (key, params = {}) =>
        ({
          "securityAudit.anomaly.flagContext.entity": `Scope: ${params.entityType} (${params.entityId})`,
          "securityAudit.anomaly.flagContext.repeatCount": `Repeats: ${params.count}`,
          "securityAudit.anomaly.flagContext.action": `Action: ${params.action}`,
          "securityAudit.anomaly.flagContext.actor": `Actor: ${params.actor}`,
          "securityAudit.anomaly.flagContext.lastSeen": `Last seen: ${params.timestamp}`,
        }[key] || key),
    );

    expect(summary).toContain("Scope: Maintenance Request");
    expect(summary).toContain("Repeats: 4");
    expect(summary).toContain("Action: document.delete");
    expect(summary).toContain("Actor: Tenant A1");
    expect(summary).toContain("Last seen:");
  });

  it("builds an ordered investigation timeline from hosted, anomaly, and ledger signals", () => {
    const items = buildInvestigationTimelineItems({
      hostedEvent: {
        id: "hosted-1",
        kind: "authorization_denied",
        surface: "command_center",
        reason: "guard_denied",
        created_at: "2026-03-28T12:00:00.000Z",
      },
      anomalyAlert: {
        id: "alert-1",
        title: "Repeated denial pattern",
        summary: "Multiple denials were detected for the same entity.",
        severity: "urgent",
        status: "open",
        entityType: "maintenance_request",
        entityId: "req-1",
        alertCount: 3,
        createdAt: "2026-03-28T11:00:00.000Z",
        lastSeenAt: "2026-03-28T13:00:00.000Z",
        metadata: {},
      },
      selectedEvent: {
        id: "ledger-1",
        action: "document.delete",
        entity_type: "document",
        entity_id: "doc-1",
        created_at: "2026-03-28T10:00:00.000Z",
      },
      t: (key) =>
        ({
          "securityAudit.timeline.hostedEvent": "Hosted event detected",
          "securityAudit.timeline.anomalyOpened": "Anomaly alert opened",
          "securityAudit.timeline.anomalyLastSeen": "Pattern repeated",
          "securityAudit.timeline.ledgerEvent": "Ledger event recorded",
          "securityAudit.investigationContext.badgeLedger": "Ledger",
          "securityAudit.severity.urgent": "Urgent",
          "securityAudit.alertStatus.open": "Open",
          "securityAudit.hostedEvents.summary.unknownSurface": "Unknown surface",
          "securityAudit.hostedEvents.summary.unknownEntity": "Unknown entity",
          "securityAudit.hostedEvents.kind.authorizationDenied": "Authorization denied",
          "securityAudit.hostedEvents.surface.commandCenter": "Command Center",
          "securityAudit.hostedEvents.reason.guardDenied": "Guard denial",
        }[key] || key),
    });

    expect(items).toHaveLength(4);
    expect(items[0].title).toBe("Pattern repeated");
    expect(items[1].title).toBe("Hosted event detected");
    expect(items[2].title).toBe("Anomaly alert opened");
    expect(items[3].title).toBe("Ledger event recorded");
  });

  it("builds hosted-event empty guidance for quiet and filtered states", () => {
    const t = (key) =>
      ({
        "securityAudit.hostedEvents.emptyGuidance.filteredTitle": "Filtered",
        "securityAudit.hostedEvents.emptyGuidance.filteredBody": "Widen filters",
        "securityAudit.hostedEvents.emptyGuidance.quietTitle": "Quiet",
        "securityAudit.hostedEvents.emptyGuidance.quietBody": "No backend denials yet",
        "securityAudit.hostedEvents.emptyGuidance.checkFilters": "Clear filters",
        "securityAudit.hostedEvents.emptyGuidance.checkLimit": "Increase limit",
        "securityAudit.hostedEvents.emptyGuidance.tryNotificationDenial": "Trigger notification denial",
        "securityAudit.hostedEvents.emptyGuidance.tryStorageDenial": "Trigger storage denial",
        "securityAudit.hostedEvents.emptyGuidance.tryScopeDenial": "Trigger scope denial",
      }[key] || key);

    const filtered = buildHostedEventsEmptyGuidance({ kind: "authorization_denied" }, t);
    const quiet = buildHostedEventsEmptyGuidance({}, t);

    expect(filtered.title).toBe("Filtered");
    expect(filtered.checks).toContain("Clear filters");
    expect(quiet.title).toBe("Quiet");
    expect(quiet.checks).toContain("Trigger notification denial");
  });

  it("builds anomaly empty guidance with reproducible checks", () => {
    const guidance = buildAnomalyEmptyGuidance((key) =>
      ({
        "securityAudit.anomaliesEmptyGuidance.title": "No threshold crossed",
        "securityAudit.anomaliesEmptyGuidance.body": "Thresholds not breached",
        "securityAudit.anomaliesEmptyGuidance.checkThresholds": "Check thresholds",
        "securityAudit.anomaliesEmptyGuidance.tryDeletePattern": "Try delete pattern",
        "securityAudit.anomaliesEmptyGuidance.tryRolePattern": "Try role pattern",
      }[key] || key),
    );

    expect(guidance.title).toBe("No threshold crossed");
    expect(guidance.checks).toEqual(["Check thresholds", "Try delete pattern", "Try role pattern"]);
  });

  it("builds a compact entity context from focused signals", () => {
    const details = buildInvestigationEntityContext({
      hostedEvent: {
        entity_type: "maintenance_request",
        entity_id: "req-1",
        surface: "command_center",
        reason: "guard_denied",
        correlation_id: "corr-12345678",
      },
      anomalyAlert: {
        entityLabel: "Leaking tap",
        actorLabel: "Tenant A1",
        status: "open",
        classification: "suspicious",
      },
      selectedEvent: {
        action: "maintenance.request.update",
      },
      t: (key) =>
        ({
          "securityAudit.entityContext.entity": "Entity",
          "securityAudit.entityContext.label": "Label",
          "securityAudit.columns.actor": "Actor",
          "securityAudit.entityContext.surface": "Surface",
          "securityAudit.detail.reason": "Reason",
          "securityAudit.entityContext.correlation": "Correlation",
          "securityAudit.entityContext.alertStatus": "Alert status",
          "securityAudit.alert.classification": "Classification",
          "securityAudit.entityContext.latestLedgerAction": "Latest ledger action",
          "securityAudit.hostedEvents.surface.commandCenter": "Command Center",
          "securityAudit.hostedEvents.reason.guardDenied": "Guard denial",
          "securityAudit.systemActor": "System",
        }[key] || key),
    });

    expect(details.find((item) => item.label === "Entity")?.value).toContain("Maintenance Request");
    expect(details.find((item) => item.label === "Label")?.value).toBe("Leaking tap");
    expect(details.find((item) => item.label === "Actor")?.value).toBe("Tenant A1");
    expect(details.find((item) => item.label === "Surface")?.value).toBe("Command Center");
    expect(details.find((item) => item.label === "Alert status")?.value).toBe("open");
    expect(details.find((item) => item.label === "Latest ledger action")?.value).toBe("maintenance.request.update");
  });

  it("builds related investigation links from focused entity and metadata", () => {
    const links = buildInvestigationEntityLinks({
      hostedEvent: {
        entity_type: "document",
        entity_id: "doc-1",
        surface: "documents",
      },
      anomalyAlert: {
        entityType: "document",
        entityLabel: "Lease agreement",
      },
      selectedEvent: {
        metadata: {
          property_id: "prop-1",
          property_label: "11 Starlight Avenue",
          tenant_id: "tenant-1",
          tenant_label: "Tenant A1",
          work_order_id: "wo-1",
          work_order_label: "Leaking tap",
        },
      },
      t: (key, params = {}) =>
        ({
          "securityAudit.relatedLinks.named": `${params.label}: ${params.detail}`,
          "securityAudit.relatedLinks.document": "Open document",
          "securityAudit.relatedLinks.documents": "Open documents",
          "securityAudit.relatedLinks.property": "Open property",
          "securityAudit.relatedLinks.tenant": "Open tenant",
          "securityAudit.relatedLinks.workOrder": "Open work order",
          "securityAudit.relatedLinks.maintenance": "Open maintenance inbox",
          "securityAudit.relatedLinks.finance": "Open finance",
          "securityAudit.relatedLinks.invitations": "Open invitations",
        }[key] || key),
    });

    expect(links).toEqual(
      expect.arrayContaining([
        { label: "Open document: Lease agreement", to: "/documents?doc=doc-1" },
        { label: "Open property: 11 Starlight Avenue", to: "/properties/prop-1" },
        { label: "Open tenant: Tenant A1", to: "/tenants/tenant-1" },
        { label: "Open work order: Leaking tap", to: "/work-orders/wo-1" },
      ]),
    );
  });
});
