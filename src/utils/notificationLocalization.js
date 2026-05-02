function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function translateMaintenanceStatusLabel(label, t) {
  const key = normalize(label);
  if (["open", "otwarte"].includes(key)) return t("maintenance.status.open");
  if (["in_progress", "in progress", "w trakcie"].includes(key)) return t("maintenance.status.inProgress");
  if (["waiting", "oczekujące", "oczekujace"].includes(key)) return t("maintenance.status.waiting");
  if (["resolved", "rozwiązane", "rozwiazane"].includes(key)) return t("maintenance.status.resolved");
  if (["closed", "zamknięte", "zamkniete"].includes(key)) return t("maintenance.status.closed");
  return String(label || "").trim();
}

function translateWorkOrderStatusLabel(label, t) {
  const key = normalize(label);
  if (["assigned", "przypisane"].includes(key)) return t("status.wo.assigned");
  if (["in_progress", "in progress", "w trakcie"].includes(key)) return t("status.wo.in_progress");
  if (["completed", "zakończone", "zakonczone"].includes(key)) return t("status.wo.completed");
  if (["cancelled", "anulowane"].includes(key)) return t("status.wo.cancelled");
  if (["blocked", "zablokowane"].includes(key)) return t("workOrder.blocked");
  return String(label || "").trim();
}

function parseStatusChangeBody(body = "") {
  const value = String(body || "").trim();
  if (!value) return { status: "", oldStatus: "" };

  let match = value.match(/^Status:\s*(.+?)\s*\(poprzednio:\s*(.+?)\)\s*$/i);
  if (match) {
    return { status: match[1] || "", oldStatus: match[2] || "" };
  }

  match = value.match(/^Status:\s*(.+?)\s*\(previously:\s*(.+?)\)\s*$/i);
  if (match) {
    return { status: match[1] || "", oldStatus: match[2] || "" };
  }

  match = value.match(/^Nowy status:\s*(.+?)\s*$/i);
  if (match) {
    return { status: match[1] || "", oldStatus: "" };
  }

  match = value.match(/^New status:\s*(.+?)\s*$/i);
  if (match) {
    return { status: match[1] || "", oldStatus: "" };
  }

  return { status: "", oldStatus: "" };
}

function parseMaintenanceStatusBody(body = "") {
  const value = String(body || "").trim();
  if (!value) return { title: "", status: "", oldStatus: "" };

  let match = value.match(/^(.+?):\s*(.+?)\s*→\s*(.+?)\s*$/i);
  if (match) {
    return { title: match[1] || "", oldStatus: match[2] || "", status: match[3] || "" };
  }

  match = value.match(/^Status:\s*(.+?)\s*→\s*(.+?)\s*$/i);
  if (match) {
    return { title: "", oldStatus: match[1] || "", status: match[2] || "" };
  }

  return { title: "", status: "", oldStatus: "" };
}

export function localizeNotificationContent(input, t) {
  const type = normalize(input?.type);
  const title = String(input?.title || "").trim();
  const body = String(input?.body || "").trim();
  const metadata = input?.metadata || {};

  const normalizedTitle = normalize(title);

  const isWorkOrderCreated =
    type === "work_order_created" ||
    normalizedTitle === "nowe zlecenie utworzone" ||
    normalizedTitle === "new work order created";

  if (isWorkOrderCreated) {
    return {
      title: t("notifications.event.workOrderCreated.title"),
      body: t("notifications.event.workOrderCreated.body"),
    };
  }

  const isWorkOrderAssigned =
    type === "work_order_assigned" ||
    normalizedTitle === "masz nowe zlecenie" ||
    normalizedTitle === "you have a new work order";

  if (isWorkOrderAssigned) {
    return {
      title: t("notifications.event.workOrderAssigned.title"),
      body: t("notifications.event.workOrderAssigned.body"),
    };
  }

  const isWorkOrderStatusChanged =
    type === "work_order_status_changed" ||
    normalizedTitle === "zmieniono status zlecenia" ||
    normalizedTitle === "status zlecenia zmieniony" ||
    normalizedTitle === "work order status changed";

  if (isWorkOrderStatusChanged) {
    const derivedStatus = metadata?.new_status_label || metadata?.status_label || metadata?.new_status || metadata?.to_status || "";
    const derivedOldStatus = metadata?.old_status_label || metadata?.old_status || metadata?.from_status || "";
    const parsed = parseStatusChangeBody(body);
    const nextStatus = translateWorkOrderStatusLabel(derivedStatus || parsed.status, t);
    const previousStatus = translateWorkOrderStatusLabel(derivedOldStatus || parsed.oldStatus, t);

    return {
      title: t("notifications.event.workOrderStatusChanged.title"),
      body: previousStatus
        ? t("notifications.event.workOrderStatusChanged.bodyWithPrevious", {
            status: nextStatus || t("common.status"),
            oldStatus: previousStatus,
          })
        : t("notifications.event.workOrderStatusChanged.body", {
            status: nextStatus || t("common.status"),
          }),
    };
  }

  const isMaintenanceRequestCreated =
    type === "maintenance_request_created" ||
    normalizedTitle === "nowe zgłoszenie serwisowe" ||
    normalizedTitle === "new maintenance request";

  if (isMaintenanceRequestCreated) {
    const titleFromBody = body.match(/^Zgłoszenie:\s*(.+?)\s*$/i)?.[1]
      || body.match(/^Request:\s*(.+?)\s*$/i)?.[1]
      || "";
    return {
      title: t("notifications.event.maintenanceRequestCreated.title"),
      body: titleFromBody
        ? t("notifications.event.maintenanceRequestCreated.bodyWithTitle", { title: titleFromBody })
        : t("notifications.event.maintenanceRequestCreated.body"),
    };
  }

  const isMaintenanceStatusChanged =
    type === "maintenance_status_changed" ||
    normalizedTitle === "zmiana statusu zgłoszenia" ||
    normalizedTitle === "maintenance request status changed";

  if (isMaintenanceStatusChanged) {
    const parsed = parseMaintenanceStatusBody(body);
    const nextStatus = translateMaintenanceStatusLabel(metadata?.to_status || parsed.status, t);
    const previousStatus = translateMaintenanceStatusLabel(metadata?.from_status || parsed.oldStatus, t);
    const requestTitle = parsed.title || metadata?.request_title || metadata?.title || "";
    return {
      title: t("notifications.event.maintenanceStatusChanged.title"),
      body: requestTitle
        ? t("notifications.event.maintenanceStatusChanged.bodyWithTitle", {
            title: requestTitle,
            status: nextStatus || t("common.status"),
            oldStatus: previousStatus || t("common.status"),
          })
        : t("notifications.event.maintenanceStatusChanged.body", {
            status: nextStatus || t("common.status"),
            oldStatus: previousStatus || t("common.status"),
          }),
    };
  }

  const isMaintenanceRequestInProgress =
    type === "maintenance_request_in_progress" ||
    normalizedTitle === "twoje zgłoszenie jest realizowane" ||
    normalizedTitle === "your request is in progress";

  if (isMaintenanceRequestInProgress) {
    const titleFromBody = body.match(/^Zgłoszenie\s+"(.+?)"\s+jest obecnie w trakcie realizacji\.\s*$/i)?.[1]
      || body.match(/^Request\s+"(.+?)"\s+is currently in progress\.\s*$/i)?.[1]
      || "";
    return {
      title: t("notifications.event.maintenanceRequestInProgress.title"),
      body: titleFromBody
        ? t("notifications.event.maintenanceRequestInProgress.bodyWithTitle", { title: titleFromBody })
        : t("notifications.event.maintenanceRequestInProgress.body"),
    };
  }

  const isMaintenanceAttachmentUploaded =
    type === "maintenance_attachment_uploaded" ||
    normalizedTitle === "dodano załącznik do zgłoszenia" ||
    normalizedTitle === "attachment added to request";

  if (isMaintenanceAttachmentUploaded) {
    const countMatch = body.match(/^Dodano\s+(\d+)\s+plików\s*$/i) || body.match(/^Added\s+(\d+)\s+files\s*$/i);
    const fileMatch = body.match(/^Dodano plik:\s*(.+?)\s*$/i) || body.match(/^Added file:\s*(.+?)\s*$/i);
    return {
      title: t("notifications.event.maintenanceAttachmentUploaded.title"),
      body: countMatch
        ? t("notifications.event.maintenanceAttachmentUploaded.bodyMany", { count: Number(countMatch[1] || 0) })
        : fileMatch
          ? t("notifications.event.maintenanceAttachmentUploaded.bodyOne", { filename: fileMatch[1] || t("attachments.document").toLowerCase() })
          : t("notifications.event.maintenanceAttachmentUploaded.body"),
    };
  }

  return { title, body };
}
