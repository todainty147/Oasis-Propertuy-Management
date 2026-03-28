import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  InvestigationContextStrip,
  buildSearchParams,
  findRelatedAnomalyAlertForHostedEvent,
  findRelatedHostedEventForAnomalyAlert,
} from "../../src/pages/SecurityAuditPage.jsx";

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
});
