import { formatDateTime, shortenId } from "./utils";
import {
  startCase,
  describeHostedEventSurface,
  describeHostedEventReason,
  describeHostedEventKind,
  hostedEventSeverity,
  describeHostedEventSeverity,
} from "./hostedEventHelpers";

function buildTimelineDetail(parts) {
  return parts.filter(Boolean).join(" • ");
}

function hasActiveHostedEventFilters(filters) {
  return Boolean(filters?.category || filters?.kind || filters?.surface);
}

export function buildHostedEventsEmptyGuidance(filters, t) {
  if (hasActiveHostedEventFilters(filters)) {
    return {
      title: t("securityAudit.hostedEvents.emptyGuidance.filteredTitle"),
      body: t("securityAudit.hostedEvents.emptyGuidance.filteredBody"),
      checks: [
        t("securityAudit.hostedEvents.emptyGuidance.checkFilters"),
        t("securityAudit.hostedEvents.emptyGuidance.checkLimit"),
      ],
    };
  }

  return {
    title: t("securityAudit.hostedEvents.emptyGuidance.quietTitle"),
    body: t("securityAudit.hostedEvents.emptyGuidance.quietBody"),
    checks: [
      t("securityAudit.hostedEvents.emptyGuidance.tryNotificationDenial"),
      t("securityAudit.hostedEvents.emptyGuidance.tryStorageDenial"),
      t("securityAudit.hostedEvents.emptyGuidance.tryScopeDenial"),
    ],
  };
}

export function buildAnomalyEmptyGuidance(t) {
  return {
    title: t("securityAudit.anomaliesEmptyGuidance.title"),
    body: t("securityAudit.anomaliesEmptyGuidance.body"),
    checks: [
      t("securityAudit.anomaliesEmptyGuidance.checkThresholds"),
      t("securityAudit.anomaliesEmptyGuidance.tryDeletePattern"),
      t("securityAudit.anomaliesEmptyGuidance.tryRolePattern"),
    ],
  };
}

export function buildAnomalyFlagContext(alert, t) {
  const recommended = alert?.metadata?.recommended_filters || {};
  const entityType = startCase(alert?.entityType || recommended.entityType);
  const entityId = String(alert?.entityId || recommended.entityId || "").trim();
  const actorUserId = String(alert?.actorUserId || recommended.actorUserId || "").trim();
  const actorLabel = String(alert?.actorLabel || "").trim();
  const action = String(recommended.action || "").trim();
  const parts = [];

  if (entityType) {
    parts.push(
      t("securityAudit.anomaly.flagContext.entity", {
        entityType,
        entityId: entityId ? shortenId(entityId) : "—",
      }),
    );
  }
  if (alert?.alertCount > 1) {
    parts.push(t("securityAudit.anomaly.flagContext.repeatCount", { count: String(alert.alertCount) }));
  }
  if (action) {
    parts.push(t("securityAudit.anomaly.flagContext.action", { action }));
  }
  if (actorLabel || actorUserId) {
    parts.push(
      t("securityAudit.anomaly.flagContext.actor", {
        actor: actorLabel || shortenId(actorUserId),
      }),
    );
  }
  if (alert?.lastSeenAt) {
    parts.push(
      t("securityAudit.anomaly.flagContext.lastSeen", {
        timestamp: formatDateTime(alert.lastSeenAt),
      }),
    );
  }

  return parts.filter(Boolean).join(" • ");
}

export function buildAlertWorkflowSummary(alert, t) {
  const parts = [];
  if (alert?.status) {
    parts.push(t("securityAudit.alert.workflowSummary.status", { status: String(alert.status) }));
  }
  if (alert?.assignedToLabel || alert?.assignedToUserId) {
    parts.push(
      t("securityAudit.alert.workflowSummary.assignee", {
        assignee: alert.assignedToLabel || shortenId(alert.assignedToUserId),
      }),
    );
  }
  if (alert?.classification) {
    parts.push(
      t("securityAudit.alert.workflowSummary.classification", {
        classification: String(alert.classification),
      }),
    );
  }
  return parts.filter(Boolean).join(" • ");
}

export function buildInvestigationEntityContext({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const recommended = anomalyAlert?.metadata?.recommended_filters || {};
  const entityType =
    hostedEvent?.entity_type ||
    anomalyAlert?.entityType ||
    selectedEvent?.entity_type ||
    recommended.entityType ||
    "";
  const entityId =
    hostedEvent?.entity_id ||
    anomalyAlert?.entityId ||
    selectedEvent?.entity_id ||
    recommended.entityId ||
    "";
  const entityLabel =
    anomalyAlert?.entityLabel ||
    selectedEvent?.entityLabel ||
    "";
  const actor =
    anomalyAlert?.actorLabel ||
    anomalyAlert?.actorUserId ||
    selectedEvent?.actorLabel ||
    selectedEvent?.actor_user_id ||
    "";
  const correlationId =
    hostedEvent?.correlation_id ||
    selectedEvent?.metadata?.correlation_id ||
    "";
  const reason =
    hostedEvent?.reason ||
    selectedEvent?.metadata?.reason ||
    selectedEvent?.metadata?.code ||
    "";
  const surface = hostedEvent?.surface || "";
  const details = [
    {
      label: t("securityAudit.entityContext.entity"),
      value: entityType ? `${startCase(entityType)}${entityId ? ` (${shortenId(entityId)})` : ""}` : "—",
    },
    {
      label: t("securityAudit.entityContext.label"),
      value: entityLabel || "—",
    },
    {
      label: t("securityAudit.columns.actor"),
      value: actor || t("securityAudit.systemActor"),
    },
    {
      label: t("securityAudit.entityContext.surface"),
      value: surface ? describeHostedEventSurface(surface, t) : "—",
    },
    {
      label: t("securityAudit.detail.reason"),
      value: reason ? describeHostedEventReason(reason, t) : "—",
    },
    {
      label: t("securityAudit.entityContext.correlation"),
      value: correlationId ? shortenId(correlationId) : "—",
    },
  ];

  if (anomalyAlert) {
    details.push({
      label: t("securityAudit.entityContext.alertStatus"),
      value: anomalyAlert.status || "—",
    });
    details.push({
      label: t("securityAudit.alert.classification"),
      value: anomalyAlert.classification || "—",
    });
  }

  if (selectedEvent?.action) {
    details.push({
      label: t("securityAudit.entityContext.latestLedgerAction"),
      value: selectedEvent.action,
    });
  }

  return details;
}

function pushUniqueLink(links, seen, item) {
  if (!item?.to || !item?.label) return;
  const key = `${item.to}:${item.label}`;
  if (seen.has(key)) return;
  seen.add(key);
  links.push(item);
}

function withLinkDetail(label, detail, t) {
  const nextDetail = String(detail || "").trim();
  if (!nextDetail) return label;
  return t("securityAudit.relatedLinks.named", { label, detail: nextDetail });
}

export function buildInvestigationEntityLinks({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const recommended = anomalyAlert?.metadata?.recommended_filters || {};
  const eventMetadata = selectedEvent?.metadata || {};
  const links = [];
  const seen = new Set();
  const entityType = String(
    hostedEvent?.entity_type ||
      anomalyAlert?.entityType ||
      selectedEvent?.entity_type ||
      recommended.entityType ||
      "",
  )
    .trim()
    .toLowerCase();
  const entityId = String(
    hostedEvent?.entity_id ||
      anomalyAlert?.entityId ||
      selectedEvent?.entity_id ||
      recommended.entityId ||
      "",
  ).trim();
  const entityLabel = String(anomalyAlert?.entityLabel || selectedEvent?.entityLabel || "").trim();
  const propertyLabel = String(eventMetadata.property_label || eventMetadata.property_address || "").trim();
  const tenantLabel = String(eventMetadata.tenant_label || "").trim();
  const workOrderLabel = String(eventMetadata.work_order_label || eventMetadata.contractor_name || "").trim();
  const documentLabel = String(eventMetadata.document_name || "").trim();

  if (entityType === "property" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.property"), entityLabel, t),
      to: `/properties/${entityId}`,
    });
  }
  if (entityType === "tenant" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.tenant"), entityLabel, t),
      to: `/tenants/${entityId}`,
    });
  }
  if (entityType === "work_order" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.workOrder"), entityLabel, t),
      to: `/work-orders/${entityId}`,
    });
  }
  if (entityType === "document" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.document"), entityLabel, t),
      to: `/documents?doc=${entityId}`,
    });
  }
  if (entityType === "account_invitation" || entityType === "account_member") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.invitations"),
      to: "/invitations",
    });
  }
  if (entityType === "payment") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.finance"),
      to: "/finance",
    });
  }
  if (entityType === "maintenance_request") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }

  const propertyId = String(eventMetadata.property_id || "").trim();
  if (propertyId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.property"), propertyLabel, t),
      to: `/properties/${propertyId}`,
    });
  }
  const tenantId = String(eventMetadata.tenant_id || "").trim();
  if (tenantId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.tenant"), tenantLabel, t),
      to: `/tenants/${tenantId}`,
    });
  }
  const workOrderId = String(eventMetadata.work_order_id || eventMetadata.entity_work_order_id || "").trim();
  if (workOrderId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.workOrder"), workOrderLabel, t),
      to: `/work-orders/${workOrderId}`,
    });
  }
  const documentId = String(eventMetadata.document_id || "").trim();
  if (documentId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.document"), documentLabel, t),
      to: `/documents?doc=${documentId}`,
    });
  }
  const maintenanceRequestId = String(eventMetadata.maintenance_request_id || "").trim();
  if (maintenanceRequestId) {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }

  const surface = String(hostedEvent?.surface || "").trim().toLowerCase();
  if (surface === "finance") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.finance"),
      to: "/finance",
    });
  }
  if (["maintenance", "command_center", "attention_center"].includes(surface)) {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }
  if (surface === "documents") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.documents"),
      to: "/documents",
    });
  }

  return links.slice(0, 6);
}

export function buildInvestigationTimelineItems({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const items = [];

  if (hostedEvent?.created_at) {
    items.push({
      id: `hosted:${hostedEvent.id || hostedEvent.created_at}`,
      type: "hosted",
      timestamp: hostedEvent.created_at,
      title: t("securityAudit.timeline.hostedEvent"),
      badge: describeHostedEventSeverity(hostedEventSeverity(hostedEvent), t),
      detail: buildTimelineDetail([
        describeHostedEventKind(hostedEvent.kind, t),
        describeHostedEventSurface(hostedEvent.surface, t),
        describeHostedEventReason(hostedEvent.reason, t),
      ]),
    });
  }

  if (anomalyAlert?.createdAt) {
    items.push({
      id: `anomaly-opened:${anomalyAlert.id || anomalyAlert.createdAt}`,
      type: "anomaly",
      timestamp: anomalyAlert.createdAt,
      title: t("securityAudit.timeline.anomalyOpened"),
      badge: t(`securityAudit.severity.${String(anomalyAlert.severity || "info").toLowerCase()}`),
      detail: buildTimelineDetail([anomalyAlert.title, anomalyAlert.summary]),
    });
  }

  if (anomalyAlert?.lastSeenAt) {
    items.push({
      id: `anomaly-last-seen:${anomalyAlert.id || anomalyAlert.lastSeenAt}`,
      type: "anomaly",
      timestamp: anomalyAlert.lastSeenAt,
      title: t("securityAudit.timeline.anomalyLastSeen"),
      badge: t(`securityAudit.alertStatus.${String(anomalyAlert.status || "open").toLowerCase()}`),
      detail: buildAnomalyFlagContext(anomalyAlert, t),
    });
  }

  if (selectedEvent?.created_at) {
    items.push({
      id: `ledger:${selectedEvent.id || selectedEvent.created_at}`,
      type: "ledger",
      timestamp: selectedEvent.created_at,
      title: t("securityAudit.timeline.ledgerEvent"),
      badge: t("securityAudit.investigationContext.badgeLedger"),
      detail: buildTimelineDetail([
        selectedEvent.action || "—",
        startCase(selectedEvent.entity_type) || "",
        selectedEvent.entity_id ? shortenId(selectedEvent.entity_id) : "",
      ]),
    });
  }

  return items
    .filter((item) => item.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

export function timelineTone(type) {
  if (type === "hosted") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (type === "anomaly") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export function buildInvestigationContextSummary({
  hostedEvent,
  anomalyAlert,
  selectedEvent,
  filters,
  t,
}) {
  const entityType =
    hostedEvent?.entity_type ||
    anomalyAlert?.entityType ||
    selectedEvent?.entity_type ||
    filters.entityType ||
    "";
  const entityId =
    hostedEvent?.entity_id ||
    anomalyAlert?.metadata?.recommended_filters?.entityId ||
    selectedEvent?.entity_id ||
    filters.entityId ||
    "";

  const parts = [];

  if (entityType) {
    parts.push(
      t("securityAudit.investigationContext.entity", {
        entityType: startCase(entityType),
        entityId: entityId ? shortenId(entityId) : "—",
      }),
    );
  }
  if (hostedEvent) {
    parts.push(
      t("securityAudit.investigationContext.hostedEvent", {
        kind: describeHostedEventKind(hostedEvent.kind, t),
      }),
    );
  }
  if (anomalyAlert) {
    parts.push(
      t("securityAudit.investigationContext.anomaly", {
        title: anomalyAlert.title || t("securityAudit.anomaliesTitle"),
      }),
    );
  }
  if (selectedEvent) {
    parts.push(
      t("securityAudit.investigationContext.ledgerEvent", {
        action: selectedEvent.action || "—",
      }),
    );
  }

  return parts.join(" • ");
}
