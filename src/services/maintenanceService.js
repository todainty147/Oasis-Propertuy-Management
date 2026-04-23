// src/services/maintenanceService.js
import { supabase } from "../lib/supabase";
import { createNotifications } from "./notificationService";
import { recordAutomationExecution } from "./automationExecutionService";
import {
  assertMaxLength,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";
import {
  parseMaintenanceRequestRow,
  parseRpcRows,
  parseMaintenanceExpenseRow,
  parseTenantIssueRow,
  parseWorkOrderRow,
} from "./rpcContracts";
import { fetchWorkOrders } from "./workOrderService";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function listMaintenanceRequestsByProperty({
  accountId,
  propertyId,
  page = 1,
  pageSize = 20,
} = {}) {
  if (!accountId || !propertyId) {
    return {
      data: [],
      count: 0,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Math.min(200, Number(pageSize) || 20)),
    };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error, count } = await supabase
    .from("maintenance_requests")
    .select(
      "id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, created_at, updated_at",
      { count: "exact" },
    )
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw friendlyError(error, "Nie udało się załadować zgłoszeń");

  return {
    data: parseRpcRows(data || [], parseMaintenanceRequestRow, "maintenance request rows"),
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function listLinkedWorkOrdersForRequests({
  accountId,
  propertyId,
  requests,
} = {}) {
  const requestIds = (requests ?? []).map((row) => row.id).filter(Boolean);
  if (!accountId || !propertyId || requestIds.length === 0) return {};

  const workOrders = await fetchWorkOrders({
    accountId,
    propertyId,
    page: 1,
    pageSize: Math.max(20, requestIds.length * 10),
  });

  const grouped = {};
  for (const workOrder of workOrders.data ?? []) {
    const key = workOrder.maintenance_request_id;
    if (!key || !requestIds.includes(key)) continue;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(workOrder);
  }

  return grouped;
}

export async function listMaintenanceExpensesByProperty({
  accountId,
  propertyId,
  limit = 120,
} = {}) {
  if (!accountId || !propertyId) return [];

  const { data, error } = await supabase
    .from("maintenance_expenses")
    .select("id, account_id, property_id, amount, approval_state, expense_date, posted_at, created_at, updated_at")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("expense_date", { ascending: false })
    .limit(limit);

  if (error) throw friendlyError(error, "Nie udało się załadować kosztów utrzymania");
  return parseRpcRows(data || [], parseMaintenanceExpenseRow, "maintenance expense rows");
}

export async function resolveTenantReporterId({
  accountId,
  propertyId,
  userId,
} = {}) {
  if (!accountId || !propertyId || !userId) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw friendlyError(error, "Nie udało się ustalić tenant scope");
  return data?.id || null;
}

export async function getTenantMaintenanceDashboardData({
  accountId,
  propertyId = null,
  limit = 5,
} = {}) {
  if (!accountId) {
    return {
      requests: [],
      workOrders: [],
    };
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw friendlyError(userErr, "Nie udało się ustalić użytkownika");
  if (!user?.id) return { requests: [], workOrders: [] };

  const issueRows = await listTenantIssueRows({
    accountId,
    propertyId,
    limit,
  });

  const requests = issueRows.map((row) => ({
    id: row.maintenance_request_id,
    account_id: row.account_id,
    property_id: row.property_id,
    reported_by_tenant_id: null,
    title: row.title,
    description: "",
    priority: row.priority,
    status: row.maintenance_status,
    created_at: row.created_at,
    updated_at: row.created_at,
  }));

  const latestWorkOrderIds = issueRows
    .map((row) => row.latest_work_order_id)
    .filter(Boolean);

  let workOrders = [];
  if (latestWorkOrderIds.length > 0) {
    const { data, error } = await supabase
      .from("work_orders_with_flags")
      .select(
        "id, account_id, property_id, maintenance_request_id, contractor_user_id, contractor_name, contractor_phone, status, scheduled_at, notes, quote_amount, invoice_amount, created_by, created_at, updated_at, pending_cancel_request, last_cancel_request_at, last_cancel_request_by, last_cancel_resolution_at, last_cancel_resolution_action, last_cancel_resolution_by",
      )
      .in("id", latestWorkOrderIds)
      .order("created_at", { ascending: false });

    if (error) throw friendlyError(error, "Nie udało się załadować zleceń tenant");
    workOrders = parseRpcRows(
      data || [],
      parseWorkOrderRow,
      "tenant maintenance dashboard work order rows",
    );
  }

  if (workOrders.length === 0) {
    workOrders = issueRows
      .filter((row) => row.latest_work_order_id)
      .map((row) => ({
        id: row.latest_work_order_id,
        account_id: row.account_id,
        property_id: row.property_id,
        maintenance_request_id: row.maintenance_request_id,
        contractor_user_id: null,
        contractor_name: "",
        contractor_phone: "",
        status: row.latest_work_order_status,
        scheduled_at: null,
        notes: "",
        quote_amount: null,
        invoice_amount: null,
        created_by: null,
        created_at: row.created_at,
        updated_at: row.created_at,
        pending_cancel_request: false,
        last_cancel_request_at: null,
        last_cancel_request_by: null,
        last_cancel_resolution_at: null,
        last_cancel_resolution_action: null,
        last_cancel_resolution_by: null,
        assigned_at: null,
        acknowledged_at: null,
        acknowledgement_due_at: null,
        acknowledgement_status: "",
      }));
  }

  return { requests, workOrders };
}

export async function listTenantIssueRows({
  accountId,
  propertyId = null,
  limit = 20,
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("tenant_my_issues")
    .select(
      "maintenance_request_id, account_id, property_id, title, maintenance_status, priority, created_at, latest_work_order_status, latest_work_order_id",
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) throw friendlyError(error, "Nie udało się załadować usterek tenant");
  return parseRpcRows(data || [], parseTenantIssueRow, "tenant issue rows");
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
