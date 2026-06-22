import {
  admin,
  HMRC_BASE_URL,
  HMRC_ENVIRONMENT,
  HttpError,
} from "./hmrcEdge.ts";
import { assertHmrcLiveSubmissionConsent } from "./hmrcLiveSubmissionConsent.ts";

const HMRC_PRODUCTION_API_BASE_URL = "https://api.service.hmrc.gov.uk";
const HMRC_SANDBOX_API_BASE_URL = "https://test-api.service.hmrc.gov.uk";

export async function assertHmrcLiveSubmissionPilotAllowed({
  accountId,
  draftId,
  userId,
  consentId,
  supportRunbookReady = false,
}: {
  accountId: string;
  draftId: string;
  userId: string;
  consentId?: string | null;
  supportRunbookReady?: boolean;
}) {
  if (!accountId) throw new HttpError("Missing account id.", 400);
  if (!draftId) throw new HttpError("Missing quarterly draft id.", 400);
  if (!userId) throw new HttpError("Missing authenticated user id.", 401);
  if (!consentId) throw new HttpError("Explicit landlord consent is required before live HMRC submission.", 403);

  const member = await getAccountMember(accountId, userId);
  if (!["owner", "admin"].includes(String(member?.role || "").toLowerCase())) {
    await auditPilotBlock(accountId, userId, "owner_or_admin_required");
    throw new HttpError("Only account owners and admins can use the live HMRC pilot pre-flight.", 403);
  }

  const liveFeatureEnabled = await checkFeature(accountId, "hmrc_mtd_live_submission");
  if (!liveFeatureEnabled) {
    await auditPilotBlock(accountId, userId, "live_feature_disabled");
    throw new HttpError("Live HMRC pilot feature is disabled for this account.", 403);
  }

  const pilotFeatureEnabled = await checkFeature(accountId, "hmrc_mtd_live_submission_pilot");
  if (!pilotFeatureEnabled) {
    await auditPilotBlock(accountId, userId, "live_pilot_feature_disabled");
    throw new HttpError("Live HMRC pilot feature is disabled for this account.", 403);
  }

  const allowlist = await getAllowlist(accountId);
  if (!allowlist?.enabled) {
    await auditPilotBlock(accountId, userId, "account_not_allowlisted");
    throw new HttpError("Live HMRC submission is not available for this account.", 403);
  }

  if (HMRC_ENVIRONMENT !== "live") {
    await auditPilotBlock(accountId, userId, "sandbox_environment");
    throw new HttpError("Live HMRC pilot pre-flight cannot run in the sandbox environment.", 403);
  }

  if (!HMRC_BASE_URL || HMRC_BASE_URL === HMRC_SANDBOX_API_BASE_URL || HMRC_BASE_URL !== HMRC_PRODUCTION_API_BASE_URL) {
    await auditPilotBlock(accountId, userId, "production_base_url_not_configured");
    throw new HttpError("Production HMRC base URL is not explicitly configured for live pilot.", 500);
  }

  const draft = await getDraft(accountId, draftId);
  if (!draft) throw new HttpError("The quarterly draft was not found. It may have been deleted.", 404);
  if (draft.live_submission_status === "success" || draft.live_submitted_at) {
    await auditPilotBlock(accountId, userId, "duplicate_successful_live_submission");
    throw new HttpError("This quarterly draft already has a successful live submission.", 409);
  }
  if (draft.status !== "locked" || !draft.reviewed_at || !draft.locked_at) {
    await auditPilotBlock(accountId, userId, "draft_not_reviewed_and_locked");
    throw new HttpError("Review and lock this quarterly draft before live HMRC pilot pre-flight.", 409);
  }
  if (countUnresolvedIssues(draft) > 0) {
    await auditPilotBlock(accountId, userId, "draft_has_unresolved_issues");
    throw new HttpError("Resolve or exclude draft issues before live HMRC pilot pre-flight.", 409);
  }
  if (draft.accounting_type_review_required === true) {
    await auditPilotBlock(accountId, userId, "accounting_type_review_required");
    throw new HttpError("HMRC accounting type changed after this draft was prepared. Review and revalidate the draft before live pilot submission.", 409);
  }

  const consent = await assertHmrcLiveSubmissionConsent({ accountId, draftId, userId, consentId });
  if (String(consent.consentedBy || "") !== userId) {
    await auditPilotBlock(accountId, userId, "consent_user_mismatch");
    throw new HttpError("The live HMRC consent belongs to a different user.", 403);
  }

  const connection = await getLiveConnection(accountId);
  if (!connection || String(connection.connection_status || "").toLowerCase() !== "connected") {
    await auditPilotBlock(accountId, userId, "live_connection_missing");
    throw new HttpError("A live HMRC connection is required before pilot pre-flight.", 403);
  }
  if (!hasValidOrRefreshableToken(connection)) {
    await auditPilotBlock(accountId, userId, "live_token_not_refreshable");
    throw new HttpError("The live HMRC token is missing or cannot be refreshed.", 403);
  }

  if (supportRunbookReady !== true) {
    await auditPilotBlock(accountId, userId, "support_runbook_not_ready");
    throw new HttpError("Support runbook evidence is required before live HMRC pilot pre-flight.", 403);
  }

  await auditPilotSuccess(accountId, userId, draftId, consentId);

  return {
    accountId,
    draftId,
    consentId: consent.consentId,
    pilotAllowed: true,
  };
}

async function getAccountMember(accountId: string, userId: string) {
  const { data, error } = await admin
    .from("account_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function checkFeature(accountId: string, feature: string) {
  const { data, error } = await admin.rpc("account_has_feature", {
    p_account_id: accountId,
    p_feature: feature,
  });
  if (error) throw error;
  return data === true;
}

async function getAllowlist(accountId: string) {
  const { data, error } = await admin
    .from("hmrc_live_submission_pilot_accounts")
    .select("enabled, enabled_at")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getDraft(accountId: string, draftId: string) {
  const { data, error } = await admin
    .from("mtd_quarterly_update_drafts")
    .select("id, account_id, status, reviewed_at, locked_at, validation_summary, live_submission_status, live_submitted_at, accounting_type_review_required")
    .eq("id", draftId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLiveConnection(accountId: string) {
  const { data, error } = await admin
    .from("hmrc_connections")
    .select("connection_status, environment, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at")
    .eq("account_id", accountId)
    .eq("environment", "live")
    .maybeSingle();
  if (error) throw error;
  return data;
}

function countUnresolvedIssues(draft: { validation_summary?: Record<string, unknown> | null }) {
  return Number(draft?.validation_summary?.issueCount || draft?.validation_summary?.unresolvedIssueCount || 0);
}

function hasValidOrRefreshableToken(connection: {
  access_token_ciphertext?: string | null;
  refresh_token_ciphertext?: string | null;
  access_token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
}) {
  const now = Date.now();
  const accessValid = Boolean(
    connection.access_token_ciphertext
      && connection.access_token_expires_at
      && new Date(connection.access_token_expires_at).getTime() > now,
  );
  const refreshable = Boolean(
    connection.refresh_token_ciphertext
      && connection.refresh_token_expires_at
      && new Date(connection.refresh_token_expires_at).getTime() > now,
  );
  return accessValid || refreshable;
}

async function auditPilotBlock(accountId: string, userId: string, reason: string) {
  try {
    const { error } = await admin.from("hmrc_api_audit_log").insert({
      account_id: accountId,
      user_id: userId || null,
      environment: "live",
      action: "live_pilot_blocked",
      status: "blocked",
      error_message: reason,
      request_summary: { reason },
    });
    if (error) {
      console.warn("[hmrc-live-pilot] audit block insert failed", {
        accountId,
        reason,
        message: error.message,
      });
    }
  } catch (error) {
    console.warn("[hmrc-live-pilot] audit block insert failed", {
      accountId,
      reason,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function auditPilotSuccess(accountId: string, userId: string, draftId: string, consentId?: string | null) {
  try {
    const { error } = await admin.from("hmrc_api_audit_log").insert({
      account_id: accountId,
      user_id: userId,
      environment: "live",
      action: "live_pilot_checked",
      status: "success",
      request_summary: { draftId, consentId },
      response_summary: { pilotAllowed: true },
    });
    if (error) {
      console.warn("[hmrc-live-pilot] success audit insert failed", {
        accountId,
        draftId,
        message: error.message,
      });
    }
  } catch (error) {
    console.warn("[hmrc-live-pilot] success audit insert failed", {
      accountId,
      draftId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
