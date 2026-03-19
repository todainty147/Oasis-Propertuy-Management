# Security Observability

This note tracks how security-sensitive denied paths currently surface in OASIS and which workflows now provide richer diagnostics in staging and production.

## What Was Improved

- Key backend RPCs now raise structured exceptions with:
  - stable primary message text
  - `errcode`
  - safe `detail` payload from `public.security_failure_context(...)`
  - actionable `hint`
- Client-side workflow wrappers now log those structured failures with small, scrubbed context blocks instead of ad hoc error objects.
- A new append-only `public.security_denied_events` stream can now durably record high-signal denied events after the caller receives the original error in a separate follow-up request.
- The core read guards `assert_manage_account_access(...)` and `assert_tenant_scope_access(...)` now also emit structured `detail` / `hint` payloads, which makes denied reads easier to classify and persist from app-side catch paths.
- The shared client failure logger now classifies failures as either:
  - `authorization_denied`
  - `unexpected_security_failure`
- An opt-in hosted aggregation path now exists through:
  - `public.security_observability_events`
  - `supabase/functions/ingest-security-observability`
  - `VITE_ENABLE_HOSTED_SECURITY_LOG_SINK=true`
- Hosted sink rows now also have:
  - a manager-safe read RPC: `public.security_observability_event_feed(...)`
  - a lightweight retention helper: `public.cleanup_security_observability_events(...)`
  - a minimal read-only operator view inside the Security Audit page
- Guard-function denials are surfaced with stable correlation fields:
  - `surface`
  - `reason`
  - `accountId`
  - `entityType`
  - `entityId`
  - `guardDenied`

## Easier To Diagnose Now

- notification creation denied for:
  - missing manager role
  - empty recipients
  - foreign or invalid recipients
- invite acceptance failures:
  - not authenticated
  - invitation not found
  - invitation email mismatch
  - invitation revoked
  - invitation expired
- contractor workflow authorization failures:
  - non-assigned contractor attempts
  - manager-only quote approval/rejection denials
  - invoice save before approval
  - quote edits after submit/approval
- work order status workflow failures:
  - non-member direct status mutation attempts
  - invalid transitions
  - missing work orders
- document and storage failures now classify consistently for:
  - document stub creation (`create_document_stub`)
  - document upload finalization (`finalize_document_upload`)
  - document row reads/searches (`documents_select`, `documents_search`)
  - preview signed URL failures (`document_preview_url`)
  - storage download failures (`document_storage_download`)
  - document tag metadata writes (`set_document_tags`)
  - document delete RPC failures (`delete_document_and_audit`)
  - document audit log reads (`document_audit_log_select`)
  - best-effort storage delete cleanup after DB delete (`document_storage_delete`)
  - those paths now also preserve safe provider correlation fields when available:
    - `providerStatus`
    - `providerRequestId`
    - `providerTraceId`
    - `providerName`
    - `providerCode`
- denied read surfaces captured through app follow-up logging:
  - `dashboard_snapshot`
  - `finance_snapshot`
  - `tenant_activity_feed`
  - `command_center_items`
  - `attention_center_items`
  - `portfolio_attention_items`
  - `portfolio_health_snapshot`
- high-value guard-function read denials now classify cleanly in logs:
  - manager-scope denials via `assert_manage_account_access(...)`
  - tenant-scope denials via `assert_tenant_scope_access(...)`
- manager-only read surfaces improved by that classification include:
  - `command_center_items`
  - `attention_center_items`
  - `maintenance_kpi_snapshot`
  - `property_operational_health_snapshot`
  - `playbook_status_snapshot`
  - `portfolio_weekly_summary`
- tenant/account scoped read surfaces improved by that classification include:
  - `dashboard_snapshot`
  - `dashboard_hub_extras`
  - `finance_snapshot`
  - `tenant_activity_feed`
  - `portfolio_attention_items`
  - `portfolio_health_snapshot`
- durable denied contractor workflow and invite failures captured through app follow-up logging:
  - `accept_account_invite`
  - `create_notifications`
  - `work_order_set_status`
  - `wo_fin_upsert_quote_draft`
  - `wo_fin_submit_quote`
  - `wo_fin_upsert_invoice`
  - `wo_fin_approve_quote`
  - `wo_fin_reject_quote`
  - `contractor_update_work_order`

## Safety Rules

- no invite token logging
- no email logging in the shared client failure logger
- no raw metadata/body dumping from notification writes
- no document filenames, original filenames, signed URLs, or storage paths in shared structured logs
- storage bucket names are allowed in logs; storage paths are not
- backend `detail` payloads use account/work-order/invite ids and reason codes, not secrets
- denied-event rows are short-window deduped and only store scrubbed correlation metadata
- durable denied-event inserts are allowed only for authenticated actors that can be linked back to the target account or entity scope

## Remaining Gaps

- denied events are durable only when the application or caller performs the follow-up `record_security_denied_event(...)` request after catching the original error
- because PostgreSQL exceptions roll back the original transaction, pure SQL-only callers that do not perform that follow-up still will not create durable denied rows
- missing-auth browser failures are still mostly console/runtime visible, because anonymous callers are intentionally not allowed to write to the denied-event stream
- surfaces that still call guard-protected RPCs without the shared app service wrappers will only benefit from structured guard exceptions, not the richer client-side classification block
- Edge Functions and browser UI still rely on console/runtime logs rather than a centralized hosted log sink
- the highest-signal invite Edge Function denial paths now classify and persist hosted events consistently, but other non-UI callers still vary
- direct provider-side storage policy denials can still require Supabase Storage logs for full root-cause analysis
- provider request/trace ids can now be carried into app-side diagnostics when the SDK exposes them, which makes cross-checking Storage logs easier
- best-effort storage cleanup failures after a successful document delete are now structured in app logs, but they are not authorization denials and are not persisted as denied events
- hosted aggregation is intentionally minimal in this pass; trend dashboards, alerting, and automated archive scheduling are still future work

See also:
- [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md)
- [DENIED_EVENT_COVERAGE_MATRIX.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/DENIED_EVENT_COVERAGE_MATRIX.md)
- [runbooks/README.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/README.md)
