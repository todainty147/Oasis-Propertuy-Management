# OASIS Runbooks

Small, high-value runbooks for production diagnosis and safe remediation.

Use these documents when the issue is already narrowed to a concrete operational symptom. If you are not sure where to start, use the triage guide below first.

## Triage Guide

If the symptom is:

- a new customer support ticket needs classification or routing:
  - start with [support-triage-workflow.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-triage-workflow.md)
- preparing or approving a production-facing release:
  - start with [release-operations-checklist.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/release-operations-checklist.md)
- validating backup/restore readiness or deciding whether a production restore is necessary:
  - start with [backup-restore-drill.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/backup-restore-drill.md)
- user sees `Access denied`, missing account access, or manager-only page denial:
  - start with [security-denied-events.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-denied-events.md)
- user/support needs to inspect centralized hosted security events:
  - start with [security-observability-feed.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-observability-feed.md)
- support/root needs to understand whether a symptom is latency, traffic, error, or repeated-pressure related:
  - start with [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md)
- running the daily/weekly production monitoring routine:
  - start with [production-monitoring-rhythm.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/production-monitoring-rhythm.md)
- support/security needs to classify alert severity, assign owners, decide response SLA, or preserve evidence:
  - start with [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
- document preview/upload/download fails and app logs are not enough:
  - start with [provider-log-correlation.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/provider-log-correlation.md)
- template library, document request, participant upload, or agreement packet state looks wrong:
  - start with [document-workflow-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/document-workflow-operations.md)
- Command Center AI briefing is missing, falling back, or not refreshing:
  - start with [ai-attention-insights-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-attention-insights-operations.md)
- Portfolio Health AI explainer is missing, falling back, or not matching the current risk signals:
  - start with [ai-property-health-explainer-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-property-health-explainer-operations.md)
- Maintenance inbox AI triage suggestion is missing, falling back, or not matching the request context:
  - start with [ai-maintenance-triage-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-maintenance-triage-operations.md)
- contractor recommendation in the create-work-order drawer is missing, falling back, or clearly not matching request history:
  - start with [ai-contractor-recommendation-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-contractor-recommendation-operations.md)
- weekly portfolio AI briefing is missing, falling back, or not reflecting current portfolio pressure:
  - start with [ai-weekly-portfolio-summary-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-weekly-portfolio-summary-operations.md)
- membership, tenant, payment, work-order, or invite rows look broken or detached:
  - start with [data-orphaned-rows.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-orphaned-rows.md)
- invite exists but acceptance is broken, duplicated, revoked unexpectedly, or tied to the wrong account:
  - start with [data-broken-invites.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-broken-invites.md)
- tenant was moved to the wrong account/property or a migration/import caused account leakage:
  - start with [data-tenant-migration-mistakes.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-tenant-migration-mistakes.md)
- support ticket says “I should have access” or “my role is wrong”:
  - start with [support-permission-issues.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-permission-issues.md)
- contractor cannot see or act on a job/quote/invoice:
  - start with [support-contractor-access.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-contractor-access.md)
- invite link/token says expired, revoked, invalid, or email mismatch:
  - start with [support-invite-token-failures.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-invite-token-failures.md)

## Safety Rules

- Always confirm the correct `account_id` before running any SQL.
- Prefer read-only inspection first.
- Do not disable RLS or weaken guard functions to “test” access.
- Keep remediation account-scoped and reversible.
- If a fix needs direct SQL writes, record the exact rows touched and verify immediately after.

## Related System Docs

- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
- [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md)
- [DENIED_EVENT_COVERAGE_MATRIX.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/DENIED_EVENT_COVERAGE_MATRIX.md)
- [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md)
- [production-monitoring-rhythm.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/production-monitoring-rhythm.md)
- [support-triage-workflow.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-triage-workflow.md)
- [release-operations-checklist.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/release-operations-checklist.md)
- [backup-restore-drill.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/backup-restore-drill.md)
- [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
