import { supabase } from "../lib/supabase";
import { parseLeaseAttentionItemRow, parseLeaseRow, parseMyLeaseRow, parseRpcRows } from "./rpcContracts";

export const LEASE_EXPIRING_SOON_DAYS = 60;

let leaseAttentionItemsUnavailable = false;

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(dateA, dateB) {
  const a = parseDateOnly(dateA);
  const b = parseDateOnly(dateB);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function todayDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function assertDateOnly(value, message) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(message);
  }
  const parsed = parseDateOnly(raw);
  if (!parsed || parsed.toISOString().slice(0, 10) !== raw) throw new Error(message);
  return parsed;
}

export function getDerivedLeaseStatus(row, expiringSoonDays = LEASE_EXPIRING_SOON_DAYS) {
  const explicit = String(row?.renewal_status || "").toLowerCase();
  const daysUntilEnd = daysBetween(row?.lease_end_date, todayDateString());

  if (explicit === "renewal_in_progress") return "renewal_in_progress";
  if (explicit === "renewed") return "renewed";
  if (explicit === "ended") return "ended";
  if (Number.isFinite(daysUntilEnd) && daysUntilEnd < 0) return "ended";
  if (Number.isFinite(daysUntilEnd) && daysUntilEnd <= expiringSoonDays) return "expiring_soon";
  return "active";
}

function isExpiredLeaseAlert(row, expiringSoonDays = LEASE_EXPIRING_SOON_DAYS) {
  const explicit = String(row?.renewal_status || "").toLowerCase();
  return getDerivedLeaseStatus(row, expiringSoonDays) === "ended" && !["ended", "renewed"].includes(explicit);
}

function isExpiringSoonLeaseAlert(row, expiringSoonDays = LEASE_EXPIRING_SOON_DAYS) {
  const explicit = String(row?.renewal_status || "").toLowerCase();
  return getDerivedLeaseStatus(row, expiringSoonDays) === "expiring_soon" && !["ended", "renewed"].includes(explicit);
}

function normalizeLease(row) {
  if (!row) return null;
  return {
    ...row,
    propertyLabel: row.property?.address || row.property_label || "—",
    tenantLabel: row.tenant?.name || row.tenant_label || "—",
    derivedStatus: getDerivedLeaseStatus(row),
    daysUntilEnd: daysBetween(row.lease_end_date, todayDateString()),
  };
}

export async function listLeases({
  accountId,
  propertyId = null,
  tenantId = null,
  limit = 20,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  let query = supabase
    .from("leases")
    .select(`
      id,
      account_id,
      property_id,
      tenant_id,
      lease_start_date,
      lease_end_date,
      renewal_status,
      notice_period_days,
      auto_renew,
      notes,
      created_at,
      updated_at,
      property:properties!leases_property_id_fkey(address),
      tenant:tenants!leases_tenant_id_fkey(name)
    `)
    .eq("account_id", accountId)
    .order("lease_end_date", { ascending: true })
    .range(offset, offset + limit - 1);

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error && isMissingBackendObject(error)) return [];
  if (error) throw friendly(error, "Failed to load leases");
  return parseRpcRows(data || [], parseLeaseRow, "lease rows").map(normalizeLease).filter(Boolean);
}

export async function getPrimaryLease({
  accountId,
  propertyId = null,
  tenantId = null,
} = {}) {
  const leases = await listLeases({
    accountId,
    propertyId,
    tenantId,
    limit: 10,
  });

  if (leases.length === 0) return null;

  const statusRank = {
    renewal_in_progress: 1,
    expiring_soon: 2,
    active: 3,
    renewed: 4,
    ended: 5,
  };

  return [...leases].sort((a, b) => {
    const rankDelta = (statusRank[a.derivedStatus] || 99) - (statusRank[b.derivedStatus] || 99);
    if (rankDelta !== 0) return rankDelta;
    const aDays = Number.isFinite(a.daysUntilEnd) ? a.daysUntilEnd : 99999;
    const bDays = Number.isFinite(b.daysUntilEnd) ? b.daysUntilEnd : 99999;
    return aDays - bDays;
  })[0];
}

export async function upsertLease({
  id = null,
  accountId,
  propertyId,
  tenantId,
  leaseStartDate,
  leaseEndDate,
  renewalStatus = "active",
  noticePeriodDays = 30,
  autoRenew = false,
  notes = "",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");
  if (!tenantId) throw new Error("Missing tenantId");
  if (!leaseStartDate || !leaseEndDate) throw new Error("Lease dates are required");
  const startDate = assertDateOnly(leaseStartDate, "Lease start date must be a valid YYYY-MM-DD date");
  const endDate = assertDateOnly(leaseEndDate, "Lease end date must be a valid YYYY-MM-DD date");
  if (endDate < startDate) throw new Error("Lease end date must be on or after the start date");

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    tenant_id: tenantId,
    lease_start_date: leaseStartDate,
    lease_end_date: leaseEndDate,
    renewal_status: renewalStatus,
    notice_period_days: Number(noticePeriodDays || 30),
    auto_renew: Boolean(autoRenew),
    notes: String(notes || "").trim() || null,
  };

  let query = supabase.from("leases");
  if (id) {
    query = query.update(payload).eq("id", id).eq("account_id", accountId);
  } else {
    query = query.insert(payload);
  }

  const { data, error } = await query.select(`
    id,
    account_id,
    property_id,
    tenant_id,
    lease_start_date,
    lease_end_date,
    renewal_status,
    notice_period_days,
    auto_renew,
    notes,
    created_at,
    updated_at,
    property:properties!leases_property_id_fkey(address),
    tenant:tenants!leases_tenant_id_fkey(name)
  `).single();

  if (error) throw friendly(error, "Failed to save lease");
  return normalizeLease(parseLeaseRow(data));
}

export async function getLeaseSummary(accountId, expiringSoonDays = LEASE_EXPIRING_SOON_DAYS) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .from("leases")
    .select("id, lease_end_date, renewal_status")
    .eq("account_id", accountId);

  if (error && isMissingBackendObject(error)) {
    return {
      total: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      renewalInProgressCount: 0,
    };
  }
  if (error) throw friendly(error, "Failed to load lease summary");

  const summary = {
    total: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    renewalInProgressCount: 0,
  };

  for (const row of data || []) {
    summary.total += 1;
    const derivedStatus = getDerivedLeaseStatus(row, expiringSoonDays);
    if (isExpiringSoonLeaseAlert(row, expiringSoonDays)) summary.expiringSoonCount += 1;
    if (isExpiredLeaseAlert(row, expiringSoonDays)) summary.expiredCount += 1;
    if (derivedStatus === "renewal_in_progress") summary.renewalInProgressCount += 1;
  }

  return summary;
}

export async function getLeaseAttentionItems(
  accountId,
  limit = 10,
  expiringSoonDays = LEASE_EXPIRING_SOON_DAYS,
) {
  if (!accountId) throw new Error("Missing accountId");
  if (!leaseAttentionItemsUnavailable) {
    const { data, error } = await supabase.rpc("lease_attention_items", {
      p_account_id: accountId,
      p_limit: limit,
      p_expiring_days: expiringSoonDays,
    });

    if (error && isMissingBackendObject(error)) {
      leaseAttentionItemsUnavailable = true;
    } else if (error) {
      throw friendly(error, "Failed to load lease attention items");
    } else {
      return parseRpcRows(data || [], parseLeaseAttentionItemRow, "lease attention items");
    }
  }

  const leases = await listLeases({ accountId, limit: Math.max(limit, 20) });
  const items = leases
    .map((row) => {
      if (isExpiredLeaseAlert(row, expiringSoonDays)) {
        return {
          item_key: `lease-expired-${row.id}`,
          item_type: "lease_expired",
          property_label: row.propertyLabel,
          tenant_label: row.tenantLabel,
          lease_end_date: row.lease_end_date,
          days_until_end: row.daysUntilEnd,
          link_path: row.tenant_id ? `/tenants/${row.tenant_id}` : "/tenants",
          sort_order: 10,
        };
      }
      if (row.derivedStatus === "renewal_in_progress") {
        return {
          item_key: `lease-renewal-${row.id}`,
          item_type: "lease_renewal_in_progress",
          property_label: row.propertyLabel,
          tenant_label: row.tenantLabel,
          lease_end_date: row.lease_end_date,
          days_until_end: row.daysUntilEnd,
          link_path: row.tenant_id ? `/tenants/${row.tenant_id}` : "/tenants",
          sort_order: 30,
        };
      }
      if (isExpiringSoonLeaseAlert(row, expiringSoonDays)) {
        return {
          item_key: `lease-expiring-${row.id}`,
          item_type: "lease_expiring_soon",
          property_label: row.propertyLabel,
          tenant_label: row.tenantLabel,
          lease_end_date: row.lease_end_date,
          days_until_end: row.daysUntilEnd,
          link_path: row.tenant_id ? `/tenants/${row.tenant_id}` : "/tenants",
          sort_order: 20,
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sort_order || 99) - Number(b.sort_order || 99))
    .slice(0, limit);

  return items;
}

export async function fetchMyLease(accountId) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("get_my_lease", {
    p_account_id: accountId,
  });

  if (error) throw friendly(error, "Failed to load your lease");
  const rows = parseRpcRows(Array.isArray(data) ? data : (data ? [data] : []), parseMyLeaseRow, "my lease rows");
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    ...row,
    propertyLabel: row.property_address || "—",
    derivedStatus: getDerivedLeaseStatus(row),
    daysUntilEnd: daysBetween(row.lease_end_date, todayDateString()),
  };
}
