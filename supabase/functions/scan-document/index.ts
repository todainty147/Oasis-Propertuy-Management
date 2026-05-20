import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const DOCUMENT_SCAN_SERVICE_URL = Deno.env.get("DOCUMENT_SCAN_SERVICE_URL") || "";
const DOCUMENT_SCAN_SERVICE_TOKEN = Deno.env.get("DOCUMENT_SCAN_SERVICE_TOKEN") || "";
const DOCUMENT_SCAN_TIMEOUT_MS = Number(Deno.env.get("DOCUMENT_SCAN_TIMEOUT_MS") || "30000");

type ScanDocumentRequest = {
  documentId?: string;
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

    const body = (await req.json()) as ScanDocumentRequest;
    const documentId = String(body?.documentId || "").trim();
    if (!documentId) {
      return respond({ error: "documentId is required" }, 400);
    }

    if (!DOCUMENT_SCAN_SERVICE_URL || !DOCUMENT_SCAN_SERVICE_TOKEN) {
      return respond({ error: "Document scanner is not configured" }, 503);
    }

    const scannerUrl = normalizeScannerUrl(DOCUMENT_SCAN_SERVICE_URL);
    if (!scannerUrl) {
      return respond({ error: "Document scanner is not configured" }, 503);
    }

    const requestScan = await userClient.rpc("request_document_scan", {
      p_document_id: documentId,
    });

    if (requestScan.error) {
      return safeError(req, requestScan.error, 403, "Document cannot be scanned", { documentId });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), normalizeTimeout(DOCUMENT_SCAN_TIMEOUT_MS));

    try {
      const scannerResponse = await fetch(scannerUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DOCUMENT_SCAN_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
        signal: controller.signal,
      });

      const payload = await safeJson(scannerResponse);
      if (!scannerResponse.ok) {
        return safeError(req, payload, scannerResponse.status, "Document scan failed", { documentId });
      }

      return respond({
        ok: true,
        documentId,
        scanStatus: normalizeScanStatus(payload),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return safeError(req, error, 500, "Document scan failed");
  }
});

function normalizeScannerUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTimeout(value: number) {
  if (!Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.trunc(value), 5000), 120000);
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { status: response.status };
  }
}

function normalizeScanStatus(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown";
  const value = String((payload as { scanStatus?: unknown }).scanStatus || "").trim().toLowerCase();
  if (["clean", "flagged", "scan_failed"].includes(value)) return value;
  return "unknown";
}

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
    functionName: "scan-document",
    message,
    status,
    context,
  });
}
