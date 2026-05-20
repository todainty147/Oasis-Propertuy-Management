import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const SIGNED_DOCUMENT_URL_EXPIRY_SECONDS = Number(
  Deno.env.get("SIGNED_DOCUMENT_URL_EXPIRY_SECONDS") || "600",
);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SignedDocumentRequest = {
  documentId?: string;
};

type DocumentAccessRow = {
  id: string;
  account_id: string;
  storage_path: string | null;
  scan_status: string | null;
  original_filename: string | null;
  mime_type: string | null;
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

    const body = (await req.json()) as SignedDocumentRequest;
    const documentId = String(body?.documentId || "").trim();
    if (!documentId) {
      return respond({ error: "documentId is required" }, 400);
    }

    const access = await userClient.rpc("audit_document_access", {
      p_document_id: documentId,
    });

    if (access.error) {
      return safeError(req, access.error, 403, "Document is not available", { documentId });
    }

    const document = access.data as DocumentAccessRow | null;
    const storagePath = String(document?.storage_path || "").trim();
    if (!document?.id || !storagePath) {
      return respond({ error: "Document is not available" }, 404);
    }

    const expiresIn = normalizeExpiry(SIGNED_DOCUMENT_URL_EXPIRY_SECONDS);
    const signed = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, expiresIn);

    if (signed.error || !signed.data?.signedUrl) {
      return safeError(req, signed.error, 500, "Could not create document link", {
        documentId,
      });
    }

    return respond({
      signedUrl: signed.data.signedUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      document: {
        id: document.id,
        accountId: document.account_id,
        scanStatus: document.scan_status,
        filename: document.original_filename,
        mimeType: document.mime_type,
      },
    });
  } catch (error) {
    return safeError(req, error, 500, "Could not create document link");
  }
});

function normalizeExpiry(value: number) {
  if (!Number.isFinite(value)) return 600;
  return Math.min(Math.max(Math.trunc(value), 60), 3600);
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
    functionName: "signed-document-url",
    message,
    status,
    context,
  });
}
