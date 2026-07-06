// E-158: Serve gate for work-order photo attachment signed URLs.
//
// D4 (fail-closed-at-serve): returns a signed URL only when scan_status='clean'.
// pending_scan / flagged / scan_failed / legacy_unscanned are refused with distinct
// error reasons so callers can give honest UX feedback.
//
// Two-layer authorization:
//   Layer 1 — userClient (caller JWT) selects from work_order_attachments under RLS.
//              If the caller cannot see the row they get 403 before any service-role path.
//   Layer 2 — admin (service role) resolves storage_bucket/storage_path from the trusted
//              DB row only AFTER Layer 1 passes and scan_status='clean' is confirmed.
//
// The caller never supplies a storage path. The path is always resolved from the DB row
// keyed by attachment_id (prevents path-redirect attacks on the service-role reader).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL               = Deno.env.get("SUPABASE_URL")               || "";
const SUPABASE_ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY")          || "";
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  || "";
const ALLOWED_APP_ORIGINS        = Deno.env.get("ALLOWED_APP_ORIGINS")        || "";
const EXPIRY_SECONDS             = Number(Deno.env.get("SIGNED_WO_ATTACHMENT_URL_EXPIRY_SECONDS") || "600");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-level service-role client.  Called only after Layer 1 auth passes.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SCAN_STATUS_REASONS: Record<string, string> = {
  pending_scan:     "Attachment is queued for malware scanning and cannot be served yet",
  scan_failed:      "Malware scan encountered a transient error; retry in progress",
  flagged:          "Attachment was flagged as malicious and cannot be served",
  legacy_unscanned: "Attachment predates scanning and is pending a transitional scan",
};

type ServeRequest = {
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

    // ── Layer 1a: authenticate the caller ──────────────────────────────────
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as ServeRequest;
    const attachmentId = String(body?.attachmentId || "").trim();

    if (!attachmentId || !UUID_RE.test(attachmentId)) {
      return respond({ error: "attachmentId must be a valid UUID" }, 400);
    }

    // ── Layer 1b: product authorization via RLS (caller-scoped) ─────────────
    // RLS on work_order_attachments restricts to rows the caller can access.
    // This also reveals the scan_status the caller is permitted to see.
    const { data: authRow, error: authError } = await userClient
      .from("work_order_attachments")
      .select("id, scan_status")
      .eq("id", attachmentId)
      .maybeSingle();

    if (authError || !authRow) {
      return respond({ error: "Attachment not found or not accessible" }, 403);
    }

    // ── D4: fail-closed-at-serve ────────────────────────────────────────────
    // Refuse every non-clean state with a distinct, honest reason (D4).
    const scanStatus = authRow.scan_status as string | null;
    if (scanStatus !== "clean") {
      const reason = SCAN_STATUS_REASONS[scanStatus ?? ""] ??
        "Attachment cannot be served at this time";
      return respond({ error: reason, scanStatus: scanStatus ?? "unknown" }, 503);
    }

    // ── Layer 2: resolve trusted path from DB (service role) ────────────────
    // admin is introduced here — only after Layer 1b confirms scan_status='clean'.
    const { data: pathRow, error: pathError } = await admin
      .from("work_order_attachments")
      .select("id, storage_bucket, storage_path, file_name, mime_type")
      .eq("id", attachmentId)
      .single();

    if (pathError || !pathRow?.storage_path) {
      return respond({ error: "Could not resolve attachment storage path" }, 500);
    }

    // ── Sign URL via service role (bypasses storage RLS legitimately) ────────
    const expiresIn = Number.isFinite(EXPIRY_SECONDS) && EXPIRY_SECONDS > 0
      ? Math.min(Math.max(Math.trunc(EXPIRY_SECONDS), 60), 3600)
      : 600;

    const { data: signData, error: signError } = await admin.storage
      .from(pathRow.storage_bucket)
      .createSignedUrl(pathRow.storage_path, expiresIn);

    if (signError || !signData?.signedUrl) {
      return respond({ error: "Could not generate signed URL" }, 500);
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return respond({
      signedUrl: signData.signedUrl,
      expiresIn,
      expiresAt,
      attachment: {
        id:       pathRow.id,
        fileName: pathRow.file_name,
        mimeType: pathRow.mime_type,
      },
    });
  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: ALLOWED_APP_ORIGINS,
      error,
      functionName: "signed-work-order-attachment-url",
      message: "Could not generate attachment URL",
      status: 500,
      context: {},
    });
  }
});
