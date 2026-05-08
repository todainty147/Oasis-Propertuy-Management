import { supabase } from "../lib/supabase";
import { parseLeaseAuditRow, parseLeaseAuditFindingRow, parseRpcRows } from "./rpcContracts";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

const AUDIT_SELECT = [
  "id", "account_id", "lease_id", "status", "overall_risk",
  "summary", "prompt_version", "source_hash", "requested_by",
  "completed_at", "created_at", "updated_at",
].join(", ");

const FINDING_SELECT = [
  "id", "account_id", "lease_audit_id",
  "clause_ref", "clause_text", "risk_level", "category", "explanation",
  "dismissed", "dismissed_by", "dismissed_at", "created_at",
].join(", ");

const VALID_RISK_LEVELS = ["low", "medium", "high", "critical"];
const VALID_AUDIT_STATUSES = ["pending", "processing", "complete", "failed", "stale"];

const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

async function recomputeOverallRisk(accountId, leaseAuditId) {
  const findings = await listLeaseAuditFindings(accountId, leaseAuditId);
  const active = findings.filter((f) => !f.dismissed);
  const highest = active.reduce((best, f) => {
    return (RISK_RANK[f.risk_level] ?? 0) > (RISK_RANK[best] ?? 0) ? f.risk_level : best;
  }, null);

  const { error } = await supabase
    .from("lease_audits")
    .update({ overall_risk: highest, updated_at: new Date().toISOString() })
    .eq("id", leaseAuditId)
    .eq("account_id", accountId);

  if (error && !isMissingBackendObject(error)) throw error;
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

// ── Lease Audits ──────────────────────────────────────────────────────────────

export async function listLatestAuditsByLease(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("get_latest_audits_by_lease", { p_account_id: accountId });

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseLeaseAuditRow, "latest lease audits");
}

export async function listLeaseAudits(accountId, { leaseId = null } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_lease_audits", {
      p_account_id: accountId,
      p_lease_id:   leaseId || null,
    });

  if (error) {
    if (error.code === "PGRST202") return _listLeaseAuditsDirect(accountId, { leaseId });
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseLeaseAuditRow, "lease audits");
}

async function _listLeaseAuditsDirect(accountId, { leaseId = null } = {}) {
  let query = supabase
    .from("lease_audits")
    .select(AUDIT_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (leaseId) query = query.eq("lease_id", leaseId);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseLeaseAuditRow, "lease audits");
}

export async function getLatestLeaseAudit(accountId, leaseId) {
  if (!accountId || !leaseId) return null;

  const { data, error } = await supabase
    .rpc("get_latest_lease_audit", {
      p_account_id: accountId,
      p_lease_id:   leaseId,
    });

  if (error) {
    if (error.code === "PGRST202") return _getLatestLeaseAuditDirect(accountId, leaseId);
    if (error.code === "PGRST116") return null;
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  const rows = data ?? [];
  return rows.length > 0 ? parseLeaseAuditRow(rows[0]) : null;
}

async function _getLatestLeaseAuditDirect(accountId, leaseId) {
  const { data, error } = await supabase
    .from("lease_audits")
    .select(AUDIT_SELECT)
    .eq("account_id", accountId)
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return parseLeaseAuditRow(data);
}

export async function createLeaseAudit(accountId, leaseId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!leaseId) throw new Error("Missing leaseId");

  const { data, error } = await supabase
    .rpc("create_lease_audit", {
      p_account_id: accountId,
      p_lease_id: leaseId,
    })
    .single();

  if (error) throw error;
  return parseLeaseAuditRow(data);
}

export async function updateLeaseAuditStatus(id, accountId, status, { summary = null } = {}) {
  if (!id) throw new Error("Missing audit id");
  if (!accountId) throw new Error("Missing accountId");
  if (!VALID_AUDIT_STATUSES.includes(status)) throw new Error(`Invalid audit status: ${status}`);

  const { data, error } = await supabase
    .rpc("update_lease_audit_status", {
      p_id: id,
      p_account_id: accountId,
      p_status: status,
      p_summary: summary != null ? String(summary).trim() || null : null,
    })
    .single();

  if (error) throw error;
  return parseLeaseAuditRow(data);
}

// ── Lease Audit Findings ──────────────────────────────────────────────────────

export async function listLeaseAuditFindings(accountId, leaseAuditId) {
  if (!accountId || !leaseAuditId) return [];

  const { data, error } = await supabase
    .rpc("list_lease_audit_findings", {
      p_account_id:     accountId,
      p_lease_audit_id: leaseAuditId,
    });

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseLeaseAuditFindingRow, "lease audit findings");
}

export async function createLeaseAuditFinding(accountId, leaseAuditId, {
  clauseRef = null,
  clauseText = null,
  riskLevel = "medium",
  category = null,
  explanation = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!leaseAuditId) throw new Error("Missing leaseAuditId");
  if (!VALID_RISK_LEVELS.includes(riskLevel)) throw new Error(`Invalid risk level: ${riskLevel}`);

  const { data, error } = await supabase
    .rpc("create_lease_audit_finding", {
      p_account_id: accountId,
      p_lease_audit_id: leaseAuditId,
      p_risk_level: riskLevel,
      p_clause_ref: clauseRef?.trim() || null,
      p_clause_text: clauseText?.trim() || null,
      p_category: category?.trim() || null,
      p_explanation: explanation?.trim() || null,
    })
    .single();

  if (error) throw error;
  const finding = parseLeaseAuditFindingRow(data);
  await recomputeOverallRisk(accountId, leaseAuditId);
  return finding;
}

export async function dismissLeaseAuditFinding(id, accountId) {
  if (!id) throw new Error("Missing finding id");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .rpc("dismiss_lease_audit_finding", {
      p_id: id,
      p_account_id: accountId,
    })
    .single();

  if (error) throw error;
  const finding = parseLeaseAuditFindingRow(data);
  await recomputeOverallRisk(accountId, finding.lease_audit_id);
  return finding;
}

export async function restoreLeaseAuditFinding(id, accountId) {
  if (!id) throw new Error("Missing finding id");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .rpc("restore_lease_audit_finding", {
      p_id: id,
      p_account_id: accountId,
    })
    .single();

  if (error) throw error;
  const finding = parseLeaseAuditFindingRow(data);
  await recomputeOverallRisk(accountId, finding.lease_audit_id);
  return finding;
}

export async function deleteLeaseAuditFinding(id, accountId) {
  if (!id) throw new Error("Missing finding id");
  if (!accountId) throw new Error("Missing accountId");

  const { error } = await supabase
    .rpc("delete_lease_audit_finding", {
      p_id: id,
      p_account_id: accountId,
    });

  if (error) throw error;
}

// ── AI lease clause audit ─────────────────────────────────────────────────────

export async function getLeaseExtraction(accountId, leaseId) {
  if (!accountId || !leaseId) return null;

  const { data, error } = await supabase.rpc("get_lease_extraction", {
    p_account_id: accountId,
    p_lease_id:   leaseId,
  });

  if (error) return null;
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  if (rows.length === 0) return null;

  return {
    documentId:     rows[0].document_id,
    documentName:   rows[0].document_name,
    characterCount: rows[0].character_count,
    extractor:      rows[0].extractor,
    completedAt:    rows[0].completed_at,
  };
}

export async function generateLeaseClauseAudit(accountId, leaseId, leaseAuditId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!leaseId)   throw new Error("Missing leaseId");
  if (!leaseAuditId) throw new Error("Missing leaseAuditId");

  const { data, error } = await supabase.functions.invoke("generate-lease-clause-audit", {
    body: { accountId, leaseId, leaseAuditId },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status:  error?.context?.status || null,
      surface: "generate_lease_clause_audit",
      fallback: error.message || "Could not generate lease clause audit",
      entityType: "lease",
      entityId: leaseId,
      accountId,
    });
    logSecurityRelevantFailure("generate_lease_clause_audit", {
      error: wrapped,
      context: { accountId, leaseId, leaseAuditId },
    });
    throw wrapped;
  }

  return data;
}
