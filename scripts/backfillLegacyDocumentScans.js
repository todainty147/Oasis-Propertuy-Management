import net from "node:net";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "documents";
const DEFAULT_LIMIT = 100;
const DEFAULT_CLAMAV_HOST = "127.0.0.1";
const DEFAULT_CLAMAV_PORT = 3310;

const args = parseArgs(process.argv.slice(2));
const execute = Boolean(args.execute);
const limit = clampInteger(args.limit, DEFAULT_LIMIT, 1, 1000);
const clamAvHost = args.clamavHost || process.env.CLAMAV_HOST || DEFAULT_CLAMAV_HOST;
const clamAvPort = clampInteger(args.clamavPort || process.env.CLAMAV_PORT, DEFAULT_CLAMAV_PORT, 1, 65535);
const removeLegacyClean = Boolean(args.removeLegacyClean);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

if (!execute) {
  console.log("Dry run only. Re-run with --execute to scan, upload active copies, and record results.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const summary = {
  mode: execute ? "execute" : "dry-run",
  totalLegacyUploaded: 0,
  considered: 0,
  clean: 0,
  flagged: 0,
  failed: 0,
  skipped: 0,
  removedLegacy: 0,
};

try {
  summary.totalLegacyUploaded = await countLegacyUploadedDocuments();
  console.log(JSON.stringify({
    event: "legacy_document_scan_backfill_start",
    mode: summary.mode,
    totalLegacyUploaded: summary.totalLegacyUploaded,
    limit,
  }));

  const documents = await fetchLegacyDocuments(limit);
  summary.considered = documents.length;

  for (const document of documents) {
    try {
      const result = execute
        ? await scanAndRecord(document)
        : previewLegacyDocument(document);
      summary[result] = (summary[result] || 0) + 1;
    } catch (error) {
      summary.failed = (summary.failed || 0) + 1;
      logResult(document, "scan_failed", null, error);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}

async function countLegacyUploadedDocuments() {
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("scan_status", "legacy_unscanned")
    .eq("upload_status", "uploaded")
    .not("storage_path", "is", null);

  if (error) throw error;
  return count || 0;
}

async function fetchLegacyDocuments(maxRows) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, account_id, storage_path, storage_path_active, mime_type, upload_status, scan_status")
    .eq("scan_status", "legacy_unscanned")
    .eq("upload_status", "uploaded")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(maxRows);

  if (error) throw error;
  return data || [];
}

function previewLegacyDocument(document) {
  const storagePath = String(document.storage_path || "").trim();
  const activePath = buildActivePath(document, storagePath);
  if (!storagePath || !activePath) return "skipped";

  console.log(JSON.stringify({
    event: "legacy_document_scan_dry_run",
    documentId: document.id,
    accountId: document.account_id,
    storagePath,
    activePath,
  }));
  return "skipped";
}

async function scanAndRecord(document) {
  const storagePath = String(document.storage_path || "").trim();
  const activePath = buildActivePath(document, storagePath);
  if (!storagePath || !activePath) return "skipped";

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);

    if (downloadError || !fileData) {
      throw downloadError || new Error("Could not download legacy object");
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const scan = await scanWithClamAv(buffer);

    if (scan.status === "clean") {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(activePath, buffer, {
          contentType: document.mime_type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      await recordScanResult(document.id, {
        scanStatus: "clean",
        reference: scan.reference,
        activePath,
      });

      if (removeLegacyClean && activePath !== storagePath) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
        if (removeError) throw removeError;
        summary.removedLegacy += 1;
      }

      logResult(document, "clean", activePath);
      return "clean";
    }

    await recordScanResult(document.id, {
      scanStatus: scan.status,
      reference: scan.reference,
      reason: scan.reason,
      activePath: null,
      scanError: scan.status === "scan_failed" ? scan.reason : null,
    });

    logResult(document, scan.status, null);
    return scan.status === "flagged" ? "flagged" : "failed";
  } catch (error) {
    await recordScanResult(document.id, {
      scanStatus: "scan_failed",
      reference: "legacy_backfill_error",
      reason: error?.message || "Legacy backfill failed",
      activePath: null,
      scanError: error?.message || "Legacy backfill failed",
    });
    logResult(document, "scan_failed", null, error);
    return "failed";
  }
}

async function recordScanResult(documentId, {
  scanStatus,
  reference = null,
  reason = null,
  activePath = null,
  scanError = null,
}) {
  const { error } = await supabase.rpc("record_document_scan_result", {
    p_document_id: documentId,
    p_scan_status: scanStatus,
    p_scan_provider: "clamav",
    p_scan_reference_id: reference,
    p_quarantine_reason: reason,
    p_scanned_by_system: true,
    p_storage_path_active: activePath,
    p_scan_error: scanError,
  });

  if (error) throw error;
}

function buildActivePath(document, storagePath) {
  const filename = String(storagePath || "").split("/").pop();
  if (!document?.account_id || !document?.id || !filename) {
    console.warn(JSON.stringify({
      event: "legacy_document_scan_malformed_path",
      documentId: document?.id || null,
      accountId: document?.account_id || null,
      storagePath,
    }));
    return null;
  }
  return `active/${document.account_id}/${document.id}/${filename}`;
}

function scanWithClamAv(buffer) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: clamAvHost, port: clamAvPort });
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

function logResult(document, scanStatus, activePath, error = null) {
  console.log(JSON.stringify({
    event: "legacy_document_scan_result",
    documentId: document.id,
    accountId: document.account_id,
    scanStatus,
    activePath,
    error: error?.message || null,
  }));
}

function parseArgs(argv) {
  const parsed = {
    execute: false,
    help: false,
    limit: DEFAULT_LIMIT,
    clamavHost: "",
    clamavPort: DEFAULT_CLAMAV_PORT,
    removeLegacyClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") parsed.execute = true;
    else if (arg === "--dry-run") parsed.execute = false;
    else if (arg === "--remove-legacy-clean") parsed.removeLegacyClean = true;
    else if (arg === "--limit") {
      parsed.limit = argv[index + 1];
      index += 1;
    } else if (arg === "--clamav-host") {
      parsed.clamavHost = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--clamav-port") {
      parsed.clamavPort = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    }
  }

  return parsed;
}

function clampInteger(value, fallback, min, max) {
  const next = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, min), max);
}

function printHelp() {
  console.log(`Legacy document malware scan backfill

Usage:
  npm run documents:scan:legacy -- --dry-run --limit 50
  npm run documents:scan:legacy -- --execute --limit 50

Environment:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY
  CLAMAV_HOST optional, defaults to 127.0.0.1
  CLAMAV_PORT optional, defaults to 3310

Options:
  --dry-run              List candidate legacy rows. This is the default.
  --execute              Download, scan, upload active copies, and record scan results.
  --limit <n>            Maximum rows to process, 1-1000. Default 100.
  --clamav-host <host>   Override CLAMAV_HOST.
  --clamav-port <port>   Override CLAMAV_PORT.
  --remove-legacy-clean  Remove the old legacy object after a clean active copy is recorded.
  --help                 Show this help.
`);
}
