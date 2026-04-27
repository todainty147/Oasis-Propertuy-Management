import { createClient } from "npm:@supabase/supabase-js@2";

import { buildCorsHeaders, buildJsonHeaders } from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SubmissionPayload = {
  accountId?: string;
  marketplaceJobId?: string;
};

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
        request_payload,
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
    const externalSubmissionUrl =
      typeof configuration.external_submission_url === "string" && configuration.external_submission_url.trim()
        ? configuration.external_submission_url.trim()
        : null;

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
      });
    }

    return respond({
      ok: true,
      providerKey: "checkatrade",
      marketplaceJobId: String(job.id),
      status: "configured_not_implemented",
      liveSubmissionAvailable: false,
      manualFallbackRecommended: true,
      externalSubmissionUrl,
      message:
        "Checkatrade account-level gating is configured and the API scaffold is ready, but live provider transport is not implemented yet. Use the manual handoff flow for this rollout stage.",
      preparedPayload,
    });
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
