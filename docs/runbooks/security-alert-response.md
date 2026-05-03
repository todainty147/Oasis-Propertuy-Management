# Security Runbook: Alert Response Model

## Purpose

Use this runbook to triage high-signal security observability events without introducing a full SIEM or external alerting platform in this phase.

This model applies to:

- hosted rows in `public.security_observability_events`
- authorization rows in `public.security_denied_events`
- rate-limit blocks emitted through `public.record_api_rate_limit_attempt(...)`
- outbound email/SMS provider event rows
- security audit export job failures
- provider logs used for correlation

## Ownership Model

| Role | Primary responsibilities |
| --- | --- |
| Security owner | Owns severity classification, incident escalation, post-incident review, retention exceptions, and quarterly threshold tuning. |
| Engineering owner | Owns root-cause analysis, code/config remediation, deployment verification, and regression tests. |
| Support owner | Owns customer/account context, ticket communication, and confirmation that expected denials are not product defects. |
| Product owner | Owns user-impact tradeoffs, temporary UX mitigations, and customer-facing incident wording when required. |

If one person currently holds multiple roles, record that explicitly in the incident ticket. Do not leave ownership implicit.

## Severity And SLA Model

| Severity | Definition | Initial response SLA | Mitigation SLA | Examples |
| --- | --- | --- | --- | --- |
| SEV-1 Critical | Active or strongly suspected cross-account data exposure, privilege escalation, mass account takeover attempt, or security control bypass affecting production. | 15 minutes | 4 hours or emergency rollback/disablement | repeated cross-account authorization denials paired with successful suspicious access, leaked reset/invite token abuse, provider compromise. |
| SEV-2 High | Confirmed abuse, repeated security guardrail blocks, or security-critical workflow failure affecting multiple accounts or business-critical recovery/onboarding. | 1 hour | 1 business day | reset abuse spike, invite flood, repeated export failures across accounts, provider send outage for reset/invite emails. |
| SEV-3 Medium | Single-account or single-surface security anomaly requiring engineering review but no confirmed exposure or broad outage. | 1 business day | 5 business days | repeated denied actions from one actor, one account's invite delivery failures, isolated export failure. |
| SEV-4 Low | Expected denial, benign misconfiguration, documentation gap, or noisy signal with no customer impact. | 3 business days | next planned maintenance window | expected role denial, stale provider correlation gap, threshold tuning request. |

Escalate one level when the same pattern repeats after mitigation, touches root/support paths, involves billing or documents, or lacks enough telemetry to prove containment.

## Alert Matrix

Use these as launch thresholds. Tighten only after two to four weeks of production baseline data.

| Signal | Query source | Watch threshold | Page / incident threshold | Initial severity | Primary owner | First response |
| --- | --- | --- | --- | --- | --- | --- |
| Rate-limit spikes | `security_observability_events` where `category = api_rate_limit` or rate-limit metadata/surface is present | 10 blocked attempts on one account/surface in 15 minutes, or 20 global blocks on one surface in 15 minutes | 30 blocked attempts on one account/surface in 15 minutes, or any sustained global spike for 30 minutes | SEV-3, SEV-2 if multi-account | Security owner | Confirm surface, identifier scope, source IP/account, and whether the limiter is absorbing abuse. |
| Repeated authorization denials | `security_denied_events`, hosted `authorization_denied`, burst rollups | 5 repeated denials for one actor/account/surface/reason in 30 minutes | 15 repeated denials in 30 minutes, or any cross-account/root-support pattern | SEV-3, SEV-1 if exposure suspected | Security owner + Engineering owner | Determine expected denial vs suspicious probing; preserve actor/account/entity/correlation ids. |
| Invite abuse | `invite_security`, `invite-user:*` rate limits, outbound email events for invitation templates | 3 invite email-scope blocks or 5 failed invite sends for one account in 1 hour | 10 invite attempts across different emails for one account in 1 hour, or repeated provider failures affecting multiple accounts | SEV-3, SEV-2 if multi-account or flood | Support owner + Engineering owner | Pause broad resend attempts, verify account owner intent, check sender/provider health, and confirm no raw token exposure in logs. |
| Password reset abuse | `send-password-reset-email:ip`, `send-password-reset-email:email`, outbound email events for `password_reset` | 5 target-email blocks in 1 hour or 15 IP-scope blocks in 15 minutes | 30 IP-scope blocks in 15 minutes, 10 target-email blocks in 1 hour, or many recipient emails from one IP range | SEV-3, SEV-2 if broad abuse | Security owner | Confirm enumeration-resistant responses remain uniform; add perimeter throttling or challenge if SQL limiter absorbs repeated waves. |
| Provider send failures | outbound email/SMS event rows, Resend/Twilio provider logs, scheduled workflow hosted rows | 2 failed reset/invite/reminder/SMS sends in 1 hour for one account or sender | 5 failures in 1 hour, two consecutive scheduled send failures, or reset/invite sender outage | SEV-3, SEV-2 if recovery/onboarding impacted | Engineering owner | Check provider status, sender/domain config, API key health, and scrubbed provider response metadata. |
| Security export failures | `generate-security-audit-export` hosted events, `security_audit_export_jobs`, cleanup/export scheduled rows | 2 failed export jobs for one account in 24 hours | 3 failed export jobs in 24 hours, any failed export during audit/customer request window, or cleanup deleting unexpected scope | SEV-3, SEV-2 during audit window | Engineering owner + Support owner | Preserve job id/account id/correlation id, verify storage bucket access, and retry only after root cause is understood. |

Do not page on isolated expected authorization denials. Page on repetition, suspicious spread, root/support involvement, recovery/onboarding disruption, or any sign that a guardrail failed open.

## Review Cadence

| Cadence | Owner | Required review |
| --- | --- | --- |
| Daily in production | Support owner or duty engineer | Open SEV-2/SEV-3 alerts, failed reset/invite sends, security export failures, and customer-linked repeated denials. |
| Weekly | Security owner + Engineering owner | Top repeated surfaces, rate-limit spikes, provider failures, unresolved anomaly alerts, and threshold false positives. |
| Monthly | Security owner | Retention cleanup evidence, exported investigation windows, incident ticket closure quality, and unresolved recurring patterns. |
| Quarterly | Security owner + Product owner | Severity thresholds, response SLAs, retention policy, and whether external SIEM/perimeter alerting is now justified. |

## Retention Guidance

| Event class | Default hot retention | Longer retention / archive guidance | Notes |
| --- | --- | --- | --- |
| Hosted security observability rows | 90 days | Export before purge for open incidents, legal holds, audit requests, or recurring patterns. | Enforced by `cleanup-security-observability-events` / `cleanup_security_observability_events(...)`. |
| Durable denied events | 180 days | Preserve incident-linked rows for 1 year when they support an access-control investigation. | Keep scrubbed; do not add secrets to metadata. |
| Security audit ledger and anomaly alerts | 1 year | Keep audit/customer evidence snapshots for contract or compliance windows. | Treat as audit evidence, not verbose application logs. |
| API rate-limit event rows | 90 days | Keep aggregates or exports for abuse trend analysis; raw hashed identifiers usually do not need longer hot storage. | Identifier hashes are still security telemetry and should remain access-controlled. |
| Outbound email/SMS events | 180 days | Preserve reset/invite delivery failures for 1 year when tied to an incident or support dispute. | Avoid storing message bodies, tokens, or recipient secrets in metadata. |
| Security export jobs and generated files | Job rows 90 days; generated files 14 days unless account config says otherwise | Extend only for active audit windows or explicit customer request. | Generated export files should have shorter retention than audit metadata. |
| Provider logs | Provider default, target 30 to 90 days | Export provider evidence into the incident ticket when needed before provider expiry. | Stripe/Resend/Twilio/Supabase retention may vary by plan. |

## Triage Workflow

1. Classify severity using the matrix above.
2. Assign named owners for security, engineering, and support communications.
3. Capture the query window, account id, actor id, surface, reason, and correlation id.
4. Decide whether the signal is expected denial, abuse absorbed by controls, product defect, provider incident, or possible security incident.
5. Preserve evidence before cleanup if the incident may exceed the default retention window.
6. Apply the smallest safe mitigation: config fix, provider retry, rate-limit/perimeter adjustment, account-scoped data correction, rollback, or temporary workflow disablement.
7. Verify the same signal stops or returns only as expected denial.
8. Close with customer impact, root cause, remediation, regression coverage, and follow-up owner.

## Related Files

- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
- [HOSTED_SECURITY_LOG_SINK.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/HOSTED_SECURITY_LOG_SINK.md)
- [API_RATE_LIMITING.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/API_RATE_LIMITING.md)
- [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md)
