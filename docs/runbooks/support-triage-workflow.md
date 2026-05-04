# Support Triage Workflow

Use this workflow as the first stop for OASIS support tickets. It helps classify the issue, capture the right evidence, route it to the right owner, and avoid unsafe remediation.

This is an operational support process. It does not change system behavior, authorization, RLS, or product permissions.

## Triage Goals

- confirm the affected account before any remediation
- separate expected role behavior from product defects
- preserve useful evidence before logs rotate or provider records expire
- route high-risk issues to engineering/security quickly
- give customers clear updates without overpromising

## Required Ticket Fields

Every support ticket should include:

- ticket id
- customer/account name
- `account_id`
- affected user email
- affected `user_id`, if known
- active role shown in OASIS
- affected route or feature
- exact user action attempted
- expected behavior
- actual behavior
- browser/device, if UI-related
- timestamp and timezone
- screenshots or screen recording, if available
- related correlation id, provider id, invite token id, document id, payment id, maintenance request id, or work order id
- severity
- assigned owner
- customer update due time

Use [support-ticket-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/support-ticket-template.md) for a reusable ticket structure.

Do not paste secrets, raw API keys, passwords, full reset tokens, or full invite verification links into tickets. Store only safe identifiers and redacted URLs.

## Severity Model

| Severity | Definition | First response target | Owner | Examples |
| --- | --- | --- | --- | --- |
| P1 Critical | Suspected cross-account data exposure, privilege escalation, total inability to access production, or destructive data loss. | 15 minutes | Engineering + security owner | User sees another landlord's data, root-only access appears for non-root, production app unavailable. |
| P2 High | Business-critical workflow blocked for one or more accounts with no safe workaround. | 1 business hour | Engineering owner + support owner | Invites/resets failing, documents cannot be downloaded, manager cannot access properties/tenants, payment visibility broken. |
| P3 Normal | Single-account or single-user issue with a workaround or limited impact. | 1 business day | Support owner | Wrong role, expected subscription gate, one contractor cannot see a job, one stale route state. |
| P4 Low | Question, documentation gap, cosmetic issue, enhancement request, or expected behavior. | 3 business days | Support/product owner | How-to request, translation feedback, low-impact copy issue, feature request. |

Escalate one level when:

- the issue touches root, security audit, account switching, invites, password reset, documents, payments, or billing
- more than one account reports the same failure pattern
- the symptom repeats after remediation
- there is no evidence yet proving the failure is safely contained
- customer impact is time-sensitive, for example move-in, rent chase, urgent maintenance, or audit request

## Triage Flow

1. Confirm the reporter and the affected account.
2. Classify the issue using the severity model.
3. Capture required ticket fields before attempting fixes.
4. Search recent app/security/provider evidence for the affected timeframe.
5. Route to the matching runbook below.
6. Apply only the smallest safe remediation.
7. Verify the fix with the same role/account context the customer used.
8. Send a customer update.
9. Close with root cause, evidence, remediation, and follow-up owner.

## Runbook Routing

| Symptom | Start here |
| --- | --- |
| Access denied, missing page, wrong role, or account switcher issue | [support-permission-issues.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-permission-issues.md) |
| Invite link invalid, expired, revoked, duplicate, or wrong account | [support-invite-token-failures.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-invite-token-failures.md) |
| Invite exists but data rows look inconsistent | [data-broken-invites.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-broken-invites.md) |
| Contractor cannot see or act on a job, quote, invoice, or attachment | [support-contractor-access.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-contractor-access.md) |
| Tenant, membership, payment, work order, or invite rows look detached | [data-orphaned-rows.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-orphaned-rows.md) |
| Tenant assigned to wrong account/property after migration or import | [data-tenant-migration-mistakes.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/data-tenant-migration-mistakes.md) |
| Document request, upload, preview, packet, or signing workflow looks wrong | [document-workflow-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/document-workflow-operations.md) |
| Extracted text is missing, jobs stuck in queue, or PDF quality is poor | [document-extraction-worker-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/document-extraction-worker-operations.md) |
| Provider-side document/email/SMS/signature logs need correlation | [provider-log-correlation.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/provider-log-correlation.md) |
| Repeated denied events, suspicious activity, or security alert | [security-alert-response.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-alert-response.md) |
| Root telemetry or hosted security feed looks noisy/broken | [security-observability-feed.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/security-observability-feed.md) |
| AI briefing, triage, explainer, or recommendation is missing or falling back | See specific AI runbooks: [maintenance-triage](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-maintenance-triage-operations.md) · [attention-insights](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-attention-insights-operations.md) · [property-health](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-property-health-explainer-operations.md) · [contractor-recommendation](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-contractor-recommendation-operations.md) · [weekly-summary](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-weekly-portfolio-summary-operations.md) |
| AI usage totals wrong, unexpected 429, or quota appears to not reset | [ai-cost-controls-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/ai-cost-controls-operations.md) |
| Tax Readiness Dashboard: missing deadlines, wrong status, export date range wrong | [compliance-tax-readiness-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/compliance-tax-readiness-operations.md) |
| Rent Shield: score wrong, portfolio empty, Recalculate not updating | [compliance-rent-shield-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/compliance-rent-shield-operations.md) |
| Lease Auditor: findings not saving, overall risk not updating, lease list empty | [compliance-lease-auditor-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/compliance-lease-auditor-operations.md) |
| Account shows "trial expired" wall but customer says trial should still be active | See **Trial triage** below |
| Account shows "payment pending" / OA checkout wall and customer has paid | See **Operator/Agency triage** below |
| Release caused the issue or rollback may be required | [release-operations-checklist.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/release-operations-checklist.md) |

### Trial expiry triage

**Symptom:** Account user sees "Your 14-day trial has ended" wall or all paid features are denied.

1. Confirm `account_id` from the ticket.
2. Run: `select id, name, trial_ends_at, trial_source, subscription_plan, subscription_status from accounts where id = '<account_id>'`
3. Check `trial_ends_at`:
   - If `NULL` → account is grandfathered; paid feature denial has another cause (check Stripe subscription status).
   - If in the past → trial genuinely expired. Advise customer to upgrade, or escalate to root operator to extend via the admin panel (`/root/accounts`).
   - If in the future → trial is still active; feature denial has another cause.
4. Check `subscription_status`: if `past_due` or `canceled`, a Stripe billing problem may be overriding the trial.
5. If trial extension is needed: root operator uses `/root/accounts` → expands the account row → "Set trial end" with a reason. This is always recorded in the security audit log.
6. Do not manually UPDATE `trial_ends_at` in the DB directly. Use the `set_account_trial_end` RPC or root admin panel, which enforce reason capture and security event logging.

### Operator/Agency triage

**Symptom:** Account shows "Payment pending" wall, or account says they have paid but still can't access Operator/Agency features.

1. Confirm `account_id`.
2. Run: `select id, account_id, payment_status, stripe_checkout_session_id, stripe_subscription_id, activated_at from operator_agency_grants where account_id = '<account_id>' order by created_at desc limit 3`
3. Check `payment_status`:
   - `pending_payment` → Stripe checkout was not completed. Verify in Stripe Dashboard whether the customer paid against the session ID shown. If paid but status is wrong, check `billing_events` for the `checkout.session.completed` event and whether it was processed.
   - `active` → Grant is active; escalate to engineering if features are still denied (could be a plan cache or DB issue).
   - `checkout_failed` / `activation_failed` → Stripe session or activation failed. Escalate to engineering with the `stripe_checkout_session_id`.
   - `cancelled` → Grant was cancelled. If incorrectly cancelled, escalate to root operator to create a new grant.
4. If the Stripe checkout was completed but the grant is still `pending_payment`: check `billing_events` for the event — the webhook may have failed to process. Escalate to engineering.
5. If the checkout link has expired (`stripe_checkout_expires_at` in the past): root operator must regenerate the link via root admin panel → "Regenerate link" (this calls `record_regenerated_oa_checkout`).
6. Do not activate grants manually by updating `payment_status` directly in the DB. Activation must flow through the verified Stripe webhook path to maintain integrity.
| Restore, data loss, or backup question | [backup-restore-drill.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/backup-restore-drill.md) |

## Escalation Paths

Use named owners in the ticket. If one person currently holds multiple roles, write that explicitly.

| Escalation path | Trigger | Primary owner | Required evidence |
| --- | --- | --- | --- |
| Security escalation | suspected exposure, privilege escalation, suspicious repeated access attempts, root/support path involvement | Security owner | account id, actor id, route/surface, denied/observability rows, correlation ids |
| Engineering escalation | app defect, RPC failure, Edge Function failure, provider integration break, data inconsistency | Engineering owner | reproduction steps, console/network error, SQL/provider evidence, affected commit if known |
| Support escalation | customer needs guidance, role expectation mismatch, safe workaround exists | Support owner | customer context, screenshots, role/account check, agreed response |
| Product escalation | unclear expected behavior, UX copy causing confusion, missing workflow, prioritization decision | Product owner | user goal, current workaround, impact, requested behavior |
| Release escalation | issue follows deployment or SQL/function change | Release owner | release evidence, changed files/functions, deploy timestamp, rollback option |

## Safe Remediation Rules

- Confirm `account_id` before any SQL or admin change.
- Prefer read-only inspection first.
- Do not disable RLS.
- Do not grant root or broader account access to “fix” a support issue.
- Do not reuse or expose invite/reset tokens.
- Do not retry provider sends repeatedly until the root cause is known.
- Keep direct data corrections account-scoped and record exact rows touched.
- If a fix requires production SQL writes, link the ticket to release evidence or a support remediation note.

## Customer Update Cadence

Use these as minimums:

- P1: update every 30 minutes until mitigated
- P2: update every 2 business hours until mitigated
- P3: update every 1 business day while active
- P4: update when accepted, answered, or scheduled

Do not claim a security incident is resolved until engineering/security has confirmed containment. Do not claim data recovery is possible at account level unless a reviewed recovery plan exists.

Use [customer-response-templates.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/customer-response-templates.md) for safe starter wording.

## Closure Checklist

Before closing:

- severity was correct or adjusted
- affected account/user/role was verified
- root cause is recorded
- remediation is recorded
- customer-facing explanation is recorded
- regression or follow-up issue is linked when needed
- any direct SQL/provider/manual action is documented
- customer confirmed or support verified the fix
