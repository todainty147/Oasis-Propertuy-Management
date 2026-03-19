# Security Runbook: Provider Log Correlation

## Purpose

Correlate app-observed document/storage authorization failures with provider-side logs when app logs are not enough.

## Common Symptoms

- document preview fails
- upload finalization fails after storage upload
- download fails despite the document row existing
- app logs show a denial but the exact provider root cause is unclear

## Probable Causes

- Supabase Storage policy denial
- expired or invalid signed URL
- provider-side request failure outside Postgres
- document metadata row is valid but storage object/state is not

## Required Access / Tools

- browser/runtime logs
- Security Audit / hosted observability feed
- Supabase Storage logs
- SQL access to `documents` and `document_audit_log`

## Diagnosis

1. Capture the app-side event first.
2. From the log or hosted row, collect:
   - `documentId`
   - `accountId`
   - `correlationId`
   - `providerRequestId`
   - `providerTraceId`
   - `providerStatus`
   - `providerCode`
3. Check the document row:

```sql
select id, account_id, property_id, tenant_id, scope, visibility, upload_status, storage_path
from public.documents
where id = 'DOCUMENT_UUID'::uuid;
```

4. Check recent audit rows for the same document.
5. Use `providerRequestId` / `providerTraceId` in Supabase Storage/provider logs.

## Safe Remediation

- if the document row is wrong, fix the row in-account or recreate the document through the app flow
- if the storage object is missing but the DB row exists, repair carefully:
  - either re-upload and finalize properly
  - or mark/archive/remove the broken row with an approved process
- if the provider denied access correctly, do not widen storage policies

## Do Not Self-Remediate When

- the fix would require relaxing storage policies
- the row belongs to the wrong account and ownership is unclear
- the issue affects many documents at once

## Post-Fix Verification

- preview/download succeeds for the intended actor
- unauthorized actor still cannot access the same document
- no filenames, storage paths, or signed URLs were exposed in logs during the investigation

## Related Files

- [documentService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/documentService.js)
- [securityFailureLogger.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/securityFailureLogger.js)
- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
