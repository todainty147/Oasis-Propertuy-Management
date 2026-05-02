import { describe, expect, it } from "vitest";

import { localizeNotificationContent } from "../../src/utils/notificationLocalization.js";

const translations = {
  "status.wo.assigned": "Assigned",
  "status.wo.in_progress": "In progress",
  "status.wo.completed": "Completed",
  "status.wo.cancelled": "Cancelled",
  "workOrder.blocked": "Blocked",
  "maintenance.status.open": "Open",
  "maintenance.status.inProgress": "In progress",
  "maintenance.status.waiting": "Waiting",
  "maintenance.status.resolved": "Resolved",
  "maintenance.status.closed": "Closed",
  "notifications.event.maintenanceRequestCreated.title": "New maintenance request",
  "notifications.event.maintenanceRequestCreated.body": "A new request was created.",
  "notifications.event.maintenanceRequestCreated.bodyWithTitle": "Request: {title}",
  "notifications.event.maintenanceStatusChanged.title": "Maintenance request status changed",
  "notifications.event.maintenanceStatusChanged.body": "Status: {status} (previously: {oldStatus})",
  "notifications.event.maintenanceStatusChanged.bodyWithTitle": "{title}: {status} (previously: {oldStatus})",
  "notifications.event.maintenanceRequestInProgress.title": "Your request is in progress",
  "notifications.event.maintenanceRequestInProgress.body": "Your request is currently in progress.",
  "notifications.event.maintenanceRequestInProgress.bodyWithTitle": "Request \"{title}\" is currently in progress.",
  "notifications.event.maintenanceAttachmentUploaded.title": "Attachment added to request",
  "notifications.event.maintenanceAttachmentUploaded.body": "A new attachment was added.",
  "notifications.event.maintenanceAttachmentUploaded.bodyOne": "Added file: {filename}",
  "notifications.event.maintenanceAttachmentUploaded.bodyMany": "Added {count} files",
};

function t(key, params = {}) {
  const template = translations[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

describe("notification localization", () => {
  it("localizes maintenance request created notifications from stored Polish content", () => {
    const result = localizeNotificationContent({
      type: "maintenance_request_created",
      title: "Nowe zgłoszenie serwisowe",
      body: "Zgłoszenie: Leaking tap",
    }, t);

    expect(result.title).toBe("New maintenance request");
    expect(result.body).toBe("Request: Leaking tap");
  });

  it("localizes maintenance status change notifications using metadata statuses", () => {
    const result = localizeNotificationContent({
      type: "maintenance_status_changed",
      title: "Zmiana statusu zgłoszenia",
      body: "Leaking tap: open → in_progress",
      metadata: {
        from_status: "open",
        to_status: "in_progress",
      },
    }, t);

    expect(result.title).toBe("Maintenance request status changed");
    expect(result.body).toBe("Leaking tap: In progress (previously: Open)");
  });

  it("localizes maintenance attachment notifications from stored Polish content", () => {
    const result = localizeNotificationContent({
      type: "maintenance_attachment_uploaded",
      title: "Dodano załącznik do zgłoszenia",
      body: "Dodano plik: quote.pdf",
    }, t);

    expect(result.title).toBe("Attachment added to request");
    expect(result.body).toBe("Added file: quote.pdf");
  });
});
