# Release Operations Checklist

Use this checklist for production-facing OASIS releases. It is intentionally practical: it records what changed, what was verified, and how to recover if the release behaves badly.

This checklist does not replace source control, CI, Supabase project controls, or Vercel deployment history. It ties those controls together for an operator-led release.

## Scope

Use this runbook when a release includes any of the following:

- app route, permission, role, localization, onboarding, billing, document, maintenance, or marketplace changes
- Supabase SQL overlays or RPC changes
- Supabase Edge Function changes
- Vercel environment variable changes
- production email, SMS, signature, or marketplace provider configuration changes

For documentation-only changes, record the release evidence if the docs affect production operations, security claims, recovery, or customer-facing guidance.

## Required Release Inputs

Record these before touching production:

- release owner
- reviewer or approver
- Git branch and commit SHA
- target environment
- affected product areas
- changed SQL files
- changed Edge Functions
- changed Vercel/Supabase secrets
- customer-visible risk level: low, medium, high
- rollback owner
- expected customer impact window

Use [release-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/release-evidence-template.md) to capture the final evidence.

## Pre-Release Gates

Minimum gates before a normal production release:

- working tree is clean or the release diff is explicitly captured
- `npm run build` passes
- `npm run test:e2e:critical` passes
- SQL impact is reviewed if any file under [supabase](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase) changed
- Edge Function redeploy list is reviewed if any file under [supabase/functions](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions) changed
- rollback path is identified before deployment starts

Use `npm run test:e2e:extended` before releases that touch:

- role/permission behavior
- route guards or account switching
- Command Center, Portfolio Health, Maintenance Inbox, or AI-led surfaces
- documents, signature packets, storage, or tenant payment setup
- localization, responsive layout, degraded-path states, or subscription gates

Use `npm run test:e2e:visual` when release value depends on screenshots, marketing presentation, or visual UI changes.

## Database Apply

If SQL changed, apply repository SQL with the production Postgres connection string. The command requires the full database URL, including username, host, database, and password. Do not commit or paste the password into docs, issues, screenshots, or chat.

```powershell
npm run db:apply:repo -- --db-url "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

After apply:

- review the terminal output for hard errors, not just notices
- run `npm run db:verify` against the intended environment when the local verifier is configured for that target
- run direct verification SQL for any newly added or changed RPC/table
- record object checks in the release evidence

If `db:apply:repo` stops partway through, do not rerun blindly. Identify the failed file, verify whether earlier files were applied, then decide whether to forward-fix or resume from the failed point.

## Edge Function Deploy

Deploy only changed Edge Functions, then record the function names and deploy output.

Common production functions include:

- `invite-user`
- `send-password-reset-email`
- `send-reminder-emails`
- `send-sms-notifications`
- `ingest-security-observability`
- AI helper functions under [supabase/functions](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions)
- document, signature, and marketplace functions under [supabase/functions](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions)

Example:

```powershell
supabase functions deploy invite-user --project-ref nodpjtkuefcmnxqxjtul
```

Before declaring success:

- confirm required secrets exist in the target Supabase project
- use a test recipient or test account for email/SMS/provider functions
- confirm provider logs where applicable, for example Resend, Twilio, DocuSeal, or Checkatrade

## App Deploy

For Vercel-backed releases:

- confirm the correct Git branch and commit are deployed
- confirm environment variables match the intended production configuration
- confirm `APP_URL` and app-facing invite/reset URLs point at `https://www.oasisrentalmgt.app`
- confirm Supabase redirect URLs still include production invite and reset-password routes

Do not assume a frontend deploy makes Supabase aware of new function secrets or SQL. App deploy, SQL apply, and Edge Function deploy are separate release steps.

## Post-Deploy Smoke

Run a short production smoke after deployment. Use safe accounts and avoid sending real customer notifications unless the release requires it.

Minimum smoke:

- sign in as an owner or manager
- load Dashboard, Properties, Tenants, Finance, Documents
- confirm account switcher only shows accounts available to the current role
- open Command Center, Portfolio Health, and Maintenance Inbox without noisy 400/500 RPC loops
- confirm subscription-gated pages show an upgrade card instead of repeated console failures
- if invites changed, create and revoke a test invite in a safe account
- if password reset changed, send one reset to a controlled mailbox and confirm provider delivery
- if documents changed, confirm metadata loads and storage preview/download behavior is still account-scoped
- if marketplace or signature changed, confirm manual handoff still remains available when API configuration is disabled

Record smoke results in the release evidence.

## Rollback And Recovery

Choose the least destructive recovery path that contains the issue.

App-only issue:

- roll back to the previous Vercel deployment or redeploy the previous known-good commit

Edge Function issue:

- redeploy the previous known-good function version from Git
- confirm secrets did not drift

SQL/RPC issue:

- prefer a forward-fix migration when data is safe
- avoid ad hoc destructive rollback SQL unless reviewed and account-scoped
- if a full database restore is required, follow [backup-restore-drill.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/backup-restore-drill.md)

Provider issue:

- disable the provider path if the app has a safe manual fallback
- preserve provider logs and OASIS outbound event rows before retrying

## Release Signoff

A release is complete only when:

- required gates are recorded
- deployment steps are recorded
- post-deploy smoke is recorded
- rollback path remains available
- follow-up issues are filed for anything deferred
- release owner signs off in the evidence record

