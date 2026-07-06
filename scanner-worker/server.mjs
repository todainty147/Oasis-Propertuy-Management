import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || process.env.DOCUMENT_SCANNER_PORT || "8787");
const DOCUMENT_SCAN_SERVICE_TOKEN = process.env.DOCUMENT_SCAN_SERVICE_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CLAMAV_HOST = process.env.CLAMAV_HOST || "clamav";
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT || "3310");
const BUCKET    = "documents";
const WO_BUCKET = "work-order-attachments";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!DOCUMENT_SCAN_SERVICE_TOKEN) {
  console.error("Missing DOCUMENT_SCAN_SERVICE_TOKEN");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    if (!isAuthorized(req.headers.authorization || "")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const body = await readJson(req);

    if (req.url === "/scan-document") {
      const documentId = String(body?.documentId || "").trim();
      if (!documentId) {
        return json(res, 400, { error: "documentId is required" });
      }
      const result = await scanDocument(documentId);
      return json(res, 200, { ok: true, ...result });
    }

    if (req.url === "/scan-work-order-attachment") {
      const attachmentId = String(body?.attachmentId || "").trim();
      if (!attachmentId) {
        return json(res, 400, { error: "attachmentId is required" });
      }
      const result = await scanWorkOrderAttachment(attachmentId);
      return json(res, 200, { ok: true, ...result });
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "scanner_worker_error",
      url: req.url,
      message: error?.message || String(error),
    }));
    return json(res, 500, { error: "Scan failed" });
  }
});

server.listen(PORT, () => {
  console.log(`Document scanner worker listening on ${PORT}`);
});

async function scanDocument(documentId) {
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, account_id, storage_path, storage_path_quarantine, mime_type, upload_status, scan_status")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    throw documentError || new Error("Document not found");
  }

  if (document.upload_status !== "uploaded") {
    throw new Error("Document upload is not complete");
  }

  const quarantinePath = String(document.storage_path_quarantine || document.storage_path || "").trim();
  if (!quarantinePath || !quarantinePath.startsWith("quarantine/")) {
    throw new Error("Document has no quarantine storage path");
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(quarantinePath);

  if (downloadError || !fileData) {
    throw downloadError || new Error("Document could not be downloaded for scanning");
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const scan = await scanWithClamAv(buffer);

  if (scan.status === "clean") {
    const activePath = quarantinePath.replace(/^quarantine\//, "active/");
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(activePath, buffer, {
        contentType: document.mime_type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const recorded = await supabase.rpc("record_document_scan_result", {
      p_document_id: documentId,
      p_scan_status: "clean",
      p_scan_provider: "clamav",
      p_scan_reference_id: scan.reference,
      p_quarantine_reason: null,
      p_scanned_by_system: true,
      p_storage_path_active: activePath,
      p_scan_error: null,
    });

    if (recorded.error) {
      throw recorded.error;
    }

    const cleanup = await supabase.storage.from(BUCKET).remove([quarantinePath]);
    if (cleanup.error) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "document_scan_quarantine_cleanup_failed",
        documentId,
        message: cleanup.error.message || "Could not remove quarantine object",
      }));
    }
    return { documentId, scanStatus: "clean" };
  }

  const recorded = await supabase.rpc("record_document_scan_result", {
    p_document_id: documentId,
    p_scan_status: scan.status,
    p_scan_provider: "clamav",
    p_scan_reference_id: scan.reference,
    p_quarantine_reason: scan.reason,
    p_scanned_by_system: true,
    p_storage_path_active: null,
    p_scan_error: scan.status === "scan_failed" ? scan.reason : null,
  });

  if (recorded.error) {
    throw recorded.error;
  }

  return { documentId, scanStatus: scan.status };
}

async function scanWorkOrderAttachment(attachmentId) {
  // D1: reuse scanWithClamAv — no separate ClamAV implementation.
  // D4: fail-closed-at-serve (not quarantine/active model).
  //     Files stay at their original storage path; the serve gate
  //     (signed-work-order-attachment-url) gates on scan_status='clean'.
  //     No storage object movement on any verdict.
  // Storage path resolved from the trusted DB row keyed by attachmentId.
  // The caller (handler.js / scanner worker's own call path) never supplies a path.

  const { data: attachment, error: lookupError } = await supabase
    .from("work_order_attachments")
    .select("id, account_id, storage_bucket, storage_path, mime_type, scan_status")
    .eq("id", attachmentId)
    .single();

  if (lookupError || !attachment) {
    throw lookupError || new Error("Work-order attachment not found: " + attachmentId);
  }

  // Terminal idempotency: clean and flagged are final; skip gracefully.
  // scan_failed is retryable so the worker will re-attempt.
  if (attachment.scan_status === "clean" || attachment.scan_status === "flagged") {
    return { attachmentId, scanStatus: attachment.scan_status, skipped: true };
  }

  const storagePath = String(attachment.storage_path || "").trim();
  if (!storagePath) {
    throw new Error("Work-order attachment has no storage_path: " + attachmentId);
  }

  const bucket = String(attachment.storage_bucket || WO_BUCKET).trim();

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(storagePath);

  if (downloadError || !fileData) {
    const reason = downloadError?.message || "storage download returned no data";
    // Record transient failure so the DB reflects the attempt
    const { error: recordErr } = await supabase.rpc("record_work_order_attachment_scan_result", {
      p_attachment_id:      attachmentId,
      p_scan_status:        "scan_failed",
      p_scan_engine:        "clamav",
      p_scan_signature:     null,
      p_scan_failed_reason: reason,
    });
    if (recordErr) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "woa_scan_record_failed",
        attachmentId,
        message: recordErr.message,
      }));
    }
    return { attachmentId, scanStatus: "scan_failed" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const scan = await scanWithClamAv(buffer);

  const { error: recordError } = await supabase.rpc("record_work_order_attachment_scan_result", {
    p_attachment_id:      attachmentId,
    p_scan_status:        scan.status,
    p_scan_engine:        "clamav",
    p_scan_signature:     scan.status === "flagged"     ? scan.reference : null,
    p_scan_failed_reason: scan.status === "scan_failed" ? scan.reason    : null,
  });

  if (recordError) {
    throw recordError;
  }

  // D3/D8: never delete attachment bytes — flagged files are retained as evidence.
  // No storage object movement regardless of verdict (D4 fail-closed-at-serve model).

  return { attachmentId, scanStatus: scan.status };
}

function scanWithClamAv(buffer) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT });
    const chunks = [];
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(30000, () => {
      settle({
        status: "scan_failed",
        reference: "clamav_timeout",
        reason: "Scanner timed out",
      });
    });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 8192) {
        const chunk = buffer.subarray(offset, offset + 8192);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });

    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", (error) => {
      settle({
        status: "scan_failed",
        reference: "clamav_error",
        reason: error?.message || "Scanner connection failed",
      });
    });
    socket.on("close", () => {
      if (settled) return;
      const reference = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      if (/\bOK$/i.test(reference)) {
        settle({ status: "clean", reference, reason: null });
      } else if (/\bFOUND$/i.test(reference)) {
        settle({ status: "flagged", reference, reason: reference });
      } else {
        settle({
          status: "scan_failed",
          reference: reference || "clamav_empty_response",
          reason: reference || "Scanner returned no result",
        });
      }
    });
  });
}

function isAuthorized(header) {
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(DOCUMENT_SCAN_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}
