import { supabase } from "../lib/supabase";
import {
  parseAllowedActions,
  parseContractorWorkOrderCardRow,
  parseMaintenanceRequestRow,
  parsePropertyLabelRow,
  parseRpcRows,
  parseWorkOrderFinancialRow,
  parseWorkOrderRow,
} from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function listContractorWorkOrderCards(workOrderIds = null, context = {}) {
  const { data, error } = await supabase.rpc("contractor_work_order_cards", {
    p_work_order_ids: workOrderIds,
  });

  if (error) {
    logSecurityRelevantFailure("contractor_work_order_cards", {
      error,
      context,
    });
    throw friendly(error, "Failed to load contractor work order cards");
  }

  return parseRpcRows(data || [], parseContractorWorkOrderCardRow, "contractor work order cards");
}

export async function getContractorAllowedActions(workOrderId, context = {}) {
  const { data, error } = await supabase.rpc("contractor_allowed_actions", {
    p_work_order_id: workOrderId,
  });

  if (error) {
    logSecurityRelevantFailure("contractor_allowed_actions", {
      error,
      context: { ...context, workOrderId },
    });
    throw friendly(error, "Failed to load contractor allowed actions");
  }

  return parseAllowedActions(data);
}

export async function updateContractorWorkOrder(
  { workOrderId, status = null, notes = null, scheduledAt = null } = {},
  context = {},
) {
  if (!workOrderId) throw new Error("Missing workOrderId");

  const { data, error } = await supabase.rpc("contractor_update_work_order", {
    p_work_order_id: workOrderId,
    p_status: status,
    p_notes: notes,
    p_scheduled_at: scheduledAt,
  });

  if (error) {
    logSecurityRelevantFailure("contractor_update_work_order", {
      error,
      context: { ...context, workOrderId, requestedStatus: status },
    });
    throw friendly(error, "Failed to update contractor work order");
  }

  return parseWorkOrderRow(data);
}

function buildPropertyLabel(row, fallback = "Property") {
  const address = String(row?.address || "").trim();
  const city = String(row?.city || "").trim();
  return `${address || fallback}${city ? `, ${city}` : ""}`;
}

export async function loadContractorPortalRows(context = {}) {
  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;

  const authedUserId = authData?.user?.id || "";
  let rows = [];

  const baseSelect = `
    id,
    account_id,
    property_id,
    maintenance_request_id,
    contractor_user_id,
    contractor_name,
    contractor_phone,
    status,
    scheduled_at,
    notes,
    created_at,
    updated_at,
    maintenance_requests:maintenance_request_id ( id, title, description, priority ),
    properties:property_id ( id, address, city )
  `;

  const { data: fromView, error: fromViewError } = await supabase
    .from("work_orders_with_flags")
    .select(baseSelect)
    .order("created_at", { ascending: false });

  if (fromViewError) {
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from("work_orders")
      .select(
        "id, account_id, property_id, maintenance_request_id, contractor_user_id, contractor_name, contractor_phone, status, scheduled_at, notes, created_at, updated_at",
      )
      .order("created_at", { ascending: false });

    if (fallbackError) throw fallbackError;
    rows = parseRpcRows(fallbackRows || [], parseWorkOrderRow, "contractor portal fallback work orders");
  } else {
    rows = parseRpcRows(fromView || [], parseWorkOrderRow, "contractor portal work orders");
  }

  if (authedUserId) {
    rows = rows.filter((row) => String(row?.contractor_user_id || "") === authedUserId);
  }

  const requestIds = rows.map((row) => row.maintenance_request_id).filter(Boolean);
  const propertyIds = rows.map((row) => row.property_id).filter(Boolean);

  let requestById = {};
  let propertyById = {};

  if (requestIds.length > 0) {
    const { data: requestRows } = await supabase
      .from("maintenance_requests")
      .select("id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, created_at, updated_at")
      .in("id", requestIds);
    const parsedRequests = parseRpcRows(requestRows || [], parseMaintenanceRequestRow, "contractor portal request rows");
    requestById = Object.fromEntries(parsedRequests.map((row) => [row.id, row]));
  }

  if (propertyIds.length > 0) {
    const { data: propertyRows } = await supabase
      .from("properties")
      .select("id, address, city")
      .in("id", propertyIds);
    const parsedProperties = parseRpcRows(propertyRows || [], parsePropertyLabelRow, "contractor portal property rows");
    propertyById = Object.fromEntries(parsedProperties.map((row) => [row.id, row]));
  }

  let hydrated = rows.map((row) => {
    const request = row.maintenance_requests || requestById[row.maintenance_request_id] || null;
    const property = row.properties || propertyById[row.property_id] || null;
    return {
      ...row,
      issueTitle: request?.title || "",
      issueDescription: request?.description || "",
      issuePriority: request?.priority || "normal",
      propertyLabel: property ? buildPropertyLabel(property, "Property") : "Property",
    };
  });

  const needsCardFallback = hydrated.some(
    (row) =>
      !String(row.propertyLabel || "").trim() ||
      String(row.propertyLabel || "").trim().toLowerCase() === "property" ||
      !String(row.issueTitle || "").trim(),
  );

  if (needsCardFallback) {
    try {
      const cardRows = await listContractorWorkOrderCards(hydrated.map((row) => row.id).filter(Boolean), context);
      const byId = Object.fromEntries((cardRows || []).map((row) => [row.work_order_id, row]));
      hydrated = hydrated.map((row) => {
        const card = byId[row.id];
        if (!card) return row;
        return {
          ...row,
          issueTitle: String(card.issue_title || "").trim() || row.issueTitle,
          issueDescription: String(card.issue_description || "").trim() || row.issueDescription,
          issuePriority: String(card.issue_priority || "").trim() || row.issuePriority,
          propertyLabel: String(card.property_label || "").trim() || row.propertyLabel,
        };
      });
    } catch (error) {
      logSecurityRelevantFailure("contractor_work_order_cards", {
        error,
        context,
      });
    }
  }

  return hydrated;
}

export async function getContractorJobDetailsBundle(workOrderId, context = {}) {
  if (!workOrderId) throw new Error("Missing workOrderId");

  let workOrder = null;
  let financials = null;
  let request = null;
  let propertyLabel = "";

  let { data, error } = await supabase
    .from("work_orders")
    .select(
      "id, maintenance_request_id, property_id, status, scheduled_at, notes, contractor_name, contractor_phone, created_at, updated_at, assigned_at, acknowledged_at, acknowledgement_due_at, acknowledgement_status",
    )
    .eq("id", workOrderId)
    .maybeSingle();

  if (error) throw error;
  workOrder = data ? parseWorkOrderRow(data) : null;

  const { data: financialRow, error: financialError } = await supabase
    .from("work_order_financials")
    .select(
      "id, account_id, work_order_id, quote_amount, quote_currency, quote_notes, quote_status, quote_submitted_at, quote_submitted_by, invoice_amount, invoice_currency, invoice_issued_at, invoice_due_at, approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at, updated_at",
    )
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (!financialError) {
    financials = financialRow ? parseWorkOrderFinancialRow(financialRow) : null;
  }

  if (workOrder?.maintenance_request_id) {
    const { data: requestRow } = await supabase
      .from("maintenance_requests")
      .select("id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, created_at, updated_at")
      .eq("id", workOrder.maintenance_request_id)
      .maybeSingle();
    request = requestRow ? parseMaintenanceRequestRow(requestRow) : null;

    const propertyId = request?.property_id || workOrder?.property_id;
    if (propertyId) {
      const { data: propertyRow } = await supabase
        .from("properties")
        .select("id, address, city")
        .eq("id", propertyId)
        .maybeSingle();
      if (propertyRow) {
        propertyLabel = buildPropertyLabel(parsePropertyLabelRow(propertyRow), "Property");
      }
    }
  }

  if ((!String(propertyLabel || "").trim() || !String(request?.title || "").trim()) && workOrder?.id) {
    try {
      const cardRows = await listContractorWorkOrderCards([workOrder.id], context);
      const card = Array.isArray(cardRows) ? cardRows[0] : null;
      if (card) {
        if (!String(propertyLabel || "").trim() && String(card.property_label || "").trim()) {
          propertyLabel = String(card.property_label).trim();
        }
        request = {
          ...(request || {}),
          id: request?.id || workOrder?.maintenance_request_id || null,
          title: String(request?.title || "").trim() || String(card.issue_title || "").trim() || "",
          description: String(request?.description || "").trim() || String(card.issue_description || "").trim() || "",
          priority: String(request?.priority || "").trim() || String(card.issue_priority || "").trim() || "normal",
        };
      }
    } catch (error) {
      logSecurityRelevantFailure("contractor_work_order_cards", {
        error,
        context,
      });
    }
  }

  return {
    row: workOrder,
    financials,
    requestRow: request,
    propertyLabel,
  };
}
