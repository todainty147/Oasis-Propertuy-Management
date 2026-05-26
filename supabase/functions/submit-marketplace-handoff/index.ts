import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildMarketplaceSubmissionBody,
  classifyMarketplaceSubmissionFailure,
  normalizeMarketplaceTransportUrl,
  submitMarketplaceTransport,
  validateMarketplaceSubmissionReadiness,
} from "../_shared/marketplaceTransport.ts";
import { buildCorsHeaders, buildJsonHeaders } from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const CHECKATRADE_API_KEY = Deno.env.get("CHECKATRADE_API_KEY") || "";
const CHECKATRADE_API_SECRET = Deno.env.get("CHECKATRADE_API_SECRET") || "";
const CHECKATRADE_API_TIMEOUT_MS = Number(Deno.env.get("CHECKATRADE_API_TIMEOUT_MS") || "15000");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SubmissionPayload = {
  accountId?: string;
  marketplaceJobId?: string;
};

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toTrimmedString(value: unknown) {
  return String(value || "").trim();
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAttemptCount(responsePayload: unknown) {
  const transport = toRecord(toRecord(responsePayload).transport);
  return toPositiveInt(transport.attemptCount, 0);
}

function buildTransportAuditPayload({
  attemptCount,
  configuredEndpointUrl,
  httpStatus,
  idempotencyKey,
  message,
  requestBody,
  responseBody,
  retryable,
}: {
  attemptCount: number;
  configuredEndpointUrl: string;
  httpStatus: number | null;
  idempotencyKey: string;
  message: string;
  requestBody: Record<string, unknown>;
  responseBody: unknown;
  retryable: boolean;
}) {
  return {
    transport: {
      provider: "checkatrade",
      attemptCount,
      endpointUrl: configuredEndpointUrl,
      httpStatus,
      idempotencyKey,
      retryable,
      message,
      attemptedAt: new Date().toISOString(),
      requestSummary: {
        title: toTrimmedString(requestBody?.handoff && toRecord(requestBody.handoff).title),
        tradeCategory: toTrimmedString(requestBody?.handoff && toRecord(requestBody.handoff).trade_category),
        city: toTrimmedString(requestBody?.handoff && toRecord(toRecord(requestBody.handoff).location).city),
      },
      providerResponse: responseBody,
    },
  };
}

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
    });

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
    }

    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({})) as SubmissionPayload;
    const accountId = String(body?.accountId || "").trim();
    const marketplaceJobId = String(body?.marketplaceJobId || "").trim();

    if (!accountId || !marketplaceJobId) {
      return respond({ error: "accountId and marketplaceJobId are required" }, 400);
    }

    const permission = await userClient.rpc("assert_manage_account_access", { p_account_id: accountId });
    if (permission.error) {
      return safeErrorResponse(req, {
        allowedOrigins: ALLOWED_APP_ORIGINS,
        code: "not_permitted",
        context: {
          accountId,
          marketplaceJobId,
          surface: "assert_manage_account_access",
        },
        error: permission.error,
        functionName: "submit-marketplace-handoff",
        message: "Not permitted",
        status: 403,
      });
    }

    const { data: job, error: jobError } = await admin
      .from("external_marketplace_jobs")
      .select(`
        id,
        account_id,
        work_order_id,
        provider_key,
        submission_mode,
        status,
        title,
        description,
        urgency,
        postcode,
        city,
        property_label,
        trade_category,
        contact_name,
        contact_email,
        contact_phone,
        external_job_id,
        external_reference,
        external_url,
        last_error,
        request_payload,
        response_payload,
        metadata
      `)
      .eq("account_id", accountId)
      .eq("id", marketplaceJobId)
      .maybeSingle();

    if (jobError) {
      return safeErrorResponse(req, {
        allowedOrigins: ALLOWED_APP_ORIGINS,
        code: "marketplace_job_lookup_failed",
        context: {
          accountId,
          marketplaceJobId,
        },
        error: jobError,
        functionName: "submit-marketplace-handoff",
        message: "Could not load marketplace handoff",
        status: 500,
      });
    }

    if (!job?.id) {
      return respond({ error: "Marketplace handoff not found", code: "marketplace_job_not_found" }, 404);
    }

    if (String(job.provider_key || "") !== "checkatrade") {
      return respond({
        error: "Only Checkatrade API scaffolding is available in this phase",
        code: "unsupported_marketplace_provider",
      }, 400);
    }

    const { data: setting, error: settingError } = await admin
      .from("marketplace_integration_settings")
      .select("enabled, configuration")
      .eq("account_id", accountId)
      .eq("provider_key", "checkatrade")
      .maybeSingle();

    if (settingError) {
      return safeErrorResponse(req, {
        allowedOrigins: ALLOWED_APP_ORIGINS,
        code: "marketplace_setting_lookup_failed",
        context: {
          accountId,
          marketplaceJobId,
          providerKey: "checkatrade",
        },
        error: settingError,
        functionName: "submit-marketplace-handoff",
        message: "Could not load marketplace provider settings",
        status: 500,
      });
    }

    if (!setting?.enabled) {
      return respond({
        error: "Checkatrade API submission is not enabled for this account",
        code: "marketplace_provider_not_enabled",
      }, 409);
    }

    const configuration =
      setting?.configuration && typeof setting.configuration === "object" && !Array.isArray(setting.configuration)
        ? setting.configuration as Record<string, unknown>
        : {};

    const liveSubmissionEnabled = configuration.live_submission_enabled === true;
    const externalSubmissionUrl = normalizeMarketplaceTransportUrl(
      typeof configuration.external_submission_url === "string" ? configuration.external_submission_url : "",
    );
    const providerAccountReference = toTrimmedString(configuration.provider_account_reference);
    const maxApiAttempts = toPositiveInt(configuration.max_api_attempts, 3);
    const timeoutMs = toPositiveInt(configuration.request_timeout_ms, CHECKATRADE_API_TIMEOUT_MS);
    const staticHeaders = toRecord(configuration.static_headers) as Record<string, string>;

    const preparedPayload = {
      marketplaceJobId: String(job.id),
      workOrderId: String(job.work_order_id || ""),
      providerKey: "checkatrade",
      title: String(job.title || ""),
      description: String(job.description || ""),
      urgency: String(job.urgency || ""),
      postcode: String(job.postcode || ""),
      city: String(job.city || ""),
      propertyLabel: String(job.property_label || ""),
      tradeCategory: String(job.trade_category || ""),
      contactName: String(job.contact_name || ""),
      contactEmail: String(job.contact_email || ""),
      contactPhone: String(job.contact_phone || ""),
      requestPayload:
        job.request_payload && typeof job.request_payload === "object" && !Array.isArray(job.request_payload)
          ? job.request_payload
          : {},
      metadata:
        job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
          ? job.metadata
          : {},
    };
    const requestBody = buildMarketplaceSubmissionBody(preparedPayload, providerAccountReference, configuration);

    if (!externalSubmissionUrl || !liveSubmissionEnabled) {
      return respond({
        ok: true,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: "scaffold_ready",
        liveSubmissionAvailable: false,
        manualFallbackRecommended: true,
        message:
          "Checkatrade API rollout is enabled for this account, but live provider submission is not configured yet. Use the manual handoff flow for now.",
        preparedPayload,
        requestBody,
      });
    }

    if (String(job.status || "").toLowerCase() === "submitted" && (
      toTrimmedString(job.external_job_id) ||
      toTrimmedString(job.external_reference) ||
      toTrimmedString(job.external_url)
    )) {
      return respond({
        ok: true,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: "already_submitted",
        liveSubmissionAvailable: true,
        manualFallbackRecommended: false,
        externalSubmissionUrl,
        externalJobId: toTrimmedString(job.external_job_id),
        externalReference: toTrimmedString(job.external_reference),
        externalUrl: toTrimmedString(job.external_url),
        message: "This marketplace handoff was already submitted earlier. Tenaqo is returning the existing provider reference.",
        preparedPayload,
        requestBody,
      });
    }

    if (!toTrimmedString(CHECKATRADE_API_KEY) || !toTrimmedString(CHECKATRADE_API_SECRET)) {
      const attemptCount = getAttemptCount(job.response_payload) + 1;
      const auditPayload = buildTransportAuditPayload({
        attemptCount,
        configuredEndpointUrl: externalSubmissionUrl,
        httpStatus: null,
        idempotencyKey: `oasis:${accountId}:${job.id}`,
        message: "Checkatrade API credentials are not configured",
        requestBody,
        responseBody: {
          code: "checkatrade_api_credentials_not_configured",
        },
        retryable: false,
      });

      await admin.rpc("edge_record_marketplace_submission_result", {
        p_account_id: accountId,
        p_marketplace_job_id: String(job.id),
        p_actor_user_id: user.id,
        p_outcome: "manual_follow_up",
        p_last_error: "Checkatrade API credentials are not configured",
        p_response_payload: auditPayload,
      });

      return respond({
        ok: false,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: "manual_follow_up",
        liveSubmissionAvailable: false,
        manualFallbackRecommended: true,
        externalSubmissionUrl,
        message:
          "Checkatrade live submission is enabled for this account, but the provider API key/secret pair is not configured in the Edge environment. Manual follow-up is required.",
        preparedPayload,
        requestBody,
        attemptCount,
        maxAttempts: maxApiAttempts,
      });
    }

    const validationErrors = validateMarketplaceSubmissionReadiness(
      {
        endpointUrl: externalSubmissionUrl,
        apiKey: CHECKATRADE_API_KEY,
        apiSecret: CHECKATRADE_API_SECRET,
        timeoutMs,
        staticHeaders,
        idempotencyKey: `oasis:${accountId}:${job.id}`,
        providerAccountReference,
        providerConfiguration: configuration,
      },
      preparedPayload,
    );

    if (validationErrors.length > 0) {
      const attemptCount = getAttemptCount(job.response_payload) + 1;
      const idempotencyKey = `oasis:${accountId}:${job.id}`;
      const message = validationErrors.join(" ");
      const auditPayload = buildTransportAuditPayload({
        attemptCount,
        configuredEndpointUrl: externalSubmissionUrl,
        httpStatus: null,
        idempotencyKey,
        message,
        requestBody,
        responseBody: {
          code: "checkatrade_request_validation_failed",
          validationErrors,
        },
        retryable: false,
      });

      await admin.rpc("edge_record_marketplace_submission_result", {
        p_account_id: accountId,
        p_marketplace_job_id: String(job.id),
        p_actor_user_id: user.id,
        p_outcome: "manual_follow_up",
        p_last_error: message,
        p_response_payload: auditPayload,
      });

      return respond({
        ok: false,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: "manual_follow_up",
        liveSubmissionAvailable: false,
        manualFallbackRecommended: true,
        externalSubmissionUrl,
        message:
          "Checkatrade live submission was blocked because required provider fields are still missing. Complete the handoff metadata or account mapping, then resubmit.",
        validationErrors,
        preparedPayload,
        requestBody,
        attemptCount,
        maxAttempts: maxApiAttempts,
      });
    }

    const attemptCount = getAttemptCount(job.response_payload) + 1;
    const idempotencyKey = `oasis:${accountId}:${job.id}`;

    try {
      const transportResult = await submitMarketplaceTransport(
        {
          endpointUrl: externalSubmissionUrl,
          apiKey: CHECKATRADE_API_KEY,
          apiSecret: CHECKATRADE_API_SECRET,
          timeoutMs,
          staticHeaders,
          idempotencyKey,
          providerAccountReference,
          providerConfiguration: configuration,
        },
        preparedPayload,
      );

      if (transportResult.ok) {
        const auditPayload = buildTransportAuditPayload({
          attemptCount,
          configuredEndpointUrl: externalSubmissionUrl,
          httpStatus: transportResult.httpStatus,
          idempotencyKey,
          message: "Provider submission accepted",
          requestBody,
          responseBody: transportResult.responseBody,
          retryable: false,
        });

        const { error: recordError } = await admin.rpc("edge_record_marketplace_submission_result", {
          p_account_id: accountId,
          p_marketplace_job_id: String(job.id),
          p_actor_user_id: user.id,
          p_outcome: "submitted",
          p_external_job_id: transportResult.externalJobId,
          p_external_reference: transportResult.externalReference,
          p_external_url: transportResult.externalUrl,
          p_response_payload: auditPayload,
        });

        if (recordError) {
          return safeErrorResponse(req, {
            allowedOrigins: ALLOWED_APP_ORIGINS,
            code: "marketplace_submission_record_failed",
            context: {
              accountId,
              marketplaceJobId,
              providerKey: "checkatrade",
              httpStatus: transportResult.httpStatus,
            },
            error: recordError,
            functionName: "submit-marketplace-handoff",
            message: "Could not record marketplace submission result",
            status: 500,
          });
        }

        const trades = transportResult.trades ?? [];
        const { error: tradesError } = await admin.rpc("edge_store_marketplace_job_trades", {
          p_account_id: accountId,
          p_marketplace_job_id: String(job.id),
          p_work_order_id: String(job.work_order_id),
          p_trades: trades,
        });

        return respond({
          ok: true,
          providerKey: "checkatrade",
          marketplaceJobId: String(job.id),
          status: "submitted",
          liveSubmissionAvailable: true,
          manualFallbackRecommended: false,
          externalSubmissionUrl,
          externalJobId: transportResult.externalJobId,
          externalReference: transportResult.externalReference,
          externalUrl: transportResult.externalUrl,
          trades,
          tradeCount: trades.length,
          tradesStorageWarning: tradesError
            ? "Submission was accepted by Checkatrade but matched trades could not be persisted. Refresh the page to retry."
            : null,
          message: "Marketplace handoff was submitted through the configured Checkatrade transport.",
          preparedPayload,
          requestBody,
          attemptCount,
          maxAttempts: maxApiAttempts,
        });
      }

      const classification = classifyMarketplaceSubmissionFailure({
        httpStatus: transportResult.httpStatus,
        attemptCount,
        maxAttempts: maxApiAttempts,
      });
      const nextStatus = classification.nextStatus;
      const providerMessage = transportResult.responseText || `Provider submission failed (${transportResult.httpStatus ?? "network"})`;
      const auditPayload = buildTransportAuditPayload({
        attemptCount,
        configuredEndpointUrl: externalSubmissionUrl,
        httpStatus: transportResult.httpStatus,
        idempotencyKey,
        message: providerMessage,
        requestBody,
        responseBody: transportResult.responseBody,
        retryable: classification.retryable,
      });

      const { error: recordError } = await admin.rpc("edge_record_marketplace_submission_result", {
        p_account_id: accountId,
        p_marketplace_job_id: String(job.id),
        p_actor_user_id: user.id,
        p_outcome: nextStatus,
        p_external_job_id: transportResult.externalJobId,
        p_external_reference: transportResult.externalReference,
        p_external_url: transportResult.externalUrl,
        p_last_error: providerMessage,
        p_response_payload: auditPayload,
      });

      if (recordError) {
        return safeErrorResponse(req, {
          allowedOrigins: ALLOWED_APP_ORIGINS,
          code: "marketplace_submission_record_failed",
          context: {
            accountId,
            marketplaceJobId,
            providerKey: "checkatrade",
            httpStatus: transportResult.httpStatus,
            nextStatus,
          },
          error: recordError,
          functionName: "submit-marketplace-handoff",
          message: "Could not record marketplace submission failure",
          status: 500,
        });
      }

      return respond({
        ok: false,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: nextStatus,
        liveSubmissionAvailable: true,
        manualFallbackRecommended: true,
        externalSubmissionUrl,
        externalJobId: transportResult.externalJobId,
        externalReference: transportResult.externalReference,
        externalUrl: transportResult.externalUrl,
        retryable: classification.retryable,
        attemptCount,
        maxAttempts: maxApiAttempts,
        message: classification.retryable
          ? "Provider submission failed, but Tenaqo kept the handoff in a retryable failed state."
          : "Provider submission failed and Tenaqo moved the handoff to manual follow-up.",
        preparedPayload,
        requestBody,
      });
    } catch (error) {
      const classification = classifyMarketplaceSubmissionFailure({
        httpStatus: null,
        attemptCount,
        maxAttempts: maxApiAttempts,
      });
      const nextStatus = classification.nextStatus;
      const message = error instanceof Error
        ? error.message || "Provider transport failed"
        : "Provider transport failed";
      const auditPayload = buildTransportAuditPayload({
        attemptCount,
        configuredEndpointUrl: externalSubmissionUrl,
        httpStatus: null,
        idempotencyKey,
        message,
        requestBody,
        responseBody: {
          code: "provider_transport_exception",
        },
        retryable: classification.retryable,
      });

      const { error: recordError } = await admin.rpc("edge_record_marketplace_submission_result", {
        p_account_id: accountId,
        p_marketplace_job_id: String(job.id),
        p_actor_user_id: user.id,
        p_outcome: nextStatus,
        p_last_error: message,
        p_response_payload: auditPayload,
      });

      if (recordError) {
        return safeErrorResponse(req, {
          allowedOrigins: ALLOWED_APP_ORIGINS,
          code: "marketplace_submission_transport_failure",
          context: {
            accountId,
            marketplaceJobId,
            providerKey: "checkatrade",
            nextStatus,
          },
          error: recordError,
          functionName: "submit-marketplace-handoff",
          message: "Marketplace transport failed",
          status: 500,
        });
      }

      return respond({
        ok: false,
        providerKey: "checkatrade",
        marketplaceJobId: String(job.id),
        status: nextStatus,
        liveSubmissionAvailable: true,
        manualFallbackRecommended: true,
        externalSubmissionUrl,
        retryable: classification.retryable,
        attemptCount,
        maxAttempts: maxApiAttempts,
        message: classification.retryable
          ? "Provider transport failed before Checkatrade accepted the handoff. Tenaqo kept it in a retryable failed state."
          : "Provider transport failed and Tenaqo moved the handoff to manual follow-up.",
        preparedPayload,
        requestBody,
      });
    }

  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: ALLOWED_APP_ORIGINS,
      error,
      functionName: "submit-marketplace-handoff",
      message: "Marketplace submission failed",
      status: 500,
    });
  }
});
