import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
  resolveTrustedAppOrigin,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";
import { createDocuSealSubmission, normalizeDocuSealBaseUrl } from "../_shared/docuseal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const DOCUSEAL_API_KEY = Deno.env.get("DOCUSEAL_API_KEY") || "";
const DOCUSEAL_API_BASE_URL = Deno.env.get("DOCUSEAL_API_BASE_URL") || "https://api.docuseal.com";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) => json(req, payload, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

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

    const body = await req.json();
    const packetId = String(body?.packetId || "").trim();
    if (!packetId) {
      return respond({ error: "packetId is required" }, 400);
    }

    const prepared = await userClient.rpc("prepare_document_packet_signature", {
      p_packet_id: packetId,
      p_signature_provider: null,
      p_signature_template_id: null,
    });
    if (prepared.error) {
      return safeError(req, prepared.error, 400, "Could not prepare packet signature", {
        surface: "prepare_document_packet_signature",
        packetId,
      });
    }

    const packetQuery = await admin
      .from("document_packets")
      .select(`
        id,
        account_id,
        target_role,
        title,
        message,
        status,
        signature_provider,
        signature_template_id,
        tenants(id, name, email),
        contractors(id, name, email)
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
    if (String(packet.signature_provider || "").toLowerCase() !== "docuseal") {
      return respond({ error: "Only DocuSeal provider is supported by this function right now" }, 400);
    }

    const settingsQuery = await admin
      .from("document_signature_provider_settings")
      .select("provider, provider_base_url, default_signature_template_id, is_enabled")
      .eq("account_id", packet.account_id)
      .single();

    if (settingsQuery.error || !settingsQuery.data?.is_enabled) {
      return safeError(req, settingsQuery.error, 400, "Signature provider is not configured for this account", {
        surface: "document_signature_provider_settings",
        packetId,
      });
    }

    const recipient = packet.target_role === "tenant"
      ? packet.tenants
      : packet.contractors;
    const recipientEmail = String(recipient?.email || "").trim();
    if (!recipientEmail) {
      return respond({ error: "The packet recipient does not have an email address" }, 400);
    }

    const appOrigin = resolveTrustedAppOrigin({
      appUrl: APP_URL,
      allowedOrigins: ALLOWED_APP_ORIGINS,
    }).origin;

    const completedRedirectUrl = appOrigin
      ? `${appOrigin}${packet.target_role === "tenant" ? "/tenant/documents" : "/contractor"}?packet=${packetId}`
      : null;

    const docusealBaseUrl = normalizeDocuSealBaseUrl(
      settingsQuery.data.provider_base_url || DOCUSEAL_API_BASE_URL,
    );

    const submission = await createDocuSealSubmission({
      apiKey: DOCUSEAL_API_KEY,
      baseUrl: docusealBaseUrl,
      templateId: String(packet.signature_template_id || settingsQuery.data.default_signature_template_id || ""),
      packetId,
      packetTitle: String(packet.title || "Signature request"),
      packetMessage: String(packet.message || ""),
      recipientName: String(recipient?.name || ""),
      recipientEmail,
      recipientRole: packet.target_role === "tenant" ? "Tenant" : "Contractor",
      completedRedirectUrl,
    });

    const submissionId = String(submission?.id || "").trim();
    if (!submissionId) {
      return respond({ error: "DocuSeal did not return a submission id" }, 502);
    }

    const submitter = Array.isArray(submission?.submitters)
      ? submission.submitters.find((entry) => String(entry?.external_id || "").trim() === packetId) || submission.submitters[0]
      : null;

    const submitterSlug = String(submitter?.slug || "").trim();
    const submitterUrl = submitterSlug ? `${docusealBaseUrl.replace(/\/api$/, "")}/s/${submitterSlug}` : null;

    const recorded = await admin.rpc("record_document_packet_signature_submission", {
      p_packet_id: packetId,
      p_provider: "docuseal",
      p_submission_id: submissionId,
      p_signature_status: "pending",
    });

    if (recorded.error) {
      return safeError(req, recorded.error, 400, "Could not record signature submission", {
        surface: "record_document_packet_signature_submission",
        packetId,
      });
    }

    const packetUpdate = await admin
      .from("document_packets")
      .update({
        signature_submitter_slug: submitterSlug || null,
        signature_submitter_url: submitterUrl,
      })
      .eq("id", packetId)
      .select("id, signature_submission_id, signature_status, signature_submitter_url")
      .single();

    if (packetUpdate.error) {
      return safeError(req, packetUpdate.error, 400, "Could not persist submitter link", {
        surface: "document_packets",
        packetId,
      });
    }

    return respond({
      packetId,
      submissionId,
      signatureStatus: packetUpdate.data.signature_status,
      signerUrl: packetUpdate.data.signature_submitter_url,
    });
  } catch (error) {
    return safeError(req, error, 500, "Signature packet creation failed");
  }
});

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
  });
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
    functionName: "create-signature-packet",
    message,
    status,
    context,
  });
}
