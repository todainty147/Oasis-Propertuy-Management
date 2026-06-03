import { supabase } from "../lib/supabase";
import {
  parseContractorDirectoryRow,
  parseMaintenanceRequestRow,
  parsePropertyLabelRow,
  parseRpcRows,
  parseWorkOrderRow,
} from "./rpcContracts";
import { listDiagnosticsForMaintenanceRequests } from "./maintenanceDiagnosticsService";

function buildPropertyLabel(row, fallback = "Property") {
  const city = row.city ? `, ${row.city}` : "";
  return `${row.address || fallback}${city}`;
}

export async function loadMaintenanceInboxData(accountId, propertyLabelFallback = "Property") {
  if (!accountId) {
    return {
      requests: [],
      totalCount: 0,
      workOrdersByRequestId: {},
      propertyLabelById: {},
      contractors: [],
    };
  }

  const [
    { data: requestRows, error: requestError },
    { data: propertyRows, error: propertyError },
    { data: contractorRows, error: contractorError },
  ] = await Promise.all([
    supabase
      .from("maintenance_requests")
      .select(
        "id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, waiting_reason, created_at, updated_at",
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase.from("properties").select("id, address, city").eq("account_id", accountId),
    supabase
      .from("contractors")
      .select("id, name, phone, active")
      .eq("account_id", accountId)
      .eq("active", true),
  ]);

  if (requestError) throw requestError;
  if (propertyError) throw propertyError;
  if (contractorError) throw contractorError;

  const requests = parseRpcRows(
    requestRows || [],
    parseMaintenanceRequestRow,
    "maintenance inbox requests",
  );
  const properties = parseRpcRows(
    propertyRows || [],
    parsePropertyLabelRow,
    "maintenance inbox properties",
  );
  const contractors = parseRpcRows(
    contractorRows || [],
    parseContractorDirectoryRow,
    "maintenance inbox contractors",
  );

  const propertyLabelById = {};
  for (const property of properties) {
    if (!property.id) continue;
    propertyLabelById[property.id] = buildPropertyLabel(property, propertyLabelFallback);
  }

  const requestIds = requests.map((request) => request.id).filter(Boolean);
  if (requestIds.length === 0) {
    return {
      requests,
      totalCount: requests.length,
      workOrdersByRequestId: {},
      propertyLabelById,
      contractors,
    };
  }

  const [
    { data: workOrderRows, error: workOrderError },
    diagnosticsByRequestId,
  ] = await Promise.all([
    supabase
      .from("work_orders_with_flags")
      .select(
        "id, account_id, property_id, maintenance_request_id, contractor_user_id, contractor_name, contractor_phone, status, created_at",
      )
      .eq("account_id", accountId)
      .in("maintenance_request_id", requestIds)
      .order("created_at", { ascending: false }),
    listDiagnosticsForMaintenanceRequests({ accountId, requestIds }).catch(() => ({})),
  ]);

  if (workOrderError) throw workOrderError;

  const workOrders = parseRpcRows(
    workOrderRows || [],
    parseWorkOrderRow,
    "maintenance inbox work orders",
  );
  const workOrdersByRequestId = {};
  for (const workOrder of workOrders) {
    const key = workOrder.maintenance_request_id;
    if (!key) continue;
    if (!workOrdersByRequestId[key]) workOrdersByRequestId[key] = [];
    workOrdersByRequestId[key].push(workOrder);
  }

  return {
    requests: requests.map((request) => ({
      ...request,
      diagnostic_session: diagnosticsByRequestId[request.id] || null,
    })),
    totalCount: requests.length,
    workOrdersByRequestId,
    propertyLabelById,
    contractors,
  };
}
