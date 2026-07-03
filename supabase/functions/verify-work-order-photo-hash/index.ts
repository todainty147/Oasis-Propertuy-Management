// E-163: Trusted server-side SHA-256 verification for work-order photo evidence.
//
// This file is the Deno HTTP entry-point. All authorization and hash logic
// lives in handler.js (pure, no Deno imports) so it can be unit-tested
// with injected mock clients in Node/Vitest.
//
// Two-layer authorization (enforced inside verifyWorkOrderPhotoHashHandler):
//
// Layer 1 — Product authorization (caller).
//   userClient is built from the caller's Authorization header so RLS evaluates
//   under the caller's identity. The first DB lookup uses userClient — not admin.
//   Knowing an attachment_id alone is NOT sufficient authorization.
//
// Layer 2 — Path resolution (object).
//   Input is an attachmentId only — never a caller-supplied storage path.
//   After the caller is authorized, the trusted storage path is resolved from
//   the DB row via admin (service role). adminClient calls only execute AFTER
//   the userClient auth check passes.
//
// This function is the reusable trusted object-read substrate (D-08).
// E-158 (antivirus) will reuse the same handler. Do NOT add scanning here.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";
import { verifyWorkOrderPhotoHashHandler } from "./handler.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";

// Module-level admin client (service role).
// Construction happens here; all CALLS to admin occur inside the handler,
// only after userClient authorization succeeds.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type VerifyRequest = {
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

    // ── Layer 1a: Authenticate the caller ─────────────────────────────────
    // userClient is built from the caller's Authorization header so RLS
    // runs under the caller's identity — not an anonymous or service-role identity.
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

    const body = (await req.json()) as VerifyRequest;
    // Read attachmentId only — any caller-supplied storage_path, storageBucket,
    // accountId, or workOrderId in the body is ignored entirely.
    const attachmentId = String(body?.attachmentId || "").trim();

    // Delegate to the pure handler with injected clients.
    // The handler enforces: userClient auth check → then adminClient calls.
    return await verifyWorkOrderPhotoHashHandler({
      attachmentId,
      userClient,
      adminClient: admin,
      subtle: crypto.subtle,
    });
  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: ALLOWED_APP_ORIGINS,
      error,
      functionName: "verify-work-order-photo-hash",
      message: "Hash verification failed",
      status: 500,
      context: {},
    });
  }
});
