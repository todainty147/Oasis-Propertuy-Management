# Document Antivirus Scanning Rollout

This rollout is intentionally split into gates.

## Slice 1: new document uploads

- New document and document-request uploads are written to `quarantine/...`.
- Uploaded rows stay `pending_scan` until the private scanner records a result.
- Clean files are promoted to `active/...`.
- Browser preview and download go through `signed-document-url`, which calls `audit_document_access` before issuing a signed URL.
- Direct authenticated storage access for new quarantine/active paths remains blocked by the existing UUID-prefixed storage SELECT policy.

## Legacy file gate

Rows created before this rollout use `scan_status = 'legacy_unscanned'`. Those files remain readable through the legacy path during the transition, but they cannot be promoted by the normal user-triggered scan RPC because they do not have a quarantine object.

Before tightening storage SELECT policies to require `scan_status = 'clean'`, run the service-role backfill script:

```bash
npm run documents:scan:legacy -- --dry-run --limit 50
npm run documents:scan:legacy -- --execute --limit 50
```

The script requires `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`, and a reachable ClamAV service (`CLAMAV_HOST` / `CLAMAV_PORT`). It:

1. Reads `legacy_unscanned` document rows.
2. Downloads the existing legacy storage object.
3. Scans it with the same ClamAV worker.
4. Uploads clean files to `active/{account_id}/{document_id}/{filename}`.
5. Calls `record_document_scan_result` with `p_scan_status = 'clean'` and `p_storage_path_active`.
6. Records flagged or failed files through `record_document_scan_result` without an active path.
7. Produces a dry-run and final-count report.

Only after the final report shows no remaining `legacy_unscanned` rows should a follow-up migration tighten document storage SELECT policies to clean active documents.

## Later surfaces

Templates, work-order attachments, and maintenance-request attachments need their own rollout slices. Maintenance attachments require a metadata-table backfill before scan enforcement because the current implementation lists storage objects directly.
