# Denied-Event Coverage Matrix

This matrix tracks which OASIS security-sensitive surfaces currently produce durable rows in `public.security_denied_events`, which surfaces stop at structured exceptions or app logs, and which still depend mainly on provider logs or manual diagnosis.

Important scope note:
- `durable row` means the denial is captured only when the caller goes through an app/service flow that uses `logSecurityRelevantFailure(...)` and the follow-up `record_security_denied_event(...)` RPC succeeds.
- `hosted observability row` means the signal is persisted in `public.security_observability_events`; this is used for operational Edge Function failures that should not be modeled as account-user denied events.
- `structured exception` means the backend emits machine-readable `detail` / `hint`, but no durable denied row is guaranteed.
- `provider/app log only` means diagnosis is still mainly console/runtime/provider-side rather than durable in Postgres.

Last repo sweep:
- `2026-04-12`
- Swept `src/services`, `src/pages`, `supabase/functions`, `docs`, `docs/runbooks`, `tests/security`, and the integration security matrix for denied-event, hosted observability, provider correlation, and remaining-gap references.
- Result: core app/service security-sensitive flows are now covered by shared app-side classification or documented architectural limits. Scheduled Edge Functions now share hosted observability classification for cron auth/config/runtime/provider failures, and targeted fault-injection contracts now exercise missing RPC, timeout, notification-write, storage-upload, signed-URL, and Edge-failure normalization paths. Remaining gaps are intentionally provider-led or raw-SQL limitations outside the centralized app/edge path.

## Durable Follow-Up Coverage

| Surface | Type | Current denial signal | Actor types covered | Correlation richness | Known limitations | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| `dashboard_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account, tenant/property/payment-derived entity, reason, code, hint | only durable through `dashboardService` catch path | keep as-is |
| `dashboard_hub_extras` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account + guard reason + safe context | only durable through `dashboardService` | keep as-is |
| `finance_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account, tenant/payment-derived entity, reason, code, hint | only durable through `financeService` | keep as-is |
| `tenant_activity_feed` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account, tenant entity, reason, code, hint | only durable through `tenantTimelineService` | keep as-is |
| `maintenance_kpi_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, guard reason, code, hint | only durable through `maintenanceDashboardService` | keep as-is |
| `command_center_items` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, guard-denied flag, reason, code, hint | only durable through `commandCenterService` | keep as-is |
| `attention_center_items` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, guard-denied flag, reason, code, hint | only durable through `attentionCenterService` | keep as-is |
| `portfolio_attention_items` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account, tenant scope, reason, code, hint | only durable through `portfolioHealthService` | keep as-is |
| `portfolio_health_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff, tenant | account, tenant scope, reason, code, hint | only durable through `portfolioHealthService` | keep as-is |
| `property_operational_health_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, property scope, reason, code, hint | only durable through `propertyHealthScoreService` | keep as-is |
| `portfolio_weekly_summary` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, reason, code, hint | only durable through `reportingService` | keep as-is |
| `playbook_status_snapshot` | read RPC | durable row + structured exception + app log | owner, admin, staff | account, reason, code, hint, correlation id | permission denials are now preserved as authorization failures, but deployment/missing-object fallbacks still depend on client wrapper wording | keep as-is |
| `create_notifications` | write RPC | durable row + structured exception + app log | owner, admin, staff | account, notification target scope, reason, code, hint | raw SQL callers still bypass durable path | keep as-is |
| `accept_account_invite` | invite / membership | durable row + structured exception + app log | invited authenticated user | account, invitation entity, reason, code, hint | only durable through `Invite.jsx` flow | keep as-is |
| `create_account_invitation` | invite / membership | durable row + structured exception + app log | owner, admin, staff | account, invitation role, reason, code, hint | email-send follow-up failures may be operational rather than auth denials | keep as-is |
| `create_landlord_invitation` | invite / membership | durable row + structured exception + app log | root / root-account managers | account, role intent, reason, code, hint | OTP/email delivery still partly provider-dependent | keep as-is |
| `check_account_invitation_eligibility` | invite / membership | durable row + structured exception + app log | owner, admin, staff | account, role, reason, code, hint | only durable through `invitationService` | keep as-is |
| `revoke_invitation` | invite / membership | durable row + structured exception + app log | owner, admin, staff | account, invitation entity, reason, code | fallback legacy delete path still operationally noisy | keep as-is |
| `invite_user_edge_function` | invite / workflow | durable row + structured exception/app log | owner, admin, staff | account, role, correlation id, classified reason | only the highest-signal invite denial branches are normalized today | extend same helper to more Edge Functions if operational value grows |
| `work_order_set_status` | workflow write | durable row + structured exception + app log | owner, admin, staff, tenant (deny paths) | account, work order entity, reason, code, hint | page-driven flow only | keep as-is |
| `contractor_update_work_order` | contractor workflow write | durable row + structured exception + app log | contractor, owner/admin/staff (deny paths) | account, work order entity, reason, code, hint | page-driven flow only | keep as-is |
| `wo_fin_upsert_quote_draft` | contractor workflow write | durable row + structured exception + app log | contractor, owner/admin/staff/tenant (deny paths) | account, work order entity, reason, code, hint | only durable through shared workflow service/page flows | keep as-is |
| `wo_fin_submit_quote` | contractor workflow write | durable row + structured exception + app log | contractor, owner/admin/staff/tenant (deny paths) | account, work order entity, reason, code, hint | same as above | keep as-is |
| `wo_fin_upsert_invoice` | contractor workflow write | durable row + structured exception + app log | contractor, owner/admin/staff/tenant (deny paths) | account, work order entity, reason, code, hint | same as above | keep as-is |
| `wo_fin_approve_quote` / `wo_fin_reject_quote` | contractor workflow write | durable row + structured exception + app log | owner, admin, staff, contractor (deny paths) | account, work order entity, reason, code, hint | same as above | keep as-is |
| `create_document_stub` / `finalize_document_upload` | document write | durable row + structured exception + app log | owner, admin, staff, tenant, contractor | account, document/property/tenant scope, reason, code | storage provider-side failures may still need provider logs | keep as-is |
| `documents_select` / `documents_search` | document read | durable row + structured exception + app log | owner, admin, staff, tenant, contractor | account, document/property/tenant scope, reason, code | raw SQL/table callers still bypass durable path | keep as-is |
| `document_preview_url` / `document_storage_upload` / `document_storage_download` / `document_storage_delete` | document storage | durable row + app log, sometimes structured exception | owner, admin, staff, tenant, contractor | account, document id, scope, visibility, reason, provider request/trace when available, app storage operation id | provider/storage policy root cause may still sit outside Postgres, but app logs now carry safe provider/app correlation handles | keep as-is |
| `set_document_tags` / `delete_document_and_audit` / `document_audit_log_select` | document workflow | durable row + structured exception + app log | owner, admin, staff, tenant, contractor | account, document entity, reason, code, hint | best-effort storage delete cleanup is not a denied-event row | keep as-is |
| `contractor_work_order_cards` | contractor read RPC | durable row + structured exception/app log through shared service wrapper | contractor, owner/admin/staff/tenant deny paths | account, work order entity, reason, code | raw RPC callers still bypass app follow-up logging | keep as-is |
| `contractor_allowed_actions` | contractor read RPC | durable row + structured exception/app log through shared service wrapper | contractor, owner/admin/staff/tenant deny paths | account, work order entity, reason, code | page UX still intentionally falls back to empty actions after the shared service logs the denial | keep as-is |
| `ingest-security-observability` | hosted sink Edge Function | validates caller and inserts hosted row when app logger invokes it | authenticated account-linked callers | account, actor, role, category, kind, surface, entity, correlation id, scrubbed metadata | this is the sink itself, not a denied-event producer for its own failures | keep as-is |
| `invite-user` Edge Function | invite workflow | function-side classification + hosted observability insert for highest-signal invite denials | owner, admin, staff, root flows | account, role intent, invitation entity, correlation id | invite email provider delivery details remain in outbound email events/provider logs | keep as-is |

## Structured Exception / App Log Only

| Surface | Type | Current denial signal | Actor types covered | Correlation richness | Known limitations | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| raw SQL callers to guarded RPCs | mixed | structured exception only | depends on caller | varies | no durable denied row without explicit follow-up request | document as architectural limitation |
| `create-checkout-session` / `create-customer-portal-session` | billing Edge Functions | app-side structured classification + hosted/denied follow-up when billing service catches a failed response | owner, admin, staff expected; non-member denied | account, edge function name, HTTP status, plan key where applicable | raw/direct Edge Function callers still receive only HTTP JSON errors | keep as-is |
| `generate-security-audit-export` | audit/export Edge Function | app-side structured classification + hosted/denied follow-up when security audit service catches a failed response | manager/export requester | account, export job entity, edge function name, HTTP status | raw/direct Edge Function callers still receive only HTTP JSON errors | keep as-is |
| `cleanup-security-observability-events` | hosted observability retention Edge Function | cron-secret protected scheduled cleanup + SQL retention helper + hosted scheduled-workflow rows | cron operator / service role | retention days, batch size, batch count, deleted rows, correlation id | platform-level cron auth/config failures are stored with null account scope and therefore are not returned by account-scoped manager feeds | keep as-is |
| `send-password-reset-email` | auth email Edge Function | outbound email event rows + HTTP status | anonymous or authenticated requester | recipient user id when resolvable, provider message id when available | intentionally does not write denied events because missing users and resets are auth/email workflow signals, not account-scoped authorization denials | keep low-noise; revisit only if reset abuse/diagnosis requires hosted events |
| `send-reminder-emails` / `send-sms-notifications` | scheduled outbound communication | hosted scheduled-workflow rows + outbound email/SMS event rows + HTTP output | cron operator / service role | account id where resolved, notification/entity ids, provider/config reason, correlation id | platform-level cron auth/config failures are stored with null account scope; per-recipient provider details stay scrubbed | keep as-is |
| `sync-operational-automation` | scheduled automation sync | hosted scheduled-workflow rows + execution rows + structured runtime logs | cron operator / service role | account id, account-processing failure reason, correlation id, dry-run flag | platform-level cron auth/config failures are stored with null account scope; normal per-rule results remain in automation execution rows | keep as-is |
| `cleanup-security-audit-exports` | scheduled export cleanup | hosted scheduled-workflow rows + export job state changes | cron operator / service role | expired job count, bucket count, cleanup reason, correlation id | platform-level cron auth/config failures are stored with null account scope | keep as-is |

## Provider / Manual Diagnosis Heavy

| Surface | Type | Current denial signal | Actor types covered | Correlation richness | Known limitations | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase Storage policy denials behind upload/download/signing | storage | provider log + app log | all app roles | account/document context, provider request/trace when available, app storage operation id | some provider internals still require Supabase Storage logs | keep as-is for document storage; extend the same pattern to attachment buckets if needed |
| OTP / invite email delivery failures | invite / email | app log only, sometimes durable if classified as auth-like | invited user / inviter roles | account + invitation context only | provider delivery/auth details remain external | keep low-noise; improve only if delivery failures become frequent |
| `stripe-webhook` | provider webhook | Stripe/Supabase runtime response + billing/audit side effects | Stripe provider | Stripe event id and account/customer metadata | webhook signature failures and provider retries should stay provider-led; not account-user authorization denials | keep provider-led unless billing incident workflow needs hosted mirroring |

## Highest-Value Remaining Gaps

1. Hosted event archive/dashboard workflow is intentionally lightweight: retention cleanup is now deployable, but long-term archive dashboards remain future work.
2. Raw SQL callers that hit guarded RPCs still do not create durable denied rows unless they add the follow-up request themselves; this is a documented architectural limitation rather than a product-flow blocker.
3. Provider-led webhook verification, especially Stripe signature failures and retries, should remain provider-led unless billing incident workflows need hosted mirroring.
