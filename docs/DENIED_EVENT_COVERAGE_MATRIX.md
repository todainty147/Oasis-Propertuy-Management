# Denied-Event Coverage Matrix

This matrix tracks which OASIS security-sensitive surfaces currently produce durable rows in `public.security_denied_events`, which surfaces stop at structured exceptions or app logs, and which still depend mainly on provider logs or manual diagnosis.

Important scope note:
- `durable row` means the denial is captured only when the caller goes through an app/service flow that uses `logSecurityRelevantFailure(...)` and the follow-up `record_security_denied_event(...)` RPC succeeds.
- `structured exception` means the backend emits machine-readable `detail` / `hint`, but no durable denied row is guaranteed.
- `provider/app log only` means diagnosis is still mainly console/runtime/provider-side rather than durable in Postgres.

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
| `document_preview_url` / `document_storage_download` | document read / storage | durable row + app log, sometimes structured exception | owner, admin, staff, tenant, contractor | account, document id, scope, visibility, reason | provider/storage policy root cause may still sit outside Postgres | next pass should improve provider correlation IDs |
| `set_document_tags` / `delete_document_and_audit` / `document_audit_log_select` | document workflow | durable row + structured exception + app log | owner, admin, staff, tenant, contractor | account, document entity, reason, code, hint | best-effort storage delete cleanup is not a denied-event row | keep as-is |
| `contractor_work_order_cards` | contractor read RPC | durable row + structured exception/app log through shared service wrapper | contractor, owner/admin/staff/tenant deny paths | account, work order entity, reason, code | raw RPC callers still bypass app follow-up logging | keep as-is |
| `contractor_allowed_actions` | contractor read RPC | durable row + structured exception/app log through shared service wrapper | contractor, owner/admin/staff/tenant deny paths | account, work order entity, reason, code | page UX still intentionally falls back to empty actions after the shared service logs the denial | keep as-is |

## Structured Exception / App Log Only

| Surface | Type | Current denial signal | Actor types covered | Correlation richness | Known limitations | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| raw SQL callers to guarded RPCs | mixed | structured exception only | depends on caller | varies | no durable denied row without explicit follow-up request | document as architectural limitation |

## Provider / Manual Diagnosis Heavy

| Surface | Type | Current denial signal | Actor types covered | Correlation richness | Known limitations | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase Storage policy denials behind upload/download/signing | storage | provider log + app log | all app roles | account/document context from app, provider specifics outside app | root cause often remains in Storage logs rather than Postgres | add provider correlation id capture where available |
| OTP / invite email delivery failures | invite / email | app log only, sometimes durable if classified as auth-like | invited user / inviter roles | account + invitation context only | provider delivery/auth details remain external | keep low-noise; improve only if delivery failures become frequent |
| Edge Function callers outside app wrappers | function / workflow | provider/runtime log only | depends on caller | varies | durable denied rows depend on explicit app follow-up or function-side recording | standardize function-side classification gradually |

## Highest-Value Remaining Gaps

1. Raw SQL callers that hit guarded RPCs still do not create durable denied rows unless they add the follow-up request themselves.
2. Storage/provider-side authorization failures still need external logs for full root-cause analysis, even when OASIS app logs contain safe correlation context.
3. Edge Function and non-UI callers still vary in how consistently they classify denials before forwarding them into durable streams.
4. Hosted event retention/export is now defined, but no automated scheduler or archive dashboard exists in-repo yet.
