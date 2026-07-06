/**
 * E-158 — Core handler for scan-work-order-attachment (pure, no Deno imports).
 *
 * D7 system-triggered path / user-triggered re-scan path.
 * System path: attachmentId comes from the scanner worker or sweep (service role);
 * User path:   attachmentId comes from an authenticated caller.
 *
 * This handler covers the dispatch leg (Edge Function → scanner worker).
 * The scanner worker (server.mjs) calls record_work_order_attachment_scan_result
 * after the ClamAV verdict is known.
 *
 * Authorization ordering (load-bearing):
 *   1. UUID validation
 *   2. userClient lookup — caller-scoped RLS check (E-163a pattern).
 *      If the caller cannot SELECT this row they are not authorized → 403.
 *      Skip if system-path: caller is authenticated via service-role; for
 *      the user-triggered path this is the membership gate.
 *   3. Terminal state check — clean/flagged are final (skip gracefully).
 *      scan_failed is retryable; pending_scan and legacy_unscanned proceed.
 *   4. Forward to scanner worker (attachmentId only — path resolved by worker).
 *
 * @param {{
 *   attachmentId:    string,
 *   userClient:      object,   // Supabase client built from caller's JWT
 *   scanServiceUrl:  string,
 *   scanServiceToken: string,
 *   scanTimeoutMs:   number,
 * }} deps
 * @returns {Promise<Response>}
 */
export async function scanWorkOrderAttachmentHandler({
  attachmentId,
  userClient,
  scanServiceUrl,
  scanServiceToken,
  scanTimeoutMs = 30000,
}) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!attachmentId || !UUID_RE.test(attachmentId)) {
    return json({ error: "attachmentId must be a valid UUID" }, 400);
  }

  // ── E-163a caller-auth: RLS check via userClient ─────────────────────────
  const { data: authRow, error: authError } = await userClient
    .from("work_order_attachments")
    .select("id, scan_status")
    .eq("id", attachmentId)
    .maybeSingle();

  if (authError || !authRow) {
    return json({ error: "Attachment not found or not accessible" }, 403);
  }

  // Terminal states: clean and flagged are final; do not re-scan
  const scanStatus = authRow.scan_status;
  if (scanStatus === "clean" || scanStatus === "flagged") {
    return json({
      ok: true,
      attachmentId,
      scanStatus,
      skipped: true,
      message: "Attachment is in a terminal scan state and will not be re-scanned",
    });
  }

  // ── Validate scanner config ───────────────────────────────────────────────
  if (!scanServiceUrl || !scanServiceToken) {
    return json({ error: "Attachment scanner is not configured" }, 503);
  }

  const scannerUrl = normalizeScannerUrl(scanServiceUrl);
  if (!scannerUrl) {
    return json({ error: "Attachment scanner is not configured" }, 503);
  }

  // ── Forward attachmentId to scanner worker ────────────────────────────────
  // The scanner worker resolves the storage path from the trusted DB row —
  // the caller never supplies a path; we only pass the attachmentId.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeTimeout(scanTimeoutMs),
  );

  try {
    const workerResponse = await fetch(`${scannerUrl}/scan-work-order-attachment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scanServiceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId }),
      signal: controller.signal,
    });

    const payload = await safeJson(workerResponse);
    if (!workerResponse.ok) {
      return json(
        { error: "Scanner returned an error", details: payload?.error ?? "unknown" },
        502,
      );
    }

    return json({
      ok: true,
      attachmentId,
      scanStatus: normalizeScanStatus(payload),
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeScannerUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTimeout(value) {
  if (!Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.trunc(value), 5000), 120000);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return { status: response.status };
  }
}

function normalizeScanStatus(payload) {
  if (!payload || typeof payload !== "object") return "unknown";
  const value = String(payload.scanStatus ?? "")
    .trim()
    .toLowerCase();
  if (["clean", "flagged", "scan_failed"].includes(value)) return value;
  return "unknown";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
