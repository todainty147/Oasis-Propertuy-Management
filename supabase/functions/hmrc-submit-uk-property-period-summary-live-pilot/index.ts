import {
  admin,
  auditHmrcEvent,
  decryptConnectionAccessToken,
  handleOptions,
  HMRC_BASE_URL,
  HMRC_ENVIRONMENT,
  HMRC_LIVE_SUBMISSION_ENV,
  HttpError,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { assertHmrcLiveSubmissionPilotAllowed } from "../_shared/hmrcLiveSubmissionPilot.ts";
import { buildPropertyBusinessReadPath, HMRC_ACCEPT_HEADERS, maskNino, safeTaxYear } from "../_shared/hmrcMtdReadOnly.ts";
import { buildUkPropertyPeriodSummaryPayload } from "../_shared/hmrcUkPropertyPeriodSummaryPayloadBuilder.ts";

const HMRC_PRODUCTION_API_BASE_URL = "https://api.service.hmrc.gov.uk";
const HMRC_LIVE_NETWORK_ENABLED = Deno.env.get("HMRC_LIVE_NETWORK_ENABLED") || "false";
const HMRC_LIVE_SUBMISSION_ENABLED = Deno.env.get("HMRC_LIVE_SUBMISSION_ENABLED") || HMRC_LIVE_SUBMISSION_ENV;

const DRAFT_SELECT = [
  "id", "account_id", "tax_year", "period_label", "period_start", "period_end",
  "property_business_id", "income_source_id", "hmrc_connection_id", "status",
  "source_summary", "category_totals", "validation_summary", "payload_preview",
  "live_submission_status", "live_submitted_at", "live_submission_attempt_id", "updated_at",
].join(", ");

const LINE_SELECT = [
  "id", "account_id", "draft_id", "source_type", "source_table", "source_id",
  "property_id", "transaction_date", "description", "amount", "direction",
  "tenaqo_category", "mtd_category", "hmrc_category_key", "include_in_draft",
  "issue_status", "issue_reason", "evidence_status", "created_at",
].join(", ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  let accountId = "";
  let draftId = "";
  let attemptId = "";
  let userId = "";
  let consentId = "";

  try {
    const user = await requireUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({}));
    accountId = String(body.account_id || body.accountId || "").trim();
    draftId = String(body.draft_id || body.draftId || "").trim();
    consentId = String(body.consent_id || body.consentId || "").trim();
    const mode = normalizeMode(body.mode);

    if (!accountId) throw new HttpError("Missing account id.", 400);
    if (!draftId) throw new HttpError("Missing quarterly draft id.", 400);
    if (!consentId) throw new HttpError("Explicit landlord consent is required before live HMRC dry run.", 403);
    if (body.confirmLivePilot !== true) {
      throw new HttpError("Confirm this is a controlled live pilot dry run before continuing.", 400);
    }
    if (mode === "live_network") {
      assertLiveNetworkOperatorConfirmation(body);
    }

    await assertHmrcLiveSubmissionPilotAllowed({
      accountId,
      draftId,
      userId,
      consentId,
      supportRunbookReady: body.supportRunbookReady === true,
    });
    if (mode === "dry_run") {
      await assertDryRunFeatureEnabled(accountId);
    }
    if (mode === "live_network") {
      await assertLiveNetworkOperator(accountId, draftId, userId, consentId);
      await assertNoExistingLiveAttempt(accountId, draftId);
      await assertPhase5DLivePilotEvidence(accountId, draftId, consentId);
    }

    const { draft, lines } = await loadDraft(accountId, draftId);
    const connection = await loadLiveConnection(accountId);
    const identifiers = resolveLiveIdentifiers(draft, connection);
    const taxYear = safeTaxYear(draft.tax_year || identifiers.taxYear || "");
    const payloadResult = buildUkPropertyPeriodSummaryPayload({
      draft: { ...draft, tax_year: taxYear },
      lines,
      nino: identifiers.nino,
      businessId: identifiers.businessId,
    });

    attemptId = await createLiveAttempt({
      accountId,
      draft,
      consentId,
      connection,
      mode,
      identifiers,
      payloadSummary: {
        ...payloadResult.payloadSummary,
        previewOnly: true,
        submissionMode: mode,
      },
      userId,
      status: payloadResult.validationIssues.length ? "validation_failed" : "started",
      errorMessage: payloadResult.validationIssues.join(" ") || null,
    });

    if (payloadResult.validationIssues.length) {
      await writeLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_submission_blocked",
        metadata: { reason: "validation_failed", validationIssues: payloadResult.validationIssues },
      });
      return json(req, {
        status: "validation_failed",
        attemptId,
        message: "Live submission dry run validation failed. No data was sent to HMRC.",
        safeSummary: { validationIssues: payloadResult.validationIssues },
      }, 400);
    }

    if (mode === "dry_run") {
      await writeLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_dry_run_started",
        metadata: { mode },
      });
      const safeSummary = {
        dryRun: true,
        networkCallMade: false,
        payloadReady: true,
        includedLineCount: payloadResult.payloadSummary.included_line_count,
        issueCount: payloadResult.payloadSummary.issue_count,
      };
      await completeLiveAttempt(attemptId, accountId, {
        status: "dry_run_passed",
        responseSummary: safeSummary,
      });
      await recordPilotEvidencePassed(accountId, draftId, userId, "dry_run_passed", {
        attemptId,
        consentId,
        networkCallMade: false,
      });
      await writeLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_dry_run_passed",
        metadata: safeSummary,
      });
      return json(req, {
        status: "dry_run_passed",
        attemptId,
        message: "Live submission dry run passed. No data was sent to HMRC.",
        safeSummary,
      });
    }

    await assertLiveNetworkDuplicateClear(accountId, draftId, attemptId, userId, consentId);
    await assertNetworkFeatureEnabled(accountId);
    await assertLiveNetworkKillSwitchEnabled({ accountId, draftId, attemptId, consentId, userId });

    await writeLiveEvent(accountId, {
      draftId,
      attemptId,
      consentId,
      userId,
      eventType: "live_network_submission_started",
      metadata: { mode },
    });

    const endpointPath = buildPropertyBusinessReadPath(identifiers.nino, identifiers.businessId, taxYear, "uk-property");
    const response = await performLiveNetworkSubmission({
      accountId,
      connection,
      endpointPath,
      payload: payloadResult.payload,
    });

    if (!response.ok) {
      const summary = safeLiveFailureSummary(response);
      await completeLiveAttempt(attemptId, accountId, {
        status: "failed",
        responseSummary: summary,
        httpStatus: response.status,
        correlationId: response.correlationId,
        errorCode: response.errorCode,
        errorMessage: response.message,
      });
      await writeLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_network_submission_failed",
        metadata: summary,
      });
      return json(req, {
        status: "failed",
        attemptId,
        hmrcCorrelationId: response.correlationId,
        hmrcHttpStatus: response.status,
        safeSummary: summary,
      }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }

    const readBack = await safeReadBackAfterLiveAccepted({
      accountId,
      connection,
      endpointPath,
      userId,
      draftId,
      attemptId,
      consentId,
    });
    const safeSummary = {
      accepted: true,
      message: "HMRC accepted this update. No submission ID was returned by this endpoint.",
      responseKeys: Object.keys(response.body || {}).slice(0, 10),
      noSubmissionIdReturned: true,
      readBack: readBack.status,
    };
    try {
      await completeLiveAttempt(attemptId, accountId, {
        status: "success",
        responseSummary: safeSummary,
        httpStatus: response.status,
        correlationId: response.correlationId,
      });
      await markDraftLiveSubmitted(accountId, draftId, attemptId);
      await safeWriteLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_network_submission_success",
        metadata: safeSummary,
      });
    } catch (localWriteError) {
      const localWriteSummary = {
        ...safeSummary,
        localSuccessWriteFailed: true,
        operatorRecoveryRequired: true,
        recoveryMessage: "HMRC accepted the update, but Tenaqo could not finish the local success write. Do not retry blindly.",
      };
      await safeWriteLiveEvent(accountId, {
        draftId,
        attemptId,
        consentId,
        userId,
        eventType: "live_network_local_write_failed",
        metadata: {
          ...localWriteSummary,
          message: localWriteError instanceof Error ? localWriteError.message : "Local success write failed",
        },
      });
      return json(req, {
        status: "accepted_local_write_failed",
        attemptId,
        hmrcCorrelationId: response.correlationId,
        hmrcHttpStatus: response.status,
        message: localWriteSummary.recoveryMessage,
        safeSummary: localWriteSummary,
      }, 202);
    }
    return json(req, {
      status: "success",
      attemptId,
      hmrcCorrelationId: response.correlationId,
      hmrcHttpStatus: response.status,
      message: readBack.status === "succeeded"
        ? "Live pilot quarterly update was accepted by HMRC and read-back verification succeeded."
        : "Live pilot quarterly update was accepted by HMRC. Read-back verification did not complete.",
      safeSummary,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    if (accountId) {
      await auditHmrcEvent({
        accountId,
        userId,
        action: "hmrc.submit_uk_property_period_summary_live_pilot",
        status: status === 403 || status === 409 ? "blocked" : "failed",
        errorMessage: error instanceof Error ? error.message : "Live pilot submission blocked",
      }).catch(() => {});
      if (draftId) {
        await safeWriteLiveEvent(accountId, {
          draftId,
          attemptId,
          consentId,
          userId,
          eventType: "live_submission_blocked",
          metadata: { reason: error instanceof Error ? error.message : "blocked" },
        });
      }
    }
    return safeHmrcError(req, error, status, "Could not run HMRC live pilot dry run", {
      functionName: "hmrc-submit-uk-property-period-summary-live-pilot",
    });
  }
});

export function assertHmrcLiveNetworkEnabled() {
  if (HMRC_LIVE_NETWORK_ENABLED !== "true") throw new HttpError("live_network_disabled", 403);
  if (HMRC_ENVIRONMENT !== "live") throw new HttpError("live_network_disabled", 403);
  if (HMRC_BASE_URL !== HMRC_PRODUCTION_API_BASE_URL) throw new HttpError("live_network_disabled", 403);
  if (String(HMRC_LIVE_SUBMISSION_ENABLED).toLowerCase() !== "true") throw new HttpError("live_network_disabled", 403);
}

async function assertDryRunFeatureEnabled(accountId: string) {
  const { data, error } = await admin.rpc("account_has_feature", {
    p_account_id: accountId,
    p_feature: "hmrc_mtd_live_submission_dry_run",
  });
  if (error) throw error;
  if (data !== true) throw new HttpError("Live HMRC dry run is disabled for this account.", 403);
}

async function assertNetworkFeatureEnabled(accountId: string) {
  const { data, error } = await admin.rpc("account_has_feature", {
    p_account_id: accountId,
    p_feature: "hmrc_mtd_live_submission_network_enabled",
  });
  if (error) throw error;
  if (data !== true) throw new HttpError("live_network_disabled", 403);
}

async function assertLiveNetworkKillSwitchEnabled(args: {
  accountId: string;
  draftId: string;
  attemptId: string;
  consentId: string;
  userId: string;
}) {
  try {
    assertHmrcLiveNetworkEnabled();
    await safeWriteLiveEvent(args.accountId, {
      draftId: args.draftId,
      attemptId: args.attemptId,
      consentId: args.consentId,
      userId: args.userId,
      eventType: "live_operator_kill_switch_checked",
      metadata: { networkEnabled: true },
    });
  } catch (error) {
    await safeWriteLiveEvent(args.accountId, {
      draftId: args.draftId,
      attemptId: args.attemptId,
      consentId: args.consentId,
      userId: args.userId,
      eventType: "live_operator_kill_switch_checked",
      metadata: { networkEnabled: false, reason: "live_network_disabled" },
    });
    await safeWriteLiveEvent(args.accountId, {
      draftId: args.draftId,
      attemptId: args.attemptId,
      consentId: args.consentId,
      userId: args.userId,
      eventType: "live_submission_blocked",
      metadata: { reason: "live_network_disabled" },
    });
    throw error;
  }
}

function normalizeMode(value: unknown) {
  const mode = String(value || "dry_run").trim();
  if (mode !== "dry_run" && mode !== "live_network") {
    throw new HttpError("Unsupported live pilot mode.", 400);
  }
  return mode;
}

function assertLiveNetworkOperatorConfirmation(body: Record<string, unknown>) {
  if (String(body.typedConfirmation || "").trim() !== "LIVE PILOT") {
    throw new HttpError("Type LIVE PILOT to confirm the one-account live network pilot.", 400);
  }
  if (body.confirmLiveNetworkSubmission !== true) {
    throw new HttpError("Confirm that this sends a live MTD quarterly update to HMRC for the pilot account.", 400);
  }
}

async function assertLiveNetworkOperator(accountId: string, draftId: string, userId: string, consentId: string) {
  const { data, error } = await admin.rpc("hmrc_user_is_root_operator", {
    p_user_id: userId,
  });
  if (error) throw error;
  if (data !== true) {
    await safeWriteLiveEvent(accountId, {
      draftId,
      consentId,
      userId,
      eventType: "live_submission_blocked",
      metadata: { reason: "root_operator_required" },
    });
    throw new HttpError("Only a Tenaqo root operator can trigger the one-account live network pilot.", 403);
  }
}

async function assertNoExistingLiveAttempt(accountId: string, draftId: string) {
  const { data: draft, error: draftError } = await admin
    .from("mtd_quarterly_update_drafts")
    .select("live_submission_status, live_submitted_at")
    .eq("id", draftId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (draftError) throw draftError;
  if (draft?.live_submitted_at || draft?.live_submission_status === "success") {
    throw new HttpError("duplicate_live_submission", 409);
  }

  const { data, error } = await admin
    .from("hmrc_live_submission_attempts")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("draft_id", draftId)
    .eq("mode", "live_network")
    .in("status", ["started", "success"])
    .limit(1);
  if (error) throw error;
  if ((data || []).length > 0) {
    throw new HttpError("duplicate_live_submission", 409);
  }
}

async function assertPhase5DLivePilotEvidence(accountId: string, draftId: string, consentId: string) {
  await assertDryRunPassedForDraftConsent(accountId, draftId, consentId);
  await assertPilotEvidencePassed(accountId, draftId, "dry_run_passed");
  await assertPilotEvidencePassed(accountId, draftId, "support_runbook_reviewed");
  await assertPilotEvidencePassed(accountId, draftId, "rollback_verified");
  await assertPilotEvidencePassed(accountId, draftId, "operator_approval");
}

async function assertDryRunPassedForDraftConsent(accountId: string, draftId: string, consentId: string) {
  const { data, error } = await admin
    .from("hmrc_live_submission_attempts")
    .select("id")
    .eq("account_id", accountId)
    .eq("draft_id", draftId)
    .eq("consent_id", consentId)
    .eq("mode", "dry_run")
    .eq("status", "dry_run_passed")
    .limit(1);
  if (error) throw error;
  if ((data || []).length === 0) {
    throw new HttpError("A passed dry-run for this draft and consent is required before live network submission.", 403);
  }
}

async function assertPilotEvidencePassed(accountId: string, draftId: string, evidenceType: string) {
  const { data, error } = await admin
    .from("hmrc_live_pilot_evidence")
    .select("id, draft_id, evidence_status")
    .eq("account_id", accountId)
    .eq("evidence_type", evidenceType)
    .eq("evidence_status", "passed")
    .or(`draft_id.is.null,draft_id.eq.${draftId}`)
    .limit(1);
  if (error) throw error;
  if ((data || []).length === 0) {
    throw new HttpError(`Required live pilot evidence is missing: ${evidenceType}.`, 403);
  }
}

async function loadDraft(accountId: string, draftId: string) {
  const { data: draft, error } = await admin
    .from("mtd_quarterly_update_drafts")
    .select(DRAFT_SELECT)
    .eq("id", draftId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!draft) throw new HttpError("Quarterly draft not found.", 404);
  const { data: lines, error: lineError } = await admin
    .from("mtd_quarterly_update_draft_lines")
    .select(LINE_SELECT)
    .eq("draft_id", draftId)
    .eq("account_id", accountId)
    .order("transaction_date", { ascending: true });
  if (lineError) throw lineError;
  return {
    draft: draft as unknown as Record<string, unknown>,
    lines: (lines || []) as unknown as Record<string, unknown>[],
  };
}

async function loadLiveConnection(accountId: string) {
  const { data, error } = await admin
    .from("hmrc_connections")
    .select("id, account_id, environment, connection_status, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at, metadata")
    .eq("account_id", accountId)
    .eq("environment", "live")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("A live HMRC connection is required before pilot dry run.", 403);
  return data as Record<string, unknown>;
}

function resolveLiveIdentifiers(draft: Record<string, unknown>, connection: Record<string, unknown>) {
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const liveProfile = metadata.live_profile && typeof metadata.live_profile === "object"
    ? metadata.live_profile as Record<string, unknown>
    : {};
  const nino = String(liveProfile.nino || metadata.nino || "").trim();
  const businessId = String(draft.property_business_id || draft.income_source_id || liveProfile.income_source_id || liveProfile.business_id || "").trim();
  return {
    nino,
    businessId,
    taxYear: String(liveProfile.tax_year || "").trim(),
  };
}

async function createLiveAttempt({
  accountId,
  draft,
  consentId,
  connection,
  mode,
  identifiers,
  payloadSummary,
  userId,
  status,
  errorMessage = null,
}: {
  accountId: string;
  draft: Record<string, unknown>;
  consentId: string;
  connection: Record<string, unknown>;
  mode: string;
  identifiers: { nino: string; businessId: string };
  payloadSummary: Record<string, unknown>;
  userId: string;
  status: string;
  errorMessage?: string | null;
}) {
  const { data, error } = await admin
    .from("hmrc_live_submission_attempts")
    .insert({
      account_id: accountId,
      draft_id: draft.id,
      consent_id: consentId,
      hmrc_connection_id: connection.id || null,
      environment: "live",
      mode,
      submission_type: "uk_property_period_summary",
      status,
      nino_masked: identifiers.nino ? maskNino(identifiers.nino) : null,
      business_id: identifiers.businessId || null,
      tax_year: draft.tax_year || null,
      period_start: draft.period_start || null,
      period_end: draft.period_end || null,
      request_payload_summary: payloadSummary,
      hmrc_error_message: errorMessage,
      submitted_by: userId,
      completed_at: ["validation_failed", "blocked"].includes(status) ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

async function completeLiveAttempt(attemptId: string, accountId: string, {
  status,
  responseSummary = {},
  httpStatus = null,
  correlationId = null,
  errorCode = null,
  errorMessage = null,
}: {
  status: string;
  responseSummary?: Record<string, unknown>;
  httpStatus?: number | null;
  correlationId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { error } = await admin
    .from("hmrc_live_submission_attempts")
    .update({
      status,
      response_summary: responseSummary,
      hmrc_http_status: httpStatus,
      hmrc_correlation_id: correlationId,
      hmrc_error_code: errorCode,
      hmrc_error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("account_id", accountId);
  if (error) throw error;
}

async function recordPilotEvidencePassed(
  accountId: string,
  draftId: string,
  userId: string,
  evidenceType: string,
  evidenceSummary: Record<string, unknown>,
) {
  const { error } = await admin
    .from("hmrc_live_pilot_evidence")
    .insert({
      account_id: accountId,
      draft_id: draftId,
      evidence_type: evidenceType,
      evidence_status: "passed",
      evidence_summary: evidenceSummary,
      recorded_by: userId || null,
    });
  if (error) {
    console.warn("[hmrc-live-pilot] evidence insert failed", {
      accountId,
      draftId,
      evidenceType,
      message: error.message,
    });
  }
}

async function assertLiveNetworkDuplicateClear(accountId: string, draftId: string, attemptId: string, userId: string, consentId: string) {
  const { data: draft, error: draftError } = await admin
    .from("mtd_quarterly_update_drafts")
    .select("live_submission_status, live_submitted_at")
    .eq("id", draftId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (draftError) throw draftError;
  const { data: existing, error } = await admin
    .from("hmrc_live_submission_attempts")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("draft_id", draftId)
    .eq("mode", "live_network")
    .in("status", ["started", "success"])
    .neq("id", attemptId)
    .limit(1);
  if (error) throw error;
  if (draft?.live_submitted_at || draft?.live_submission_status === "success" || (existing || []).length > 0) {
    await writeLiveEvent(accountId, {
      draftId,
      attemptId,
      consentId,
      userId,
      eventType: "live_duplicate_blocked",
      metadata: { reason: "duplicate_live_submission" },
    });
    throw new HttpError("duplicate_live_submission", 409);
  }
}

async function safeReadBackAfterLiveAccepted({
  accountId,
  connection,
  endpointPath,
  userId,
  draftId,
  attemptId,
  consentId,
}: {
  accountId: string;
  connection: Record<string, unknown>;
  endpointPath: string;
  userId: string;
  draftId: string;
  attemptId: string;
  consentId: string;
}) {
  try {
    const accessToken = await decryptConnectionAccessToken(connection);
    const response = await fetch(`${HMRC_BASE_URL}${endpointPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
      },
    });
    if (response.ok) return { status: "succeeded" };
    await safeWriteLiveEvent(accountId, {
      draftId,
      attemptId,
      consentId,
      userId,
      eventType: "live_network_readback_failed",
      metadata: { httpStatus: response.status },
    });
    return { status: "failed" };
  } catch (error) {
    await safeWriteLiveEvent(accountId, {
      draftId,
      attemptId,
      consentId,
      userId,
      eventType: "live_network_readback_failed",
      metadata: { message: error instanceof Error ? error.message : "Read-back failed" },
    });
    return { status: "failed" };
  }
}

async function performLiveNetworkSubmission({
  connection,
  endpointPath,
  payload,
}: {
  accountId: string;
  connection: Record<string, unknown>;
  endpointPath: string;
  payload: Record<string, unknown>;
}) {
  const accessToken = await decryptConnectionAccessToken(connection);
  const response = await fetch(`${HMRC_BASE_URL}${endpointPath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    body,
    correlationId: response.headers.get("x-correlation-id") || response.headers.get("X-Correlation-ID") || null,
    errorCode: typeof body?.code === "string" ? body.code : null,
    message: typeof body?.message === "string" ? body.message : response.ok ? "Accepted" : "HMRC live request failed.",
  };
}

function safeLiveFailureSummary(response: Awaited<ReturnType<typeof performLiveNetworkSubmission>>) {
  return {
    ok: false,
    httpStatus: response.status,
    hmrcCode: response.errorCode,
    message: response.message,
  };
}

async function markDraftLiveSubmitted(accountId: string, draftId: string, attemptId: string) {
  const { error } = await admin
    .from("mtd_quarterly_update_drafts")
    .update({
      live_submission_status: "success",
      live_submitted_at: new Date().toISOString(),
      live_submission_attempt_id: attemptId,
    })
    .eq("id", draftId)
    .eq("account_id", accountId);
  if (error) throw error;
}

async function writeLiveEvent(accountId: string, {
  draftId = null,
  attemptId = null,
  consentId = null,
  userId = null,
  eventType,
  metadata = {},
}: {
  draftId?: unknown;
  attemptId?: unknown;
  consentId?: unknown;
  userId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("hmrc_live_submission_events").insert({
    account_id: accountId,
    draft_id: draftId || null,
    live_attempt_id: attemptId || null,
    consent_id: consentId || null,
    user_id: userId,
    event_type: eventType,
    metadata,
  });
  if (error) throw error;
}

async function safeWriteLiveEvent(accountId: string, args: {
  draftId?: unknown;
  attemptId?: unknown;
  consentId?: unknown;
  userId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await writeLiveEvent(accountId, args);
  } catch {
    // Best-effort audit path. The primary error response must remain safe.
  }
}
