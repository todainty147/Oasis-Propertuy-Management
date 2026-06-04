export const HMRC_LIVE_PILOT_BLOCK_REASONS = Object.freeze({
  LIVE_FEATURE_DISABLED: "live_feature_disabled",
  PILOT_FEATURE_DISABLED: "pilot_feature_disabled",
  ACCOUNT_NOT_ALLOWLISTED: "account_not_allowlisted",
  USER_NOT_OWNER_OR_ADMIN: "user_not_owner_or_admin",
  DRAFT_NOT_LOCKED: "draft_not_locked",
  DRAFT_NOT_REVIEWED: "draft_not_reviewed",
  DRAFT_HAS_ISSUES: "draft_has_issues",
  MISSING_CONSENT: "missing_consent",
  STALE_CONSENT: "stale_consent",
  LIVE_CONNECTION_MISSING: "live_connection_missing",
  LIVE_TOKEN_NOT_REFRESHABLE: "live_token_not_refreshable",
  PRODUCTION_BASE_URL_MISSING: "production_base_url_missing",
  SANDBOX_BASE_URL_USED: "sandbox_base_url_used",
  SUPPORT_RUNBOOK_NOT_READY: "support_runbook_not_ready",
  DUPLICATE_LIVE_SUBMISSION: "duplicate_live_submission",
});

const HMRC_PRODUCTION_API_BASE_URL = "https://api.service.hmrc.gov.uk";
const HMRC_SANDBOX_API_BASE_URL = "https://test-api.service.hmrc.gov.uk";

export function evaluateHmrcLivePilotReadiness({
  features = {},
  allowlisted = false,
  userRole = "",
  draft = {},
  unresolvedIssueCount = 0,
  consent = {},
  connection = {},
  hmrcBaseUrl = "",
  supportRunbookReady = false,
} = {}) {
  const blocked = [];
  if (features.hmrc_mtd_live_submission !== true) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.LIVE_FEATURE_DISABLED);
  if (features.hmrc_mtd_live_submission_pilot !== true) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.PILOT_FEATURE_DISABLED);
  if (allowlisted !== true) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.ACCOUNT_NOT_ALLOWLISTED);
  if (!["owner", "admin"].includes(String(userRole || "").toLowerCase())) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.USER_NOT_OWNER_OR_ADMIN);
  if (String(draft?.status || "").toLowerCase() !== "locked") blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.DRAFT_NOT_LOCKED);
  if (!draft?.reviewed_at || !draft?.locked_at) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.DRAFT_NOT_REVIEWED);
  if (Number(unresolvedIssueCount || 0) > 0) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.DRAFT_HAS_ISSUES);
  if (!consent?.consentId) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.MISSING_CONSENT);
  if (consent?.stale === true) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.STALE_CONSENT);
  if (String(connection?.environment || "").toLowerCase() !== "live" || String(connection?.connection_status || "").toLowerCase() !== "connected") {
    blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.LIVE_CONNECTION_MISSING);
  }
  const now = Date.now();
  const accessOk = Boolean(
    connection?.access_token_expires_at
      && new Date(connection.access_token_expires_at).getTime() > now,
  );
  const refreshOk = Boolean(
    connection?.refresh_token_expires_at
      && new Date(connection.refresh_token_expires_at).getTime() > now,
  );
  if (!accessOk && !refreshOk) {
    blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.LIVE_TOKEN_NOT_REFRESHABLE);
  }
  if (!hmrcBaseUrl) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.PRODUCTION_BASE_URL_MISSING);
  else if (hmrcBaseUrl === HMRC_SANDBOX_API_BASE_URL || hmrcBaseUrl !== HMRC_PRODUCTION_API_BASE_URL) {
    blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.SANDBOX_BASE_URL_USED);
  }
  if (supportRunbookReady !== true) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.SUPPORT_RUNBOOK_NOT_READY);
  if (draft?.live_submission_status === "success" || draft?.live_submitted_at) blocked.push(HMRC_LIVE_PILOT_BLOCK_REASONS.DUPLICATE_LIVE_SUBMISSION);

  return {
    allowed: blocked.length === 0,
    blocked,
  };
}
