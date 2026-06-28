import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";
import {
  performRegulatorySourceCheck,
  type RegulatorySourceForCheck,
} from "../_shared/regulatorySourceCheck.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";

type CheckRequest = {
  sourceId?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
    });

  try {
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

    const body = (await req.json()) as CheckRequest;
    const sourceId = String(body?.sourceId || "").trim();
    if (!sourceId) {
      return respond({ error: "sourceId is required" }, 400);
    }

    const sourceResult = await userClient.rpc("get_regulatory_source_for_check", {
      p_source_id: sourceId,
    });

    if (sourceResult.error) {
      return safeError(req, sourceResult.error, 403, "Source check is not available", { sourceId });
    }

    const source = sourceResult.data as RegulatorySourceForCheck | null;
    if (!source?.id || !source.source_url) {
      return respond({ error: "Regulatory source not found" }, 404);
    }

    const outcome = await performRegulatorySourceCheck({
      client: userClient,
      source,
      resultRpc: "record_regulatory_source_check_result",
      failureRpc: "record_regulatory_source_check_failed",
      triggerType: "operator",
    });

    return respond(outcome);
  } catch (error) {
    return safeError(req, error, 500, "Could not check regulatory source");
  }
});

function safeError(
  req: Request,
  error: unknown,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
) {
  return safeErrorResponse(req, {
    allowedOrigins: ALLOWED_APP_ORIGINS,
    error,
    functionName: "check-regulatory-source",
    message,
    status,
    context,
  });
}
