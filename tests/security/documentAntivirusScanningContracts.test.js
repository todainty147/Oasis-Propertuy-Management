import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("document antivirus scanning contracts", () => {
  it("applies the scanner SQL after legacy document storage policies", () => {
    const applyScript = read("scripts/dbApplyRepoSql.js");
    const storageIndex = applyScript.indexOf('"storage_documents_policies.sql"');
    const scannerIndex = applyScript.indexOf('"document_antivirus_scanning.sql"');

    expect(scannerIndex).toBeGreaterThan(storageIndex);
  });

  it("keeps document scan state and scan-result invariants in SQL", () => {
    const sql = read("supabase/document_antivirus_scanning.sql");

    expect(sql).toContain("'legacy_unscanned', 'pending_scan', 'clean', 'flagged', 'scan_failed'");
    expect(sql).toContain("document_audit_log_action_check");
    expect(sql).toContain("'access'");
    expect(sql).toContain("'scan_requested'");
    expect(sql).toContain("'scan_clean'");
    expect(sql).toContain("'scan_flagged'");
    expect(sql).toContain("Clean scan result requires active storage path");
    expect(sql).toContain("Quarantine reason is required for flagged documents");
    expect(sql).toContain("Scan failure reason is required");
    expect(sql).toMatch(/for update/i);
    expect(sql).toContain("Document scan bypass is disabled");
  });

  it("requires quarantine uploads and disables direct browser storage bypasses", () => {
    const sql = read("supabase/document_antivirus_scanning.sql");

    expect(sql).toContain("can_insert_document_quarantine_storage");
    expect(sql).toContain("v_parts[1] <> 'quarantine'");
    expect(sql).toContain("drop policy if exists \"documents_storage_insert_member_stub\"");
    expect(sql).toContain("public.can_insert_document_quarantine_storage(name)");
    expect(sql).toContain("storage_path_quarantine");
    expect(sql).toContain("storage_path_active");
  });

  it("routes document preview and download through the scanner-gated Edge Function", () => {
    const service = read("src/services/documentService.js");

    expect(service).toContain('supabase.functions.invoke("signed-document-url"');
    expect(service).toContain('supabase.functions.invoke("scan-document"');
    expect(service).not.toContain('createSignedStorageUrl("documents"');
    expect(service).not.toContain('.from("documents")\n    .download');
    expect(service).not.toContain("void storagePath");
    expect(service).toContain("URL.createObjectURL(blob)");
    expect(service).toContain("await fetch(signedUrl)");
  });

  it("exposes the document service provenance timeline from the documents list", () => {
    const page = read("src/pages/Documents.jsx");
    const messages = read("src/i18n/messages.js");

    expect(page).toContain('to={`/documents/${doc.id}/service-timeline`}');
    expect(page).toContain('t("documents.provenanceTimeline")');
    expect(messages).toContain('"documents.provenanceTimeline": "Provenance"');
  });

  it("defines Edge Functions for signed document links and scan dispatch", () => {
    const signedUrl = read("supabase/functions/signed-document-url/index.ts");
    const scanDocument = read("supabase/functions/scan-document/index.ts");

    expect(signedUrl).toContain("audit_document_access");
    expect(signedUrl).toContain(".createSignedUrl(storagePath");
    expect(scanDocument).toContain("request_document_scan");
    expect(scanDocument).toContain("DOCUMENT_SCAN_SERVICE_URL");
    expect(scanDocument).toContain("DOCUMENT_SCAN_SERVICE_TOKEN");
    expect(scanDocument.indexOf("DOCUMENT_SCAN_SERVICE_URL || !DOCUMENT_SCAN_SERVICE_TOKEN"))
      .toBeLessThan(scanDocument.indexOf('userClient.rpc("request_document_scan"'));
    expect(scanDocument).toContain("scanStatus: normalizeScanStatus(payload)");
    expect(scanDocument).not.toContain("scanner: payload");
  });

  it("defines a ClamAV worker that records clean files only with an active path", () => {
    const worker = read("scanner-worker/server.mjs");

    expect(worker).toContain("zINSTREAM");
    expect(worker).toContain('storage_path_quarantine');
    expect(worker).toContain('activePath = quarantinePath.replace(/^quarantine\\//, "active/")');
    expect(worker).toContain("record_document_scan_result");
    expect(worker).toContain('p_storage_path_active: activePath');
    expect(worker).toContain('socket.on("close"');
    expect(worker).toContain("if (settled) return");
    expect(worker).toContain("document_scan_quarantine_cleanup_failed");
  });

  it("provides dry-run-first legacy scan backfill tooling before RLS tightening", () => {
    const script = read("scripts/backfillLegacyDocumentScans.js");
    const packageJson = read("package.json");
    const rollout = read("docs/DOCUMENT_ANTIVIRUS_SCANNING_ROLLOUT.md");

    expect(packageJson).toContain('"documents:scan:legacy"');
    expect(script).toContain("Dry run only");
    expect(script).toContain("--execute");
    expect(script).toContain('scan_status", "legacy_unscanned"');
    expect(script).toContain('active/${document.account_id}/${document.id}/${filename}');
    expect(script).toContain("record_document_scan_result");
    expect(script).toContain("zINSTREAM");
    expect(script).toContain("countLegacyUploadedDocuments");
    expect(script).toContain("totalLegacyUploaded");
    expect(script).toContain("removedLegacy");
    expect(script).toContain('event: "legacy_document_scan_malformed_path"');
    expect(script).toContain('socket.on("close"');
    expect(script).toContain("if (settled) return");
    expect(rollout).toContain("npm run documents:scan:legacy -- --dry-run");
    expect(rollout).toContain("Only after the final report shows no remaining `legacy_unscanned` rows");
  });

  it("keeps scanner compose mounts scoped and persists ClamAV definitions", () => {
    const compose = read("docker-compose.clamav.yml");

    expect(compose).not.toContain("- .:/app:ro");
    expect(compose).toContain("- ./scanner-worker:/app/scanner-worker:ro");
    expect(compose).toContain("- ./node_modules:/app/node_modules:ro");
    expect(compose).toContain("- clamav_data:/var/lib/clamav");
    expect(compose).toContain("volumes:\n  clamav_data:");
  });
});
