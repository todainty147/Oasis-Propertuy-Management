import { supabase } from "../lib/supabase";
import { createSignedStorageUrl } from "./storageUrlService";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 1000;
const MAX_BACKEND_EXPORT_JOB_ROWS = 25;
export const SECURITY_AUDIT_BACKEND_EXPORT_THRESHOLD = MAX_EXPORT_ROWS;

function clampPageSize(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

function normalizeDateStart(value) {
  if (!value) return null;
  return `${value}T00:00:00.000Z`;
}

function normalizeDateEnd(value) {
  if (!value) return null;
  return `${value}T23:59:59.999Z`;
}

function uniq(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeText(value) {
  const next = String(value || "").trim();
  return next || "";
}

function formatExportLabelDate(value) {
  const next = value ? new Date(value) : null;
  if (!next || Number.isNaN(next.getTime())) return "";
  return next.toISOString().slice(0, 10);
}

function buildExportDisplayLabel(row) {
  const explicit = normalizeText(row?.requested_label);
  const datePart = formatExportLabelDate(row?.created_at);

  if (explicit && datePart) return `${datePart} - ${explicit}`;
  if (explicit) return explicit;

  const filter = row?.filter_criteria || {};
  const derived = [normalizeText(filter.action), normalizeText(filter.entityType)].filter(Boolean).join(" · ");
  if (derived && datePart) return `${datePart} - ${derived}`;
  if (datePart) return `${datePart} - security-audit-export`;
  return "security-audit-export";
}

async function invokeEdgeFunction(name, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error("Missing auth session");
  }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw new Error(payload?.error || `Failed to call ${name}`);
  }

  return payload;
}

function labelFromContractor(row) {
  const parts = [normalizeText(row?.name), normalizeText(row?.email)].filter(Boolean);
  return parts.join(" • ");
}

function labelFromTenant(row) {
  const parts = [normalizeText(row?.name), normalizeText(row?.email)].filter(Boolean);
  return parts.join(" • ");
}

function labelFromMember(row) {
  const role = normalizeText(row?.role);
  return role ? `Member (${role})` : "Account member";
}

function labelFromProperty(row) {
  const address = normalizeText(row?.address);
  const city = normalizeText(row?.city);
  return [address, city].filter(Boolean).join(", ") || address || city || "";
}

function buildDocumentLabel(row, auditRow) {
  const directName = normalizeText(row?.name);
  if (directName) return directName;

  const storagePath = normalizeText(auditRow?.metadata?.storage_path);
  if (!storagePath) return "";
  const segments = storagePath.split("/").filter(Boolean);
  return segments.at(-1) || storagePath;
}

function labelForUser(userId, { memberByUserId, tenantByUserId, contractorByUserId }) {
  if (!userId) return "";

  const contractor = contractorByUserId.get(userId);
  if (contractor) return labelFromContractor(contractor) || "Contractor";

  const tenant = tenantByUserId.get(userId);
  if (tenant) return labelFromTenant(tenant) || "Tenant";

  const member = memberByUserId.get(userId);
  if (member) return labelFromMember(member);

  return "";
}

async function resolveSecurityAuditLabels(accountId, rows) {
  const actorUserIds = uniq(
    rows
      .map((row) => row.actor_user_id)
      .concat(rows.map((row) => row.assigned_to_user_id))
      .concat(rows.map((row) => row.acknowledged_by_user_id))
      .concat(rows.map((row) => row.classified_by_user_id))
      .concat(rows.map((row) => row.resolved_by_user_id)),
  );
  const memberUserIds = uniq(
    rows
      .filter((row) => row.entity_type === "account_member")
      .map((row) => row.entity_id),
  );
  const invitationIds = uniq(
    rows
      .filter((row) => row.entity_type === "account_invitation")
      .map((row) => row.entity_id),
  );
  const workOrderIds = uniq(
    rows
      .filter((row) => row.entity_type === "work_order")
      .map((row) => row.entity_id),
  );
  const documentIds = uniq(
    rows
      .filter((row) => row.entity_type === "document")
      .map((row) => row.entity_id),
  );
  const propertyIds = uniq(
    rows
      .filter((row) => row.entity_type === "property")
      .map((row) => row.entity_id)
      .concat(
        rows
          .filter((row) => row.entity_type === "work_order")
          .map((row) => row.metadata?.property_id),
      ),
  );
  const tenantIds = uniq(
    rows
      .filter((row) => row.entity_type === "tenant")
      .map((row) => row.entity_id),
  );
  const contractorUserIds = uniq(
    rows
      .map((row) => row.metadata?.contractor_user_id)
      .concat(rows.map((row) => row.metadata?.previous_contractor_user_id)),
  );

  const allActorLikeUserIds = uniq([...actorUserIds, ...memberUserIds, ...contractorUserIds]);

  const [
    memberRes,
    tenantActorRes,
    contractorActorRes,
    invitationRes,
    workOrderRes,
    documentRes,
    propertyRes,
    tenantRes,
  ] = await Promise.all([
    allActorLikeUserIds.length
      ? supabase
          .from("account_members")
          .select("user_id, role")
          .eq("account_id", accountId)
          .in("user_id", allActorLikeUserIds)
      : Promise.resolve({ data: [], error: null }),
    allActorLikeUserIds.length
      ? supabase
          .from("tenants")
          .select("id, user_id, name, email")
          .eq("account_id", accountId)
          .in("user_id", allActorLikeUserIds)
      : Promise.resolve({ data: [], error: null }),
    allActorLikeUserIds.length
      ? supabase
          .from("contractors")
          .select("id, user_id, name, email")
          .eq("account_id", accountId)
          .in("user_id", allActorLikeUserIds)
      : Promise.resolve({ data: [], error: null }),
    invitationIds.length
      ? supabase
          .from("account_invitations")
          .select("id, email, role")
          .eq("account_id", accountId)
          .in("id", invitationIds)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? supabase
          .from("work_orders")
          .select("id, maintenance_request_id, property_id, contractor_name")
          .eq("account_id", accountId)
          .in("id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabase
          .from("documents")
          .select("id, name, property_id, tenant_id")
          .eq("account_id", accountId)
          .in("id", documentIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase
          .from("properties")
          .select("id, address, city")
          .eq("account_id", accountId)
          .in("id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    tenantIds.length
      ? supabase
          .from("tenants")
          .select("id, name, email")
          .eq("account_id", accountId)
          .in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const res of [
    memberRes,
    tenantActorRes,
    contractorActorRes,
    invitationRes,
    workOrderRes,
    documentRes,
    propertyRes,
    tenantRes,
  ]) {
    if (res?.error) throw res.error;
  }

  const memberByUserId = new Map((memberRes.data || []).map((row) => [row.user_id, row]));
  const tenantByUserId = new Map((tenantActorRes.data || []).map((row) => [row.user_id, row]));
  const contractorByUserId = new Map((contractorActorRes.data || []).map((row) => [row.user_id, row]));
  const invitationById = new Map((invitationRes.data || []).map((row) => [row.id, row]));
  const workOrderById = new Map((workOrderRes.data || []).map((row) => [row.id, row]));
  const documentById = new Map((documentRes.data || []).map((row) => [row.id, row]));
  const propertyById = new Map((propertyRes.data || []).map((row) => [row.id, row]));
  const tenantById = new Map((tenantRes.data || []).map((row) => [row.id, row]));

  return rows.map((row) => {
    const actorUserId = row.actor_user_id;
    const actorContractor = contractorByUserId.get(actorUserId);
    const actorTenant = tenantByUserId.get(actorUserId);
    const actorMember = memberByUserId.get(actorUserId);

    let actorLabel = "";
    if (actorContractor) {
      actorLabel = labelFromContractor(actorContractor) || "Contractor";
    } else if (actorTenant) {
      actorLabel = labelFromTenant(actorTenant) || "Tenant";
    } else if (actorMember) {
      actorLabel = labelFromMember(actorMember);
    }

    let entityLabel = "";

    if (row.entity_type === "account_member") {
      const member = memberByUserId.get(row.entity_id);
      const contractor = contractorByUserId.get(row.entity_id);
      const tenant = tenantByUserId.get(row.entity_id);
      entityLabel =
        labelFromContractor(contractor) ||
        labelFromTenant(tenant) ||
        labelFromMember(member);
    } else if (row.entity_type === "account_invitation") {
      const invitation = invitationById.get(row.entity_id);
      if (invitation) {
        entityLabel = [normalizeText(invitation.email), normalizeText(invitation.role)].filter(Boolean).join(" • ");
      } else {
        entityLabel = [normalizeText(row.metadata?.email), normalizeText(row.metadata?.invited_role)]
          .filter(Boolean)
          .join(" • ");
      }
    } else if (row.entity_type === "work_order") {
      const workOrder = workOrderById.get(row.entity_id);
      if (workOrder) {
        const property = propertyById.get(workOrder.property_id || row.metadata?.property_id);
        entityLabel = [
          `WO ${String(workOrder.id).slice(0, 8)}`,
          labelFromProperty(property),
          normalizeText(workOrder.contractor_name),
        ]
          .filter(Boolean)
          .join(" • ");
      } else if (row.entity_id) {
        entityLabel = `WO ${String(row.entity_id).slice(0, 8)}`;
      }
    } else if (row.entity_type === "document") {
      const document = documentById.get(row.entity_id);
      entityLabel = buildDocumentLabel(document, row);
    } else if (row.entity_type === "property") {
      entityLabel = labelFromProperty(propertyById.get(row.entity_id));
    } else if (row.entity_type === "tenant") {
      entityLabel = labelFromTenant(tenantById.get(row.entity_id));
    } else if (row.entity_type === "security_alert") {
      entityLabel =
        normalizeText(row.metadata?.alert_title) ||
        normalizeText(row.metadata?.title) ||
        normalizeText(row.metadata?.alert_type) ||
        "Security alert";
    } else if (row.entity_type === "account") {
      entityLabel = normalizeText(row.metadata?.target_account_id) || "";
    }

    return {
      ...row,
      actorLabel,
      actorKind: actorContractor ? "contractor" : actorTenant ? "tenant" : actorMember ? "member" : "",
      entityLabel,
      assignedToLabel: labelForUser(row.assigned_to_user_id, {
        memberByUserId,
        tenantByUserId,
        contractorByUserId,
      }),
      acknowledgedByLabel: labelForUser(row.acknowledged_by_user_id, {
        memberByUserId,
        tenantByUserId,
        contractorByUserId,
      }),
      classifiedByLabel: labelForUser(row.classified_by_user_id, {
        memberByUserId,
        tenantByUserId,
        contractorByUserId,
      }),
      resolvedByLabel: labelForUser(row.resolved_by_user_id, {
        memberByUserId,
        tenantByUserId,
        contractorByUserId,
      }),
    };
  });
}

function applySecurityAuditFilters(query, filters = {}) {
  if (filters.dateFrom) {
    query = query.gte("created_at", normalizeDateStart(filters.dateFrom));
  }

  if (filters.dateTo) {
    query = query.lte("created_at", normalizeDateEnd(filters.dateTo));
  }

  if (filters.action) {
    query = query.eq("action", String(filters.action).trim().toLowerCase());
  }

  if (filters.actorUserId) {
    query = query.eq("actor_user_id", String(filters.actorUserId).trim());
  }

  if (filters.entityType) {
    query = query.eq("entity_type", String(filters.entityType).trim().toLowerCase());
  }

  if (filters.entityId) {
    query = query.eq("entity_id", String(filters.entityId).trim());
  }

  return query;
}

export async function listSecurityAuditEvents(accountId, filters = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = clampPageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const query = applySecurityAuditFilters(
    supabase
      .from("security_audit_ledger")
      .select(
        `
        id,
        account_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      `,
        { count: "exact" },
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .range(from, to),
    filters,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = await resolveSecurityAuditLabels(accountId, data ?? []);

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getSecurityAuditEvent(accountId, eventId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!eventId) throw new Error("Missing event id");

  const { data, error } = await supabase
    .from("security_audit_ledger")
    .select(
      `
      id,
      account_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata,
      created_at
    `,
    )
    .eq("account_id", accountId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [row] = await resolveSecurityAuditLabels(accountId, [data]);
  return row || null;
}

export async function listSecurityAuditEventsForExport(accountId, filters = {}, { maxRows = MAX_EXPORT_ROWS } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const safeMaxRows = Math.min(Math.max(Number(maxRows) || MAX_EXPORT_ROWS, 100), 5000);
  const batchSize = 200;
  let page = 1;
  let allRows = [];
  let total = 0;

  while (allRows.length < safeMaxRows) {
    const result = await listSecurityAuditEvents(accountId, {
      ...filters,
      page,
      pageSize: Math.min(batchSize, safeMaxRows),
    });

    if (page === 1) {
      total = result.total;
    }

    allRows = allRows.concat(result.rows);

    if (result.rows.length < batchSize || allRows.length >= total) {
      break;
    }

    page += 1;
  }

  return {
    rows: allRows.slice(0, safeMaxRows),
    total,
    truncated: total > safeMaxRows,
    maxRows: safeMaxRows,
  };
}

export async function listSecurityAuditFilterOptions(accountId, { limit = 300 } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const safeLimit = Math.min(Math.max(Number(limit) || 300, 50), 1000);

  const { data, error } = await supabase
    .from("security_audit_ledger")
    .select("action, actor_user_id, entity_type, entity_id, metadata, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const rows = await resolveSecurityAuditLabels(accountId, data ?? []);
  const entities = Array.from(
    new Map(
      rows
        .filter((row) => row.entity_id)
        .map((row) => {
          const label = normalizeText(row.entityLabel) || normalizeText(row.entity_type) || normalizeText(row.entity_id);
          const type = normalizeText(row.entity_type);
          const id = normalizeText(row.entity_id);
          return [
            `${type}:${id}`,
            {
              id,
              type,
              label: type ? `${label} (${type})` : label,
            },
          ];
        }),
    ).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));

  return {
    actions: Array.from(new Set(rows.map((row) => row.action).filter(Boolean))).sort(),
    actorUserIds: Array.from(new Set(rows.map((row) => row.actor_user_id).filter(Boolean))).sort(),
    entityTypes: Array.from(new Set(rows.map((row) => row.entity_type).filter(Boolean))).sort(),
    entities,
  };
}

export async function listSecurityAnomalyAlerts(
  accountId,
  { status = "active", page = 1, pageSize = 5 } = {},
) {
  if (!accountId) throw new Error("Missing accountId");

  const safePageSize = Math.min(Math.max(Number(pageSize) || 5, 1), 25);
  const safePage = Math.max(Number(page) || 1, 1);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("security_anomaly_alerts")
    .select(
      `
      id,
      account_id,
      alert_type,
      severity,
      status,
      actor_user_id,
      entity_type,
      entity_id,
      title,
      summary,
      metadata,
      alert_count,
      created_at,
      last_seen_at
      ,
      classification,
      classified_by_user_id,
      classified_at,
      assigned_to_user_id,
      assigned_by_user_id,
      assigned_at,
      acknowledged_by_user_id,
      resolved_by_user_id,
      updated_at,
      resolution_note
    `,
      { count: "exact" },
    )
    .eq("account_id", accountId)
    .order("last_seen_at", { ascending: false })
    .range(from, to);

  if (status === "active") {
    query = query.in("status", ["open", "acknowledged"]);
  } else if (status) {
    query = query.eq("status", String(status).trim().toLowerCase());
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enrichedRows = await resolveSecurityAuditLabels(accountId, data ?? []);

  return {
    rows: enrichedRows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      alertType: row.alert_type,
      severity: row.severity,
      status: row.status,
      actorUserId: row.actor_user_id,
      actorLabel: row.actorLabel || "",
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityLabel: row.entityLabel || "",
      title: row.title,
      summary: row.summary,
      metadata: row.metadata || {},
      alertCount: Number(row.alert_count || 1),
      classification: row.classification || "",
      classifiedByUserId: row.classified_by_user_id || "",
      classifiedByLabel: row.classifiedByLabel || "",
      classifiedAt: row.classified_at,
      assignedToUserId: row.assigned_to_user_id || "",
      assignedToLabel: row.assignedToLabel || "",
      assignedByUserId: row.assigned_by_user_id || "",
      assignedAt: row.assigned_at,
      acknowledgedByUserId: row.acknowledged_by_user_id || "",
      acknowledgedByLabel: row.acknowledgedByLabel || "",
      acknowledgedAt: row.acknowledged_at,
      resolvedByUserId: row.resolved_by_user_id || "",
      resolvedByLabel: row.resolvedByLabel || "",
      resolvedAt: row.resolved_at,
      resolutionNote: row.resolution_note || "",
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    })),
    total: Number(count || 0),
  };
}

export async function listSecurityAlertHistory(accountId, alertId, { limit = 20 } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!alertId) throw new Error("Missing alert id");

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const { data, error } = await supabase
    .from("security_audit_ledger")
    .select("id, account_id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
    .eq("account_id", accountId)
    .eq("entity_type", "security_alert")
    .eq("entity_id", alertId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return resolveSecurityAuditLabels(accountId, data ?? []);
}

export async function listSecurityAlertAssignees(accountId) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId)
    .order("role", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => ["owner", "admin", "staff"].includes(String(row?.role || "").toLowerCase()))
    .map((row) => ({
      userId: row.user_id,
      role: row.role,
      label: `${row.role} • ${row.user_id}`,
    }));
}

export async function applySecurityAlertWorkflow({
  alertId,
  operation,
  classification = null,
  assignedToUserId = null,
  resolutionNote = null,
} = {}) {
  if (!alertId) throw new Error("Missing alert id");
  if (!operation) throw new Error("Missing operation");

  const { data, error } = await supabase.rpc("security_anomaly_alert_apply", {
    p_alert_id: alertId,
    p_operation: operation,
    p_classification: classification,
    p_assigned_to_user_id: assignedToUserId,
    p_resolution_note: resolutionNote,
  });

  if (error) throw error;
  return data;
}

export async function listSecurityAuditExportJobs(
  accountId,
  { page = 1, pageSize = 5 } = {},
) {
  if (!accountId) throw new Error("Missing accountId");

  const safePageSize = Math.min(Math.max(Number(pageSize) || 5, 1), 10);
  const safePage = Math.max(Number(page) || 1, 1);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error, count } = await supabase
    .from("security_audit_export_jobs")
    .select(
      `
      id,
      account_id,
      requested_by_user_id,
      requested_label,
      export_kind,
      format,
      status,
      filter_criteria,
      artifact_bucket,
      artifact_path,
      row_count,
      file_size_bytes,
      error_summary,
      created_at,
      started_at,
      completed_at,
      expires_at
    `,
      { count: "exact" },
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const enrichedRows = await resolveSecurityAuditLabels(
    accountId,
    (data ?? []).map((row) => ({
      ...row,
      actor_user_id: row.requested_by_user_id,
    })),
  );

  return {
    rows: enrichedRows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      requestedByUserId: row.requested_by_user_id,
      requestedByLabel: row.actorLabel || "",
      requestedLabel: row.requested_label || "",
      displayLabel: buildExportDisplayLabel(row),
      exportKind: row.export_kind,
      format: row.format,
      status: row.status,
      filterCriteria: row.filter_criteria || {},
      artifactBucket: row.artifact_bucket || "",
      artifactPath: row.artifact_path || "",
      rowCount: Number(row.row_count || 0),
      fileSizeBytes: Number(row.file_size_bytes || 0),
      errorSummary: row.error_summary || "",
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
    })),
    total: Number(count || 0),
  };
}

export async function requestSecurityAuditBackendExport(
  accountId,
  filters = {},
  { retentionDays = null, requestedLabel = "" } = {},
) {
  if (!accountId) throw new Error("Missing accountId");

  const payload = {
    dateFrom: normalizeText(filters.dateFrom),
    dateTo: normalizeText(filters.dateTo),
    action: normalizeText(filters.action),
    actorUserId: normalizeText(filters.actorUserId),
    entityType: normalizeText(filters.entityType),
    entityId: normalizeText(filters.entityId),
  };

  const { data, error } = await supabase.rpc("request_security_audit_export", {
    p_account_id: accountId,
    p_filter_criteria: payload,
    p_format: "csv",
    p_retention_days: retentionDays,
    p_requested_label: normalizeText(requestedLabel) || null,
  });

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create export job");

  return data;
}

export async function runSecurityAuditExportJob(jobId) {
  if (!jobId) throw new Error("Missing export job id");
  return invokeEdgeFunction("generate-security-audit-export", { jobId });
}

export async function getSecurityAuditExportDownloadUrl(job) {
  const bucket = String(job?.artifactBucket || job?.artifact_bucket || "").trim();
  const path = String(job?.artifactPath || job?.artifact_path || "").trim();

  if (!bucket || !path) {
    throw new Error("Export artifact is not available yet");
  }

  return createSignedStorageUrl(bucket, path, 60 * 10);
}
