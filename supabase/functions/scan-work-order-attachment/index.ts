// E-158: User-triggered work-order attachment scan dispatch.
//
// D7 user-triggered re-scan path (E-163a caller-auth).
// The system-triggered path (fire-and-forget after upload) also flows here;
// the caller is the frontend or sweep, which holds an authenticated JWT.
//
// This is a thin Deno wrapper.  All auth + dispatch logic lives in handler.js
// (pure, no Deno imports) so it can be unit-tested in Node/Vitest.
//
// Authorization (enforced inside scanWorkOrderAttachmentHandler):
//   Layer 1 — userClient (caller JWT) RLS check on work_order_attachments.
//              Knowing an attachment_id alone is NOT sufficient authorization.
//   Dispatch — sends attachmentId to the scanner worker (never a storage path).
//   Recording — the scanner worker calls record_work_order_attachment_scan_result
//               (service_role only) after the ClamAV verdict is known.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";
import { scanWorkOrderAttachmentHandler } from "./handler.js";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              || "";
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")         || "";
const ALLOWED_APP_ORIGINS       = Deno.env.get("ALLOWED_APP_ORIGINS")       || "";
const WO_SCAN_SERVICE_URL       = Deno.env.get("WO_ATTACHMENT_SCAN_SERVICE_URL")   || "";
const WO_SCAN_SERVICE_TOKEN     = Deno.env.get("WO_ATTACHMENT_SCAN_SERVICE_TOKEN") || "";
const WO_SCAN_TIMEOUT_MS        = Number(Deno.env.get("WO_ATTACHMENT_SCAN_TIMEOUT_MS") || "30000");

type ScanRequest = {
  attachmentId?: string;
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

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as ScanRequest;
    const attachmentId = String(body?.attachmentId || "").trim();

    return await scanWorkOrderAttachmentHandler({
      attachmentId,
      userClient,
      scanServiceUrl:  WO_SCAN_SERVICE_URL,
      scanServiceToken: WO_SCAN_SERVICE_TOKEN,
      scanTimeoutMs:   WO_SCAN_TIMEOUT_MS,
    });
  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: ALLOWED_APP_ORIGINS,
      error,
      functionName: "scan-work-order-attachment",
      message: "Attachment scan dispatch failed",
      status: 500,
      context: {},
    });
  }
});
