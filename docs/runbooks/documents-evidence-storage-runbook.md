# Documents / Evidence / Storage Runbook

## Purpose

Use this for document upload, preview/download, document service evidence, tenant visibility, signatures, extraction, PDF export, and storage policy issues.

## Scope and current status

Documents and evidence are customer-facing and security-sensitive. Some proof pack/PDF surfaces are demo-gated depending on module. Storage access must remain account, tenant, contractor, and visibility scoped.

## Critical invariants

- Browser access must use authorized signed URLs or Edge Function mediation.
- Storage paths must remain account-scoped.
- Tenant-visible documents require explicit visibility and tenant association.
- Evidence/service events must not be forged by browser clients.
- Document provenance timeline must show stale/integrity status honestly.

## Key files

- `src/pages/Documents.jsx`
- `src/services/documentService.js`
- `src/services/storageUrlService.js`
- `src/services/provenanceDocumentService.js`
- `src/pages/provenance/DocumentServiceTimelinePage.jsx`
- `supabase/storage_buckets.sql`
- `supabase/storage_documents_policies.sql`
- `supabase/document_*.sql`
- `supabase/provenance_document_service.sql`
- `docs/runbooks/document-workflow-operations.md`
- `docs/runbooks/document-extraction-worker-operations.md`

## Data model / RPCs / functions

Relevant objects include `documents`, document extraction rows, document requests/uploads, packets/signatures, service evidence events, storage buckets/policies, and signed URL Edge Functions.

## Normal operation

1. User uploads document under account-scoped path.
2. App records document metadata and optional extraction/provenance events.
3. Preview/download uses authorized URL path.
4. Tenant visibility/service evidence is recorded only through approved server paths.
5. Proof packs/PDF exports reference traceable document evidence.

## Common failure modes

- Preview/download returns forbidden: signed URL RPC or storage path authorization failed.
- Upload failed: bucket policy, path, or Edge Function error.
- Missing file: metadata row exists but storage object is absent or moved.
- Evidence link missing: document exists but service/proof event was not recorded.
- PDF unreadable: export renderer issue or unsupported source file.
- Extraction stale/missing: worker not deployed, skipped format, or failed job.

## Triage checklist

1. Confirm account id, document id, storage path, owner/tenant/contractor context.
2. Check document metadata and visibility.
3. Check storage object exists under expected account path.
4. Check signed URL Edge Function/RPC response and security observer logs.
5. Check provenance/document service events if service evidence is expected.
6. Check extraction worker state for text issues.

## Safe operator actions

- Ask user to re-upload if no evidence depends on the missing file.
- Rerun extraction through supported UI/action.
- Repair documented legacy template stub paths via existing repair RPC where applicable.

## Unsafe actions / never do

- Do not make buckets public to fix downloads.
- Do not copy files between account paths.
- Do not manually mark service/proof evidence without the approved RPC.
- Do not hide stale timeline/integrity warnings.

## Customer-safe wording

“We are checking the document record, storage object, and evidence links. Access is intentionally account-scoped, so we will not bypass storage policies while investigating.”

## Escalation

Escalate for cross-account storage exposure, forged service events, repeated signed URL failures, missing evidence after successful service, or PDF/export corruption.

## Recovery / rollback notes

Prefer re-upload or supported repair RPCs. Preserve document/evidence history if it has been used in a proof pack.

## Verification after fix

- Authorized user can preview/download.
- Unauthorized user remains denied.
- Evidence/provenance timeline is consistent.
- Extraction/PDF output is readable where applicable.

## Related tests

- Document/storage/provenance/security tests under `tests/security`, document e2e smoke tests, and extraction worker tests.
