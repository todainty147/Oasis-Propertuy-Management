// src/services/maintenanceService.js
import { supabase } from "../lib/supabase";
import { createNotifications } from "./notificationService";
import { recordAutomationExecution } from "./automationExecutionService";
import {
  assertMaxLength,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

/* ======================
   VALIDATION (AUTHORITATIVE)
   ====================== */

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

// ✅ Must match DB constraint maintenance_status_check
const STATUSES = new Set(["open", "in_progress", "waiting", "resolved", "closed"]);
const WAITING_REASONS = new Set([
  "tenant_response",
  "contractor_schedule",
  "parts_ordered",
  "landlord_approval",
]);

function assertPriority(priority) {
  if (priority === undefined) return;
  if (!PRIORITIES.has(priority)) {
    throw new Error(`Nieprawidłowy priorytet: ${priority}`);
  }
}

function assertStatus(status) {
  if (status === undefined) return;
  if (!STATUSES.has(status)) {
    throw new Error(`Nieprawidłowy status: ${status}`);
  }
}

function assertWaitingReason(waitingReason) {
  if (waitingReason === undefined) return;
  if (waitingReason === null) return;
  if (!WAITING_REASONS.has(waitingReason)) {
    throw new Error(`Nieprawidłowy waiting_reason: ${waitingReason}`);
  }
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id || null;
}

async function getManagerUserIds(accountId, { excludeUserId } = {}) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId);
  if (error) throw error;

  const blockedRoles = new Set(["tenant", "contractor"]);
  return Array.from(
    new Set(
      (data || [])
        .filter((r) => !blockedRoles.has(String(r?.role || "").toLowerCase()))
        .map((r) => r.user_id)
        .filter((id) => id && id !== excludeUserId)
    )
  );
}

async function getTenantUserIdByTenantRowId(tenantRowId) {
  if (!tenantRowId) return null;
  const { data, error } = await supabase
    .from("tenants")
    .select("user_id")
    .eq("id", tenantRowId)
    .maybeSingle();
  if (error) return null;
  return data?.user_id || null;
}

/* ======================
   CREATE
   ====================== */

export async function createMaintenanceRequest({
  accountId,
  propertyId,
  reportedByTenantId, // 👈 remove default = null (important)
  title,
  description = null,
  priority = "normal",
}) {
  assertRequiredText(accountId, "Missing accountId");
  assertRequiredText(propertyId, "Missing propertyId");
  assertRequiredText(title, "Title required");
  assertMaxLength(title, 200, "Title is too long");
  assertMaxLength(description, 5000, "Description is too long");

  assertPriority(priority);

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    title: normalizeText(title),
    description: normalizeText(description) || null,
    priority,
    status: "open",
  };

  // ✅ only set it if we actually have a value
  if (reportedByTenantId) {
    payload.reported_by_tenant_id = reportedByTenantId;
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert(payload)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się utworzyć zgłoszenia");

  try {
    const actorId = await getCurrentUserId();
    const recipients = await getManagerUserIds(accountId, { excludeUserId: actorId });
    await createNotifications({
      accountId,
      recipientUserIds: recipients,
      type: "maintenance_request_created",
      title: "Nowe zgłoszenie serwisowe",
      body: data?.title ? `Zgłoszenie: ${data.title}` : "Utworzono nowe zgłoszenie",
      entityType: "maintenance_request",
      entityId: data?.id || null,
      linkPath: "/maintenance-inbox",
      metadata: {
        maintenance_request_id: data?.id || null,
        property_id: propertyId,
      },
    });
  } catch (notifyErr) {
    console.warn("[notifications] maintenance_request_created failed", notifyErr);
  }

  if (!reportedByTenantId) {
    try {
      await recordAutomationExecution({
        accountId,
        ruleId: "maintenance_triage",
        eventKey: `maintenance_request:${data?.id}`,
        entityType: "maintenance_request",
        entityId: data?.id || null,
        title: data?.title || "Maintenance request awaiting review",
        details: {
          property_id: propertyId,
          tenant_id: reportedByTenantId || null,
        },
      });
    } catch (automationErr) {
      console.warn("[automation] maintenance_triage log failed", automationErr);
    }
  }

  return data;
}


/* ======================
   UPDATE (validated + safe patch)
   ====================== */

export async function updateMaintenanceRequest(id, patch = {}) {
  if (!id) throw new Error("Brak ID zgłoszenia");
  if (!patch || typeof patch !== "object") throw new Error("Nieprawidłowy patch");

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("maintenance_requests")
    .select("id, account_id, title, status, reported_by_tenant_id")
    .eq("id", id)
    .single();
  if (beforeErr) throw friendlyError(beforeErr, "Nie udało się odczytać zgłoszenia");

  // ✅ Validate before send
  assertPriority(patch.priority);
  assertStatus(patch.status);
  assertWaitingReason(patch.waiting_reason);

  // ✅ Only include fields that were actually provided (prevents accidental nulling)
  const allowed = {};

  if (patch.title !== undefined) {
    assertRequiredText(patch.title, "Title required");
    assertMaxLength(patch.title, 200, "Title is too long");
    allowed.title = normalizeText(patch.title);
  }
  if (patch.description !== undefined)
    allowed.description = (() => {
      assertMaxLength(patch.description, 5000, "Description is too long");
      return normalizeText(patch.description) || null;
    })();
  if (patch.priority !== undefined) allowed.priority = patch.priority;
  if (patch.status !== undefined) allowed.status = patch.status;
  if (patch.waiting_reason !== undefined) allowed.waiting_reason = patch.waiting_reason;

  // If nothing to update
  if (Object.keys(allowed).length === 0) {
    throw new Error("Brak zmian do zapisania");
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się zaktualizować zgłoszenia");

  try {
    const prev = String(beforeRow?.status || "").toLowerCase();
    const next = String(data?.status || beforeRow?.status || "").toLowerCase();
    const actorId = await getCurrentUserId();
    const accountId = beforeRow?.account_id || data?.account_id;
    if (accountId && prev !== next) {
      const managerRecipients = await getManagerUserIds(accountId, { excludeUserId: actorId });
      const tenantUserId = await getTenantUserIdByTenantRowId(beforeRow?.reported_by_tenant_id);
      const tenantRecipients = tenantUserId && tenantUserId !== actorId ? [tenantUserId] : [];

      const body = beforeRow?.title
        ? `${beforeRow.title}: ${prev || "—"} → ${next || "—"}`
        : `Status: ${prev || "—"} → ${next || "—"}`;

      if (next === "in_progress" || next === "waiting" || next === "resolved" || next === "closed") {
        await createNotifications({
          accountId,
          recipientUserIds: Array.from(new Set([...managerRecipients, ...tenantRecipients])),
          type: "maintenance_status_changed",
          title: "Zmiana statusu zgłoszenia",
          body,
          entityType: "maintenance_request",
          entityId: id,
          linkPath: "/maintenance-inbox",
          metadata: {
            maintenance_request_id: id,
            from_status: prev,
            to_status: next,
          },
        });
      }

      if (next === "in_progress" && tenantRecipients.length > 0) {
        await createNotifications({
          accountId,
          recipientUserIds: tenantRecipients,
          type: "maintenance_request_in_progress",
          title: "Twoje zgłoszenie jest realizowane",
          body: beforeRow?.title
            ? `Zgłoszenie "${beforeRow.title}" jest obecnie w trakcie realizacji.`
            : "Twoje zgłoszenie jest obecnie w trakcie realizacji.",
          entityType: "maintenance_request",
          entityId: id,
          linkPath: "/dashboard",
          metadata: {
            maintenance_request_id: id,
            status: next,
          },
        });
      }
    }
  } catch (notifyErr) {
    console.warn("[notifications] maintenance_status_changed failed", notifyErr);
  }

  return data;
}

/* ======================
   DELETE
   ====================== */

export async function deleteMaintenanceRequest(id) {
  if (!id) throw new Error("Brak ID zgłoszenia");

  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", id);

  if (error) throw friendlyError(error, "Nie udało się usunąć zgłoszenia");
}
