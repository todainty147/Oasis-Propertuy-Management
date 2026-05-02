import { createClient } from "npm:@supabase/supabase-js@2";
import {
  deriveDocuSealPacketId,
  deriveDocuSealSubmissionId,
  downloadDocuSealDocument,
  getDocuSealSubmission,
  mapDocuSealStatus,
  normalizeDocuSealApiBaseUrl,
} from "../_shared/docuseal.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DOCUSEAL_API_KEY = Deno.env.get("DOCUSEAL_API_KEY") || "";
const DOCUSEAL_API_BASE_URL = Deno.env.get("DOCUSEAL_API_BASE_URL") || "https://api.docuseal.com";
const DOCUSEAL_WEBHOOK_SECRET = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const secret = String(req.headers.get("x-docuseal-secret") || "").trim();
    if (!DOCUSEAL_WEBHOOK_SECRET || secret !== DOCUSEAL_WEBHOOK_SECRET) {
      return respond({ error: "Unauthorized webhook" }, 401);
    }

    const payload = await req.json();
    const eventType = String(payload?.event_type || "").trim().toLowerCase();
    const packetId = deriveDocuSealPacketId(payload);
    const submissionId = deriveDocuSealSubmissionId(payload);

    if (!packetId) {
      return respond({ ok: true, ignored: "packet_id_missing" });
    }

    const packetQuery = await admin
      .from("document_packets")
      .select(`
        id,
        account_id,
        title,
        target_role,
        tenant_id,
        property_id,
        signature_submission_id,
        signature_provider,
        signature_template_id,
        signature_status,
        created_by,
        sent_by
      `)
      .eq("id", packetId)
      .single();

    if (packetQuery.error || !packetQuery.data) {
      return safeError(req, packetQuery.error, 404, "Packet not found", {
        surface: "document_packets",
        packetId,
      });
    }

    const packet = packetQuery.data as Record<string, any>;
    const settingsQuery = await admin
      .from("document_signature_provider_settings")
      .select("provider_base_url")
      .eq("account_id", packet.account_id)
      .maybeSingle();

    const providerBaseUrl = normalizeDocuSealApiBaseUrl(
      settingsQuery.data?.provider_base_url || DOCUSEAL_API_BASE_URL,
    );

    const status = mapDocuSealStatus(payload?.data?.status || payload?.data?.submitters?.[0]?.status);
    let completedDocumentId: string | null = null;

    if (status === "completed" && submissionId) {
      const submission = await getDocuSealSubmission({
        apiKey: DOCUSEAL_API_KEY,
        baseUrl: providerBaseUrl,
        submissionId,
      });

      const signedDocument = await downloadDocuSealDocument({
        apiKey: DOCUSEAL_API_KEY,
        baseUrl: providerBaseUrl,
        submissionId,
        submission,
      });

      const storagePath = `${packet.account_id}/${crypto.randomUUID()}/${sanitizeFilename(signedDocument.filename)}`;
      const upload = await admin.storage
        .from("documents")
        .upload(storagePath, signedDocument.bytes, {
          upsert: false,
          contentType: signedDocument.mimeType,
        });

      if (upload.error) {
        return safeError(req, upload.error, 400, "Signed document upload failed", {
          surface: "documents_storage",
          packetId,
          submissionId,
        });
      }

      const imported = await admin.rpc("import_document_packet_signed_document", {
        p_packet_id: packetId,
        p_storage_path: storagePath,
        p_filename: signedDocument.filename,
        p_size_bytes: signedDocument.bytes.byteLength,
        p_mime_type: signedDocument.mimeType,
      });

      if (imported.error || !imported.data?.id) {
        return safeError(req, imported.error, 400, "Signed document import failed", {
          surface: "import_document_packet_signed_document",
          packetId,
          submissionId,
        });
      }

      completedDocumentId = imported.data.id;
    }

    const synced = await admin.rpc("sync_document_packet_signature_status", {
      p_packet_id: packetId,
      p_submission_id: submissionId || packet.signature_submission_id || null,
      p_signature_status: status,
      p_completed_document_id: completedDocumentId,
      p_error: eventType.includes("declined") ? "submitter_declined" : null,
    });

    if (synced.error) {
      return safeError(req, synced.error, 400, "Signature status sync failed", {
        surface: "sync_document_packet_signature_status",
        packetId,
        submissionId,
      });
    }

    return respond({
      ok: true,
      packetId,
      submissionId,
      signatureStatus: status,
      completedDocumentId,
    });
  } catch (error) {
    return safeError(req, error, 500, "Signature webhook handling failed");
  }
});

function sanitizeFilename(name: string) {
  return String(name || "signed-document.pdf")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_");
}

function safeError(
  req: Request,
  error: unknown,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
) {
  return safeErrorResponse(req, {
    allowedOrigins: "",
    error,
    functionName: "handle-signature-webhook",
    message,
    status,
    context,
  });
}
