import { supabase } from "../lib/supabase";
import { getDerivedLeaseStatus, getPrimaryLease } from "./leaseService";

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

let tenantActivityFeedUnavailable = false;

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function mapPaymentEvent(payment) {
  const amount = Number(payment?.amount || 0);
  const paidAt = payment?.paid_at || null;
  const dueDate = payment?.due_date || null;
  const status = normalizeStatus(payment?.status);

  if (paidAt) {
    return {
      key: `payment-paid-${payment.id}`,
      at: paidAt,
      type: "payment_paid",
      title: "Rent payment recorded",
      detail: amount > 0 ? `${amount}` : "",
      status: payment.status || "",
      linkPath: "/tenant/payments",
    };
  }

  if (status === "zaległe" || status === "overdue") {
    return {
      key: `payment-overdue-${payment.id}`,
      at: dueDate || payment.created_at || new Date().toISOString(),
      type: "payment_overdue",
      title: "Rent became overdue",
      detail: amount > 0 ? `${amount}` : "",
      status: payment.status || "",
      linkPath: "/tenant/payments",
    };
  }

  return {
    key: `payment-scheduled-${payment.id}`,
    at: dueDate || payment.created_at || new Date().toISOString(),
    type: "payment_scheduled",
    title: "Rent charge scheduled",
    detail: amount > 0 ? `${amount}` : "",
    status: payment.status || "",
    linkPath: "/tenant/payments",
  };
}

function actionLabel(action) {
  const value = normalizeStatus(action);
  if (value === "create" || value === "insert") return "created";
  if (value === "update") return "updated";
  if (value === "delete" || value === "deleted") return "deleted";
  if (value === "status_change") return "status changed";
  if (value === "assign") return "assigned";
  return value || "updated";
}

function entityLabel(entityType) {
  const value = normalizeStatus(entityType);
  if (value === "tenant" || value === "tenants") return "Tenant";
  if (value === "property" || value === "properties") return "Property";
  if (value === "maintenance_request" || value === "maintenance_requests") return "Maintenance request";
  if (value === "work_order" || value === "work_orders") return "Work order";
  if (value === "document" || value === "documents") return "Document";
  if (value === "payment" || value === "payments") return "Payment";
  return "Activity";
}

function mapActivityItem(row, tenantId, propertyId) {
  const metaPropertyId = row?.meta?.property_id ? String(row.meta.property_id) : null;
  const entityId = row?.entity_id ? String(row.entity_id) : null;
  const entityType = normalizeStatus(row?.entity_type);

  let linkPath = "";
  if ((entityType === "tenant" || entityType === "tenants") && entityId === String(tenantId)) {
    linkPath = `/tenants/${tenantId}`;
  } else if ((entityType === "document" || entityType === "documents") && propertyId) {
    linkPath = `/documents?tenant=${tenantId}`;
  } else if ((entityType === "payment" || entityType === "payments") && entityId) {
    linkPath = "/tenant/payments";
  } else if ((entityType === "maintenance_request" || entityType === "maintenance_requests") && propertyId) {
    linkPath = "/maintenance-inbox";
  } else if ((entityType === "work_order" || entityType === "work_orders") && entityId) {
    linkPath = `/work-orders/${entityId}`;
  } else if (metaPropertyId && metaPropertyId === String(propertyId)) {
    linkPath = `/properties/${propertyId}`;
  }

  return {
    key: `activity-${row.id}`,
    at: row.created_at,
    type: "activity_log",
    title: `${entityLabel(row.entity_type)} ${actionLabel(row.action)}`,
    detail: row.field ? `${row.field}` : "",
    status: row.actor_role || "",
    linkPath,
  };
}

function isResolvedRequestStatus(status) {
  const value = normalizeStatus(status);
  return ["resolved", "closed", "zamknięte", "rozwiązane"].includes(value);
}

function isOverduePaymentStatus(status) {
  const value = normalizeStatus(status);
  return ["overdue", "zaległe"].includes(value);
}

export async function getTenantTimeline({
  accountId,
  tenant,
  property,
  limit = 40,
} = {}) {
  if (!accountId || !tenant?.id) {
    return {
      items: [],
      summary: {
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      },
    };
  }

  const propertyId = property?.id || tenant?.propertyId || null;

  if (!tenantActivityFeedUnavailable) {
    const [
      feedRes,
      lease,
      paymentSummaryRes,
      requestSummaryRes,
    ] = await Promise.all([
      supabase.rpc("tenant_activity_feed", {
        p_account_id: accountId,
        p_tenant_id: tenant.id,
        p_limit: limit,
      }),
      getPrimaryLease({ accountId, tenantId: tenant.id, propertyId }),
      supabase
        .from("payments")
        .select("id, status", { count: "exact" })
        .eq("account_id", accountId)
        .eq("tenant_id", tenant.id)
        .in("status", ["overdue", "Zaległe"]),
      supabase
        .from("maintenance_requests")
        .select("id, status")
        .eq("account_id", accountId)
        .eq("reported_by_tenant_id", tenant.id),
    ]);

    const { data, error } = feedRes;

    if (error && isMissingBackendObject(error)) {
      tenantActivityFeedUnavailable = true;
    } else if (error) {
      throw error;
    } else {
      if (paymentSummaryRes.error) throw paymentSummaryRes.error;
      if (requestSummaryRes.error) throw requestSummaryRes.error;
      return {
        items: Array.isArray(data)
          ? data.map((row) => ({
              key: row.event_key,
              type: row.event_type,
              at: row.occurred_at,
              title: row.title,
              detail: row.detail,
              status: row.status,
              linkPath: row.link_path,
            }))
          : [],
        summary: {
          openRequests: (requestSummaryRes.data || []).filter((row) => !isResolvedRequestStatus(row.status)).length,
          overduePayments: paymentSummaryRes.count || 0,
          leaseWatch: lease && ["expiring_soon", "renewal_in_progress", "ended"].includes(getDerivedLeaseStatus(lease)) ? 1 : 0,
        },
      };
    }
  }

  const [
    lease,
    paymentsRes,
    requestsRes,
    docsRes,
    activityRes,
  ] = await Promise.all([
    getPrimaryLease({ accountId, tenantId: tenant.id, propertyId }),
    supabase
      .from("payments")
      .select("id, amount, status, due_date, paid_at, created_at")
      .eq("account_id", accountId)
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("maintenance_requests")
      .select("id, title, status, priority, created_at, updated_at")
      .eq("account_id", accountId)
      .eq("reported_by_tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("documents")
      .select("id, name, created_at, upload_status")
      .eq("account_id", accountId)
      .eq("tenant_id", tenant.id)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("activity_log")
      .select("id, entity_type, entity_id, action, field, actor_role, meta, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  if (docsRes.error) throw docsRes.error;
  if (activityRes.error && !isMissingBackendObject(activityRes.error)) throw activityRes.error;

  const requestRows = requestsRes.data || [];
  const requestIds = requestRows.map((row) => row.id).filter(Boolean);

  let workOrderRows = [];
  if (requestIds.length > 0) {
    const { data, error } = await supabase
      .from("work_orders_with_flags")
      .select("id, maintenance_request_id, status, contractor_name, scheduled_at, created_at, updated_at")
      .in("maintenance_request_id", requestIds)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error && !isMissingBackendObject(error)) throw error;
    workOrderRows = data || [];
  }

  const events = [];

  events.push({
    key: `tenant-created-${tenant.id}`,
    at: tenant.createdAt || new Date().toISOString(),
    type: "tenant_created",
    title: "Tenant record created",
    detail: property?.address || "",
    status: "",
    linkPath: `/tenants/${tenant.id}`,
  });

  if (lease?.lease_start_date) {
    events.push({
      key: `lease-start-${lease.id}`,
      at: `${lease.lease_start_date}T00:00:00`,
      type: "lease_start",
      title: "Lease started",
      detail: property?.address || "",
      status: lease.derivedStatus || lease.renewal_status || "",
      linkPath: `/tenants/${tenant.id}`,
    });
  }

  if (lease?.lease_end_date) {
    events.push({
      key: `lease-end-${lease.id}`,
      at: `${lease.lease_end_date}T00:00:00`,
      type: "lease_end",
      title: "Lease end date recorded",
      detail: property?.address || "",
      status: lease.derivedStatus || lease.renewal_status || "",
      linkPath: `/tenants/${tenant.id}`,
    });
  }

  for (const payment of paymentsRes.data || []) {
    events.push(mapPaymentEvent(payment));
  }

  for (const request of requestRows) {
    events.push({
      key: `request-${request.id}`,
      at: request.created_at,
      type: "maintenance_request",
      title: "Maintenance request submitted",
      detail: request.title || "",
      status: request.status || request.priority || "",
      linkPath: "/maintenance-inbox",
    });
  }

  for (const workOrder of workOrderRows) {
    const completed = ["completed", "zakończone"].includes(normalizeStatus(workOrder.status));
    events.push({
      key: `work-order-${workOrder.id}`,
      at: workOrder.updated_at || workOrder.created_at,
      type: completed ? "work_order_completed" : "work_order_opened",
      title: completed ? "Work order completed" : "Work order opened",
      detail: workOrder.contractor_name || "",
      status: workOrder.status || "",
      linkPath: `/work-orders/${workOrder.id}`,
    });
  }

  for (const doc of docsRes.data || []) {
    events.push({
      key: `document-${doc.id}`,
      at: doc.created_at,
      type: "document_uploaded",
      title: "Document uploaded",
      detail: doc.name || "",
      status: "",
      linkPath: `/documents?tenant=${tenant.id}`,
    });
  }

  const relevantActivity = (activityRes.data || []).filter((row) => {
    const entityType = normalizeStatus(row?.entity_type);
    const entityId = String(row?.entity_id || "");
    const metaPropertyId = String(row?.meta?.property_id || "");
    const isTenantEntity =
      ["tenant", "tenants"].includes(entityType) && entityId === String(tenant.id);
    const isPropertyScoped = propertyId && metaPropertyId === String(propertyId);
    return isTenantEntity || isPropertyScoped;
  });

  for (const row of relevantActivity) {
    events.push(mapActivityItem(row, tenant.id, propertyId));
  }

  const leaseStatus = lease ? getDerivedLeaseStatus(lease) : "no_lease";

  return {
    items: events
      .filter((event) => event.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, limit),
    summary: {
      openRequests: requestRows.filter((row) => !isResolvedRequestStatus(row.status)).length,
      overduePayments: (paymentsRes.data || []).filter((row) => isOverduePaymentStatus(row.status)).length,
      leaseWatch: ["expiring_soon", "renewal_in_progress", "ended"].includes(leaseStatus) ? 1 : 0,
    },
  };
}
