import {
  admin,
  assertHmrcAccountFeatures,
  auditHmrcEvent,
  encryptedTokenRow,
  ensureHmrcConfig,
  ensureSandboxOnly,
  getConnection,
  handleOptions,
  HMRC_BASE_URL,
  HMRC_CLIENT_ID,
  HMRC_CLIENT_SECRET,
  HMRC_ENVIRONMENT,
  HMRC_LIVE_SUBMISSION_ENV,
  HMRC_TOKEN_ENCRYPTION_KEY,
  HttpError,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { decryptToken } from "../_shared/hmrcMtd.ts";
import {
  assertWriteSelfAssessmentScope,
  buildPropertyBusinessReadPath,
  getSandboxProfile,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  maskNino,
  safeTaxYear,
} from "../_shared/hmrcMtdReadOnly.ts";
import { buildUkPropertyPeriodSummaryPayload } from "../_shared/hmrcUkPropertyPeriodSummaryPayloadBuilder.ts";

const DRAFT_SELECT = [
  "id", "account_id", "tax_year", "period_label", "period_start", "period_end",
  "property_business_id", "income_source_id", "hmrc_connection_id", "status",
  "source_summary", "category_totals", "validation_summary", "payload_preview",
  "draft_type", "original_draft_id", "amendment_reason", "accounting_type_snapshot", "accounting_type_review_required",
  "sandbox_submitted_at", "sandbox_submission_status", "sandbox_submission_attempt_id",
  "sandbox_submission_id", "sandbox_receipt_summary", "updated_at",
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

  let attemptId = "";
  let accountId = "";
  let userId = "";
  try {
    ensureSandboxOnly();
    ensureHmrcConfig();
    assertExactSandboxSubmissionEnvironment();
    const user = await requireUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({}));
    accountId = String(body.account_id || body.accountId || "").trim();
    const draftId = String(body.draft_id || body.draftId || "").trim();
    if (!draftId) throw new HttpError("Missing quarterly draft id.", 400);
    if (body.confirmSandboxSubmission !== true) {
      throw new HttpError("Confirm this is a sandbox test submission before continuing.", 400);
    }

    await assertHmrcAccountFeatures(accountId, user.id, [
      "hmrc_mtd_connection",
      "hmrc_mtd_sandbox",
      "hmrc_mtd_read_only",
      "hmrc_mtd_sandbox_submission",
    ]);
    await assertLiveSubmissionFlagOff(accountId);

    const connection = await ensureFreshConnection(accountId, user.id);
    assertWriteSelfAssessmentScope(connection);
    const profile = getSandboxProfile(connection);
    const nino = profile.nino;
    const businessId = String(profile.incomeSourceId || profile.testBusinessId || "").trim();
    if (!nino) throw new HttpError("Sandbox NINO is missing.", 400);
    if (!businessId) throw new HttpError("Required sandbox property business identifier is missing.", 400);

    const { draft, lines } = await loadDraft(accountId, draftId);
    const taxYear = safeTaxYear(draft.tax_year || profile.testTaxYear || "2026-27");
    assertSupportedSubmissionTaxYear(taxYear);
    const payloadResult = buildUkPropertyPeriodSummaryPayload({
      draft: { ...draft, tax_year: taxYear },
      lines,
      nino,
      businessId,
    });
    if (payloadResult.validationIssues.length > 0) {
      const attempt = await createSubmissionAttempt({
        accountId,
        draft,
        connection,
        profile,
        businessId,
        payloadSummary: payloadResult.payloadSummary,
        userId,
        status: "validation_failed",
        errorMessage: payloadResult.validationIssues.join(" "),
      });
      attemptId = String(attempt.id || "");
      await safeWriteSubmissionEvent(accountId, {
        draftId: draft.id,
        attemptId,
        userId,
        eventType: "sandbox_submission_validation_failed",
        metadata: { validationIssues: payloadResult.validationIssues },
      });
      return json(req, {
        status: "validation_failed",
        message: "HMRC sandbox rejected the payload before submission. Review the validation details.",
        attemptId,
        safeSummary: { validationIssues: payloadResult.validationIssues },
      }, 400);
    }

    const attempt = await createSubmissionAttempt({
      accountId,
      draft,
      connection,
      profile,
      businessId,
      payloadSummary: payloadResult.payloadSummary,
      userId,
      status: "started",
    });
    attemptId = String(attempt.id || "");
    await writeSubmissionEvent(accountId, {
      draftId: draft.id,
      attemptId,
      userId,
      eventType: "sandbox_submission_started",
      metadata: payloadResult.payloadSummary,
    });

    const endpointPath = buildPropertyBusinessReadPath(nino, businessId, taxYear, "uk-property");
    const response = await hmrcRequest({
      accountId,
      connection,
      path: endpointPath,
      accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
      action: "hmrc.submit_uk_property_period_summary_sandbox",
      userId,
      method: "PUT",
      body: payloadResult.payload,
    });

    if (!response.ok) {
      const summary = safeFailureSummary(response);
      await completeAttempt(attemptId, accountId, {
        status: "failed",
        responseSummary: summary,
        httpStatus: response.status,
        correlationId: response.correlationId || null,
        errorCode: response.normalized?.hmrcCode || null,
        errorMessage: response.normalized?.message || "HMRC sandbox rejected the payload.",
      });
      await safeWriteSubmissionEvent(accountId, {
        draftId: draft.id,
        attemptId,
        userId,
        eventType: "sandbox_submission_failed",
        metadata: summary,
      });
      return json(req, {
        status: "failed",
        message: response.normalized?.message || "HMRC sandbox rejected the payload. Review the validation details.",
        attemptId,
        hmrcCorrelationId: response.correlationId || null,
        hmrcHttpStatus: response.status,
        safeSummary: summary,
      }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }

    const hmrcSubmissionId = extractSubmissionId(response.body);
    const safeSummary = {
      accepted: true,
      submissionIdPresent: Boolean(hmrcSubmissionId),
      responseKeys: Object.keys(response.body || {}).slice(0, 10),
      readBack: "not_run",
    };
    await updateDraftSandboxReceipt(accountId, draft.id, {
      sandbox_submitted_at: new Date().toISOString(),
      sandbox_submission_status: "success",
      sandbox_submission_attempt_id: attemptId,
      sandbox_submission_id: hmrcSubmissionId || null,
      sandbox_receipt_summary: safeSummary,
    });
    await safeWriteSubmissionEvent(accountId, {
      draftId: draft.id,
      attemptId,
      userId,
      eventType: "sandbox_submission_success",
      metadata: safeSummary,
    });

    const readBack = await readBackSubmittedSummary({ accountId, connection, endpointPath, userId, draftId: draft.id, attemptId });
    const finalSummary = { ...safeSummary, readBack: readBack.status };
    await safeCompleteAttempt(attemptId, accountId, {
      status: "success",
      responseSummary: finalSummary,
      httpStatus: response.status,
      correlationId: response.correlationId || null,
      submissionId: hmrcSubmissionId,
    });
    await updateDraftSandboxReceipt(accountId, draft.id, { sandbox_receipt_summary: finalSummary });

    return json(req, {
      status: "success",
      message: readBack.status === "succeeded"
        ? "HMRC sandbox accepted this UK property period summary and read-back verification succeeded."
        : "HMRC sandbox accepted this UK property period summary. Read-back verification did not complete.",
      attemptId,
      hmrcSubmissionId,
      hmrcCorrelationId: response.correlationId || null,
      hmrcHttpStatus: response.status,
      safeSummary: finalSummary,
    });
  } catch (error) {
    if (attemptId && accountId) {
      await completeAttempt(attemptId, accountId, {
        status: "failed",
        responseSummary: { safeCode: "unexpected_error" },
        errorMessage: error instanceof Error ? error.message : "Unexpected sandbox submission error.",
      }).catch(() => {});
    }
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    if (accountId) {
      await auditHmrcEvent({
        accountId,
        userId,
        action: "hmrc.submit_uk_property_period_summary_sandbox",
        status: status === 403 ? "blocked" : "failed",
        errorMessage: error instanceof Error ? error.message : "Sandbox submission blocked",
      }).catch(() => {});
    }
    return safeHmrcError(req, error, status, "Could not submit HMRC sandbox period summary", {
      functionName: "hmrc-submit-uk-property-period-summary-sandbox",
    });
  }
});

function assertExactSandboxSubmissionEnvironment() {
  if (HMRC_ENVIRONMENT !== "sandbox") throw new HttpError("HMRC sandbox submission is blocked outside sandbox.", 403);
  if (HMRC_BASE_URL !== "https://test-api.service.hmrc.gov.uk") {
    throw new HttpError("HMRC sandbox submission requires the HMRC test API base URL.", 403);
  }
  if (String(HMRC_LIVE_SUBMISSION_ENV).toLowerCase() === "true") {
    throw new HttpError("HMRC live submission flag must remain disabled.", 403);
  }
}

function assertSupportedSubmissionTaxYear(taxYear: string) {
  const startYear = Number(String(taxYear || "").slice(0, 4));
  if (!Number.isFinite(startYear) || startYear < 2025) {
    throw new HttpError("Sandbox period summary submission is only supported for tax years from 2025-26.", 400);
  }
}

async function assertLiveSubmissionFlagOff(accountId: string) {
  const { data, error } = await admin.rpc("account_has_feature", {
    p_account_id: accountId,
    p_feature: "hmrc_mtd_live_submission",
  });
  if (error) throw error;
  if (data) throw new HttpError("HMRC live submission is disabled for this phase.", 403);
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
  const draftRecord = draft as unknown as Record<string, unknown>;
  const validation = draftRecord.validation_summary && typeof draftRecord.validation_summary === "object"
    ? draftRecord.validation_summary as Record<string, unknown>
    : {};
  if (!["reviewed", "locked"].includes(String(draftRecord.status || ""))) {
    throw new HttpError("Only reviewed or locked quarterly drafts can be submitted to HMRC sandbox.", 400);
  }
  if (Number(validation.issueCount || 0) > 0) {
    throw new HttpError("Resolve quarterly draft issues before sandbox submission.", 400);
  }
  if (draftRecord.accounting_type_review_required === true) {
    throw new HttpError("HMRC accounting type changed after this draft was prepared. Rebuild and review the draft before submission.", 409);
  }
  if (
    String(draftRecord.sandbox_submission_status || "").toLowerCase() === "success"
    || Boolean(draftRecord.sandbox_submitted_at)
  ) {
    throw new HttpError("already_submitted: Create a new draft or amendment flow before submitting again.", 409);
  }
  const { data: lines, error: lineError } = await admin
    .from("mtd_quarterly_update_draft_lines")
    .select(LINE_SELECT)
    .eq("draft_id", draftId)
    .eq("account_id", accountId)
    .order("transaction_date", { ascending: true });
  if (lineError) throw lineError;
  return { draft: draftRecord, lines: (lines || []) as unknown as Record<string, unknown>[] };
}

async function ensureFreshConnection(accountId: string, userId: string) {
  const connection = await getConnection(accountId);
  if (!connection || connection.connection_status !== "connected") {
    throw new HttpError("Connect HMRC sandbox before submitting a sandbox period summary.", 400);
  }
  const expiresAt = connection.access_token_expires_at ? new Date(String(connection.access_token_expires_at)).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() > 60_000) return connection as Record<string, unknown>;
  if (!connection.refresh_token_ciphertext) throw new HttpError("HMRC token expired. Reconnect HMRC sandbox.", 400);

  const { data: guard, error: guardError } = await admin
    .from("hmrc_connections")
    .update({ connection_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("connection_status", "connected")
    .select("id")
    .maybeSingle();
  if (guardError) throw guardError;
  if (!guard) throw new HttpError("Token refresh already in progress.", 409);

  try {
    const refreshToken = await decryptToken(String(connection.refresh_token_ciphertext), HMRC_TOKEN_ENCRYPTION_KEY);
    const tokenResponse = await fetch(`${HMRC_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: HMRC_CLIENT_ID,
        client_secret: HMRC_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    const tokenJson = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) throw new HttpError("The HMRC token expired. Reconnect or refresh HMRC sandbox.", 400);
    const scopes = Array.isArray(connection.scopes) ? connection.scopes.map((scope) => String(scope)) : [];
    const { data, error } = await admin
      .from("hmrc_connections")
      .update({
        ...(await encryptedTokenRow(tokenJson, scopes)),
        connection_status: "connected",
        last_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .select("id, account_id, created_by, environment, connection_status, hmrc_subject_type, hmrc_display_label, scopes, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at, last_connected_at, last_refreshed_at, disconnected_at, metadata, updated_at")
      .single();
    if (error) throw error;
    await auditHmrcEvent({
      accountId,
      userId,
      action: "hmrc.refresh_token",
      endpoint: "/oauth/token",
      method: "POST",
      status: "success",
      httpStatus: tokenResponse.status,
    });
    return data as Record<string, unknown>;
  } catch (error) {
    await admin.from("hmrc_connections").update({ connection_status: "failed", updated_at: new Date().toISOString() }).eq("id", connection.id);
    throw error;
  }
}

async function createSubmissionAttempt({
  accountId,
  draft,
  connection,
  profile,
  businessId,
  payloadSummary,
  userId,
  status,
  errorMessage = null,
}: {
  accountId: string;
  draft: Record<string, unknown>;
  connection: Record<string, unknown>;
  profile: ReturnType<typeof getSandboxProfile>;
  businessId: string;
  payloadSummary: Record<string, unknown>;
  userId: string;
  status: string;
  errorMessage?: string | null;
}) {
  const { data, error } = await admin
    .from("mtd_quarterly_submission_attempts")
    .insert({
      account_id: accountId,
      draft_id: draft.id,
      hmrc_connection_id: connection.id || null,
      environment: "sandbox",
      submission_mode: "sandbox",
      submission_type: draft.draft_type === "amendment"
        ? "uk_property_quarterly_amendment"
        : "uk_property_period_summary",
      status,
      nino_masked: maskNino(profile.nino),
      business_id: businessId,
      tax_year: draft.tax_year || null,
      period_start: draft.period_start || null,
      period_end: draft.period_end || null,
      request_payload_summary: payloadSummary,
      hmrc_error_message: errorMessage,
      submitted_by: userId,
      completed_at: status === "validation_failed" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function completeAttempt(attemptId: string, accountId: string, {
  status,
  responseSummary = {},
  httpStatus = null,
  correlationId = null,
  submissionId = null,
  errorCode = null,
  errorMessage = null,
}: {
  status: string;
  responseSummary?: Record<string, unknown>;
  httpStatus?: number | null;
  correlationId?: string | null;
  submissionId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { error } = await admin
    .from("mtd_quarterly_submission_attempts")
    .update({
      status,
      response_summary: responseSummary,
      hmrc_http_status: httpStatus,
      hmrc_correlation_id: correlationId,
      hmrc_submission_id: submissionId,
      hmrc_error_code: errorCode,
      hmrc_error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("account_id", accountId);
  if (error) throw error;
}

async function safeCompleteAttempt(attemptId: string, accountId: string, args: Parameters<typeof completeAttempt>[2]) {
  try {
    await completeAttempt(attemptId, accountId, args);
  } catch (error) {
    console.error("[hmrc] sandbox submission attempt update failed after HMRC response", {
      accountId,
      attemptId,
      status: args.status,
      message: error instanceof Error ? error.message : "Unknown attempt update error",
    });
  }
}

async function writeSubmissionEvent(accountId: string, {
  draftId = null,
  attemptId = null,
  userId = null,
  eventType,
  metadata = {},
}: {
  draftId?: unknown;
  attemptId?: unknown;
  userId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("mtd_quarterly_submission_events").insert({
    account_id: accountId,
    draft_id: draftId || null,
    submission_attempt_id: attemptId || null,
    user_id: userId,
    event_type: eventType,
    metadata,
  });
  if (error) throw error;
}

async function safeWriteSubmissionEvent(accountId: string, args: {
  draftId?: unknown;
  attemptId?: unknown;
  userId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await writeSubmissionEvent(accountId, args);
  } catch (error) {
    console.error("[hmrc] sandbox submission event insert failed", {
      accountId,
      eventType: args.eventType,
      attemptId: String(args.attemptId || ""),
      message: error instanceof Error ? error.message : "Unknown submission event error",
    });
  }
}

async function updateDraftSandboxReceipt(accountId: string, draftId: unknown, patch: Record<string, unknown>) {
  const { error } = await admin
    .from("mtd_quarterly_update_drafts")
    .update(patch)
    .eq("id", draftId)
    .eq("account_id", accountId);
  if (error) {
    console.error("[hmrc] sandbox draft receipt update failed", {
      accountId,
      draftId: String(draftId || ""),
      message: error.message,
    });
  }
}

async function readBackSubmittedSummary({
  accountId,
  connection,
  endpointPath,
  userId,
  draftId,
  attemptId,
}: {
  accountId: string;
  connection: Record<string, unknown>;
  endpointPath: string;
  userId: string;
  draftId: unknown;
  attemptId: string;
}) {
  try {
    const response = await hmrcRequest({
      accountId,
      connection,
      path: endpointPath,
      accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
      action: "hmrc.read_submitted_uk_property_period_summary_sandbox",
      userId,
      method: "GET",
    });
    const status = response.ok ? "succeeded" : "failed";
    await safeWriteSubmissionEvent(accountId, {
      draftId,
      attemptId,
      userId,
      eventType: "sandbox_submission_retrieved_after_submit",
      metadata: { status, httpStatus: response.status, hmrcCorrelationId: response.correlationId || null },
    });
    return { status, httpStatus: response.status };
  } catch (error) {
    await writeSubmissionEvent(accountId, {
      draftId,
      attemptId,
      userId,
      eventType: "sandbox_submission_retrieved_after_submit",
      metadata: { status: "failed", message: error instanceof Error ? error.message : "Read-back failed" },
    }).catch(() => {});
    return { status: "failed" };
  }
}

function extractSubmissionId(body: Record<string, unknown>) {
  return String(body.submissionId || body.submissionID || body.id || body.submission_id || "").trim();
}

function safeFailureSummary(response: Awaited<ReturnType<typeof hmrcRequest>>) {
  return {
    ok: false,
    httpStatus: response.status,
    hmrcCode: response.normalized?.hmrcCode || null,
    safeCode: response.normalized?.safeCode || null,
    message: response.normalized?.message || "HMRC sandbox request failed.",
  };
}
