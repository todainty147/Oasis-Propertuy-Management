# Production Monitoring Rhythm

Use this runbook to operate the OASIS golden signals after launch. It turns the documented signal model into a daily and weekly routine with named ownership, action thresholds, and evidence capture.

This is a human-operated launch rhythm. It does not claim OASIS has a full external SIEM, automated paging, or audited SRE program.

## Operating Principle

OASIS monitoring should answer four questions:

1. Are critical landlord, tenant, contractor, document, invite, payment, and security workflows responding?
2. Are failures isolated, repeated, or spreading across accounts?
3. Are authorization denials expected guardrail behavior or suspicious pressure?
4. Do provider-backed workflows need action before customers report them?

Use [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md) for the signal definitions and [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md) for severity and incident response.

## Roles

| Role | Daily responsibility | Weekly responsibility |
| --- | --- | --- |
| Support owner | Check customer-linked failures, invite/reset/document issues, and unresolved tickets. | Summarize recurring support symptoms and expected-denial confusion. |
| Duty engineer | Check root telemetry, provider failures, scheduled jobs, and high-risk RPC failures. | Review repeated technical patterns and assign remediation issues. |
| Security owner | Review repeated denials, root/support path anomalies, rate-limit blocks, and suspicious spread. | Tune thresholds, confirm retention/export needs, and review unresolved anomalies. |
| Product owner | Review user-impact patterns and confusing UX/copy signals. | Decide whether recurring issues need product changes, docs, or onboarding improvements. |

If one person holds multiple roles, record that in the monitoring evidence. Do not leave daily ownership implicit.

## Daily Monitoring Checklist

Run once per business day during launch readiness. Also run after production releases, provider changes, SQL applies, or Edge Function deploys.

1. Open Root Telemetry as root/support.
2. Review the last 24 hours for:
   - repeated authorization denials
   - root/support path anomalies
   - latency threshold breaches
   - burst or repeated-pressure patterns
   - active alerts
3. Open Security Audit for any account with customer-linked symptoms.
4. Check provider dashboards/logs when app events indicate provider involvement:
   - Supabase Auth/Storage/Edge Function logs
   - Resend for invites, resets, and reminders
   - Twilio when SMS is enabled
   - Stripe for billing/portal failures
   - DocuSeal or marketplace provider logs when those workflows are active
5. Check scheduled outbound jobs:
   - reminders
   - SMS notifications
   - security observability ingest/cleanup jobs, if enabled
6. Record status using [monitoring-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/monitoring-evidence-template.md).
7. Open or update support/security tickets for any watch or breach signal.

## Weekly Review

Run once per week during launch readiness.

Weekly review should include:

- top repeated failing surfaces
- top repeated denied-event reasons
- invite/reset/document provider health
- scheduled job completion pattern
- unresolved P1/P2/P3 support tickets linked to monitoring
- false positives and expected denials that need clearer UI/docs
- performance patterns for dashboard, finance, portfolio, root telemetry, documents, and AI surfaces
- threshold changes, if justified by evidence
- follow-up owners and due dates

Record the weekly summary in [monitoring-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/monitoring-evidence-template.md).

## Action Thresholds

Use these as launch operating triggers. The security incident severity model remains in [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md).

| Signal | Watch trigger | Action trigger | First action |
| --- | --- | --- | --- |
| Critical read availability | 1% failures over 24h on dashboard, finance, portfolio, documents, or root telemetry | 2% failures over 24h or customer-linked failures | Open P2/P3 ticket, check recent release/provider status, capture failing route/RPC. |
| Critical read latency | p95 above target for one window | p95 above 2x target or repeated for two windows | Check root telemetry and provider/Supabase logs; assign engineering review. |
| Invite/reset delivery | 2 failures in 1 hour | 5 failures in 1 hour or repeated provider sender failure | Check outbound event rows and Resend/Auth logs; pause repeated retries until cause is known. |
| Document storage/provider | repeated failure for one account | failures across accounts or blocked customer workflow | Check document workflow runbook and provider logs; preserve document ids and correlation ids. |
| Authorization-denial pressure | repeated pattern appears in burst rollup | more than 10 denials on one account/surface/entity/reason in 1 hour | Classify expected denial vs suspicious probing; escalate to security if unclear. |
| Root/support anomaly | any unexpected root/support path denial or access confusion | repeated root/support anomaly or non-root seeing root-only surface | Open P1/P2 depending on exposure risk; preserve evidence immediately. |
| Scheduled outbound jobs | one failed scheduled send or ingest job | two consecutive failed runs | Check function logs and provider status; open engineering ticket. |
| Rate-limit blocks | 10 blocked attempts on one account/surface in 15 minutes | 30 blocked attempts or multi-account spread | Confirm limiter is absorbing abuse; escalate to security owner. |

## Evidence To Capture

For every watch or action trigger, capture:

- date/time and timezone
- reviewer
- environment
- account id, if account-specific
- affected surface/RPC/function
- signal type: latency, traffic, error, saturation, provider, security
- screenshots or exported rows, if useful
- correlation ids
- provider ids
- linked support/security/release ticket
- classification: expected denial, product defect, provider incident, security anomaly, release regression, or unknown
- owner and next review time

Do not capture raw invite/reset tokens, passwords, API keys, provider secrets, or unredacted customer-sensitive payloads.

## Escalation Rules

Escalate to the support triage workflow when:

- a signal is linked to a customer report
- user-facing copy or expected behavior is confusing
- the issue needs customer communication

Escalate to the security alert response runbook when:

- cross-account exposure is suspected
- privilege escalation is suspected
- root/support paths behave unexpectedly
- repeated denials suggest probing and cannot be explained as normal use

Escalate to release operations when:

- the issue began after a production deploy, SQL apply, function deploy, or provider secret change
- rollback or feature disablement is being considered

Escalate to backup/restore only when:

- data loss or destructive corruption is suspected
- a forward fix cannot safely recover the system

## Evidence Retention

Keep monitoring evidence lightweight but traceable:

- daily monitoring evidence: retain for 90 days during launch readiness
- weekly summaries: retain for 1 year
- incident-linked evidence: retain according to [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
- provider screenshots/exports: attach only when needed and redact secrets

## Related Docs

- [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md)
- [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md)
- [security-observability-feed.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-observability-feed.md)
- [support-triage-workflow.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-triage-workflow.md)
- [release-operations-checklist.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/release-operations-checklist.md)
- [monitoring-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/monitoring-evidence-template.md)

