export type DocuSealSubmissionResponse = {
  id: number | string;
  slug?: string | null;
  status?: string | null;
  combined_document_url?: string | null;
  documents?: Array<{ name?: string | null; url?: string | null }> | null;
  submitters?: Array<{
    id?: number | string | null;
    slug?: string | null;
    email?: string | null;
    name?: string | null;
    external_id?: string | null;
    status?: string | null;
    opened_at?: string | null;
    completed_at?: string | null;
    declined_at?: string | null;
  }> | null;
};

type DocuSealCreateSubmissionInput = {
  apiKey: string;
  baseUrl: string;
  templateId: string;
  packetId: string;
  packetTitle: string;
  packetMessage?: string | null;
  recipientName?: string | null;
  recipientEmail: string;
  recipientRole: string;
  completedRedirectUrl?: string | null;
};

function trim(value: string | null | undefined) {
  return String(value || "").trim();
}

export function normalizeDocuSealBaseUrl(value: string | null | undefined) {
  const raw = trim(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

export function normalizeDocuSealApiBaseUrl(value: string | null | undefined) {
  const normalized = normalizeDocuSealBaseUrl(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "docuseal.com" || hostname === "www.docuseal.com") {
      return "https://api.docuseal.com";
    }
    if (hostname === "docuseal.eu" || hostname === "www.docuseal.eu") {
      return "https://api.docuseal.eu";
    }
    if (/^api\.docuseal\.(com|eu)$/i.test(hostname)) {
      return url.origin.replace(/\/+$/, "");
    }

    return url.origin.replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

export function deriveDocuSealSignerBaseUrl(value: string | null | undefined) {
  const apiBaseUrl = normalizeDocuSealApiBaseUrl(value);
  if (!apiBaseUrl) return "";

  try {
    const url = new URL(apiBaseUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "api.docuseal.com") return "https://docuseal.com";
    if (hostname === "api.docuseal.eu") return "https://docuseal.eu";

    return url.origin.replace(/\/api$/, "").replace(/\/+$/, "");
  } catch {
    return apiBaseUrl.replace(/\/api$/, "").replace(/\/+$/, "");
  }
}

export function isMockDocuSealBaseUrl(value: string | null | undefined) {
  const normalized = normalizeDocuSealBaseUrl(value);
  return normalized.includes("example.test") || normalized.includes("localhost");
}

function jsonHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Auth-Token": apiKey,
  };
}

export async function createDocuSealSubmission(input: DocuSealCreateSubmissionInput): Promise<DocuSealSubmissionResponse> {
  const baseUrl = normalizeDocuSealApiBaseUrl(input.baseUrl);
  const rawTemplateId = trim(input.templateId);

  if (!baseUrl) throw new Error("DocuSeal base URL is required");

  if (isMockDocuSealBaseUrl(baseUrl)) {
    return {
      id: `mock-${input.packetId}`,
      slug: `mock-submission-${input.packetId}`,
      status: "pending",
      submitters: [
        {
          slug: `mock-signer-${input.packetId}`,
          email: input.recipientEmail,
          name: input.recipientName || null,
          external_id: input.packetId,
          status: "pending",
        },
      ],
    };
  }

  const templateId = Number.parseInt(rawTemplateId, 10);
  if (!Number.isFinite(templateId)) throw new Error("DocuSeal template ID must be numeric");

  if (!trim(input.apiKey)) {
    throw new Error("DocuSeal API key is not configured");
  }

  const response = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: jsonHeaders(input.apiKey),
    body: JSON.stringify({
      template_id: templateId,
      send_email: true,
      order: "preserved",
      completed_redirect_url: trim(input.completedRedirectUrl) || undefined,
      message: input.packetMessage
        ? {
            subject: input.packetTitle,
            body: input.packetMessage,
          }
        : undefined,
      submitters: [
        {
          name: trim(input.recipientName) || undefined,
          email: input.recipientEmail,
          role: input.recipientRole,
          external_id: input.packetId,
          send_email: true,
          completed_redirect_url: trim(input.completedRedirectUrl) || undefined,
          metadata: {
            oasis_packet_id: input.packetId,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.error || body?.message || `DocuSeal submission creation failed (${response.status})`);
  }

  return await response.json();
}

export async function getDocuSealSubmission({
  apiKey,
  baseUrl,
  submissionId,
}: {
  apiKey: string;
  baseUrl: string;
  submissionId: string | number;
}): Promise<DocuSealSubmissionResponse> {
  const normalizedBaseUrl = normalizeDocuSealApiBaseUrl(baseUrl);
  if (isMockDocuSealBaseUrl(normalizedBaseUrl)) {
    return {
      id: submissionId,
      status: "completed",
      combined_document_url: `${normalizedBaseUrl}/signed/${submissionId}.pdf`,
      submitters: [],
      documents: [
        {
          name: `signed-${submissionId}.pdf`,
          url: `${normalizedBaseUrl}/signed/${submissionId}.pdf`,
        },
      ],
    };
  }

  const response = await fetch(`${normalizedBaseUrl}/submissions/${submissionId}`, {
    method: "GET",
    headers: jsonHeaders(apiKey),
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.error || body?.message || `DocuSeal submission lookup failed (${response.status})`);
  }
  return await response.json();
}

export async function downloadDocuSealDocument({
  apiKey,
  baseUrl,
  submissionId,
  submission,
}: {
  apiKey: string;
  baseUrl: string;
  submissionId: string | number;
  submission?: DocuSealSubmissionResponse | null;
}) {
  const normalizedBaseUrl = normalizeDocuSealApiBaseUrl(baseUrl);
  if (isMockDocuSealBaseUrl(normalizedBaseUrl)) {
    const content = new TextEncoder().encode("%PDF-1.4\n% mock signed document\n");
    return {
      bytes: content,
      filename: `signed-${submissionId}.pdf`,
      mimeType: "application/pdf",
    };
  }

  const existingUrl =
    submission?.combined_document_url ||
    submission?.documents?.find((doc) => doc?.url)?.url ||
    null;

  let documentUrl = existingUrl;

  if (!documentUrl) {
    const documentsResponse = await fetch(`${normalizedBaseUrl}/submissions/${submissionId}/documents?merge=true`, {
      method: "GET",
      headers: jsonHeaders(apiKey),
    });

    if (!documentsResponse.ok) {
      const body = await safeJson(documentsResponse);
      throw new Error(body?.error || body?.message || `DocuSeal document lookup failed (${documentsResponse.status})`);
    }

    const documentsPayload = await documentsResponse.json();
    documentUrl = documentsPayload?.documents?.find((doc: any) => trim(doc?.url))?.url || null;
  }

  if (!documentUrl) {
    throw new Error("DocuSeal did not provide a downloadable signed document URL");
  }

  const response = await fetch(documentUrl, {
    method: "GET",
    headers: trim(apiKey) ? { "X-Auth-Token": apiKey } : undefined,
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.error || body?.message || `DocuSeal document download failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const contentType = trim(response.headers.get("content-type")) || "application/pdf";
  return {
    bytes,
    filename: submission?.documents?.find((doc) => doc?.name)?.name || `signed-${submissionId}.pdf`,
    mimeType: contentType.includes("pdf") ? "application/pdf" : contentType,
  };
}

export function mapDocuSealStatus(rawStatus: string | null | undefined) {
  const status = trim(rawStatus).toLowerCase();
  if (status === "completed") return "completed";
  if (status === "declined") return "failed";
  if (status === "expired") return "cancelled";
  if (status === "pending") return "pending";
  return "pending";
}

export function deriveDocuSealPacketId(payload: any): string {
  const data = payload?.data || payload || {};
  const submitters = Array.isArray(data?.submitters) ? data.submitters : [];
  const packetIdFromSubmitter = submitters
    .map((submitter: any) => trim(submitter?.external_id))
    .find(Boolean);

  if (packetIdFromSubmitter) return packetIdFromSubmitter;

  return trim(data?.metadata?.oasis_packet_id);
}

export function deriveDocuSealSubmissionId(payload: any): string {
  const data = payload?.data || payload || {};
  return trim(data?.id);
}

export async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
