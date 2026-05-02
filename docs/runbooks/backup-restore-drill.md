# Backup And Restore Drill

Use this runbook to validate OASIS recovery readiness and to guide production restore decisions.

This document describes the current model honestly: OASIS relies on Supabase/Postgres backup and point-in-time recovery capability for database recovery. Account-level restore is not currently implemented as a product feature.

## Recovery Model

Current recovery model:

- database recovery is provider-backed through Supabase/Postgres backup and point-in-time recovery features available on the configured project plan
- restore is database-wide, not account-level
- application code can be rolled back separately through Git/Vercel and Supabase Edge Function redeploys
- storage recovery depends on Supabase Storage/provider capabilities and the specific incident scope

Current limitation:

- OASIS does not yet provide a one-click or guaranteed account-level restore workflow
- restoring the whole database to an earlier point can lose valid writes created after that point
- account-level recovery would require controlled export/replay or reconciliation tooling that is not yet implemented

## Initial Operational Targets

These are launch-readiness operating targets, not audited service guarantees:

- RPO target: validate against the active Supabase project backup/PITR settings before launch and after plan changes
- RTO target for triage decision: within 4 business hours for critical database incidents
- RTO target for full service restoration after restore decision: within 8 business hours, subject to provider restore duration and incident scope
- restore drill cadence: quarterly, and after major schema or storage workflow changes

Update these targets once real restore drills provide measured durations.

## Drill Preconditions

Before running a drill:

- confirm the target Supabase project has backups/PITR enabled as expected
- select a safe restore point
- restore into an isolated project, branch, or non-production environment when possible
- do not overwrite production for a drill
- identify who will verify database, app, and storage behavior
- prepare a release evidence record using [release-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/release-evidence-template.md)

## Restore Drill Steps

1. Select the restore point and record why it was chosen.
2. Restore to an isolated target environment.
3. Confirm core database objects exist.
4. Confirm core account data is present.
5. Run DB verification against the restored environment when configured.
6. Run a browser smoke against the restored app target when available.
7. Confirm storage-backed document metadata and object paths remain consistent.
8. Record total elapsed time, blockers, and follow-up work.

Suggested core object checks:

```sql
select to_regclass('public.accounts') is not null as has_accounts;
select to_regclass('public.account_members') is not null as has_account_members;
select to_regclass('public.properties') is not null as has_properties;
select to_regclass('public.tenants') is not null as has_tenants;
select to_regclass('public.payments') is not null as has_payments;
select to_regclass('public.maintenance_requests') is not null as has_maintenance_requests;
select to_regclass('public.work_orders') is not null as has_work_orders;
select to_regclass('public.documents') is not null as has_documents;
select to_regclass('public.account_invitations') is not null as has_account_invitations;
```

Suggested account-scoped sanity check:

```sql
select
  a.id as account_id,
  a.name as account_name,
  count(distinct p.id) as properties,
  count(distinct t.id) as tenants,
  count(distinct pay.id) as payments,
  count(distinct mr.id) as maintenance_requests,
  count(distinct wo.id) as work_orders
from public.accounts a
left join public.properties p on p.account_id = a.id
left join public.tenants t on t.account_id = a.id
left join public.payments pay on pay.account_id = a.id
left join public.maintenance_requests mr on mr.account_id = a.id
left join public.work_orders wo on wo.account_id = a.id
where a.id = '<account-id>'
group by a.id, a.name;
```

## Production Restore Decision Flow

Use full database restore only when a forward fix is unsafe or insufficient.

Before restore:

- preserve logs, timestamps, affected account IDs, and release evidence
- stop or reduce writes if possible
- identify the earliest known-good restore point
- estimate valid writes that may be lost after the restore point
- communicate expected impact to affected stakeholders
- assign one restore commander and one verifier

During restore:

- keep a timestamped action log
- do not run unrelated SQL cleanup
- preserve provider logs for email, SMS, document, signature, and marketplace flows

After restore:

- run core object checks
- run account-scoped sanity checks
- run `npm run test:e2e:critical` against the restored target when practical
- verify high-risk routes manually: Dashboard, Properties, Tenants, Finance, Documents, Maintenance Inbox, Command Center, Portfolio Health
- record any data loss window and follow-up remediation

## Account-Level Recovery Direction

Future account-level recovery should be designed as a separate capability, not improvised during an incident.

A safe future design should include:

- account-scoped export of relational rows
- storage object manifest for account-scoped paths
- isolated restore preview before production replay
- reconciliation for account members, invites, tenants, properties, payments, documents, work orders, and audit trails
- explicit customer approval before replaying or replacing account data

Until that exists, treat account-level recovery requests as a support and engineering escalation that requires careful SQL review.

## Drill Evidence

Every drill should record:

- date and operator
- source project/environment
- restore target
- restore point
- elapsed restore time
- verification queries
- E2E or smoke tests run
- storage checks run
- gaps found
- next drill date

