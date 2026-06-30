import { supabase } from "../lib/supabase";

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

export async function createRegulatoryChangeCandidate({
  accountId,
  sourceTitle,
  sourceUrl = null,
  sourceRetrievedAt = null,
  sourceHash = null,
  candidateSummary,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!sourceTitle) throw new Error("Missing sourceTitle");
  if (!candidateSummary) throw new Error("Missing candidateSummary");

  const { data, error } = await supabase.rpc("create_regulatory_change_candidate", {
    p_account_id: accountId,
    p_source_title: sourceTitle,
    p_source_url: sourceUrl,
    p_source_retrieved_at: sourceRetrievedAt,
    p_source_hash: sourceHash,
    p_candidate_summary: candidateSummary,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to create regulatory change candidate");
  return data ?? null;
}

export async function triageRegulatoryChangeCandidate({
  candidateId,
  reviewNotes = null,
} = {}) {
  if (!candidateId) throw new Error("Missing candidateId");

  const { data, error } = await supabase.rpc("triage_regulatory_change_candidate", {
    p_candidate_id: candidateId,
    p_review_notes: reviewNotes,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to triage regulatory change candidate");
  return data ?? null;
}

export async function markCandidateNeedsLegalReview({
  candidateId,
  reviewNotes = null,
} = {}) {
  if (!candidateId) throw new Error("Missing candidateId");

  const { data, error } = await supabase.rpc("mark_candidate_needs_legal_review", {
    p_candidate_id: candidateId,
    p_review_notes: reviewNotes,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to mark candidate for legal review");
  return data ?? null;
}

export async function rejectRegulatoryChangeCandidate({
  candidateId,
  reviewNotes,
} = {}) {
  if (!candidateId) throw new Error("Missing candidateId");
  if (!reviewNotes) throw new Error("Missing reviewNotes");

  const { data, error } = await supabase.rpc("reject_regulatory_change_candidate", {
    p_candidate_id: candidateId,
    p_review_notes: reviewNotes,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to reject regulatory change candidate");
  return data ?? null;
}

export async function approveRegulatoryChangeGateA({
  candidateId,
  regulationKey,
  version,
  title,
  jurisdiction,
  effectiveFrom,
  effectiveDate = null,
  deadlineDate = null,
  category = null,
  legalStatus = "gate_a_verified",
  penaltyCeilingGbp = null,
  notes = null,
} = {}) {
  if (!candidateId) throw new Error("Missing candidateId");
  if (!regulationKey) throw new Error("Missing regulationKey");
  if (!version) throw new Error("Missing version");
  if (!title) throw new Error("Missing title");
  if (!jurisdiction) throw new Error("Missing jurisdiction");
  if (!effectiveFrom) throw new Error("Missing effectiveFrom");

  const { data, error } = await supabase.rpc("approve_regulatory_change_gate_a", {
    p_candidate_id: candidateId,
    p_regulation_key: regulationKey,
    p_version: version,
    p_title: title,
    p_jurisdiction: jurisdiction,
    p_effective_from: effectiveFrom,
    p_effective_date: effectiveDate,
    p_deadline_date: deadlineDate,
    p_category: category,
    p_legal_status: legalStatus,
    p_penalty_ceiling_gbp: penaltyCeilingGbp,
    p_notes: notes,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to approve regulatory change at Gate A");
  return data ?? null;
}

export async function approveImpactRuleGateB({
  regulatoryChangeId,
  ruleKey,
  version,
  predicateRef,
  title,
  resultDomain = ["affected", "not_affected", "deferred", "needs_data"],
  evidenceRequirement = {},
  deferralLogic = {},
  legalSourceRef = null,
  ruleMetadata = {},
} = {}) {
  if (!regulatoryChangeId) throw new Error("Missing regulatoryChangeId");
  if (!ruleKey) throw new Error("Missing ruleKey");
  if (!version) throw new Error("Missing version");
  if (!predicateRef) throw new Error("Missing predicateRef");
  if (!title) throw new Error("Missing title");

  const { data, error } = await supabase.rpc("approve_impact_rule_gate_b", {
    p_regulatory_change_id: regulatoryChangeId,
    p_rule_key: ruleKey,
    p_version: version,
    p_predicate_ref: predicateRef,
    p_title: title,
    p_result_domain: resultDomain,
    p_evidence_requirement: evidenceRequirement,
    p_deferral_logic: deferralLogic,
    p_legal_source_ref: legalSourceRef,
    p_rule_metadata: ruleMetadata,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to approve impact rule at Gate B");
  return data ?? null;
}

export async function listRegulatoryChangeCandidates({
  accountId,
  status = null,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("list_regulatory_change_candidates", {
    p_account_id: accountId,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw friendly(error, "Failed to list regulatory change candidates");
  return data ?? [];
}

export async function listRegulatorySources({
  accountId,
  status = null,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("list_regulatory_sources", {
    p_account_id: accountId,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw friendly(error, "Failed to list regulatory sources");
  return data ?? [];
}

export async function checkRegulatorySource({
  sourceId,
} = {}) {
  if (!sourceId) throw new Error("Missing sourceId");

  const { data, error } = await supabase.functions.invoke("check-regulatory-source", {
    body: { sourceId },
  });

  if (error) throw friendly(error, "Failed to check regulatory source");
  return data ?? null;
}
