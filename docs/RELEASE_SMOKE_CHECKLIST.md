# OASIS Release Smoke Checklist

**Use:** Run before every production deployment and after every hotfix.  
**Time:** ~15 minutes for full checklist, ~5 minutes for critical path only.

---

## Pre-Flight (run before deploying)

- [ ] `npm test` passes (all unit/contract tests green — 8 pre-existing failures in security suite are tracked separately)
- [ ] Integration tests pass on local Supabase harness (`npx vitest run tests/integration/`)
- [ ] No TypeScript / ESLint errors (`npm run lint`)
- [ ] All pending Supabase migrations applied to staging DB
- [ ] Edge Function deployments confirmed (`supabase functions list`)

---

## Critical Path (must pass before any deployment)

### Auth & Access

- [ ] Owner can log in and reach the dashboard
- [ ] Tenant can log in and reach the Tenant Portal (not the manager dashboard)
- [ ] Contractor can log in and see the Contractor Portal
- [ ] Tenant cannot navigate to `/properties`, `/finance`, or `/documents` (redirected or access denied)
- [ ] Contractor cannot navigate to `/finance` (access denied)

### Maintenance Request → Work Order → Completion

- [ ] Tenant submits a new maintenance request
- [ ] Manager sees the request in the Maintenance Inbox
- [ ] Manager creates a work order and assigns `contractorA1`
- [ ] Contractor sees the work order in their portal
- [ ] Contractor submits a quote (`wo_fin_upsert_quote_draft` + `wo_fin_submit_quote`)
- [ ] Manager approves the quote (`wo_fin_approve_quote`)
- [ ] Contractor submits an invoice (`wo_fin_upsert_invoice`)
- [ ] Manager advances status: `assigned → in_progress → completed`
- [ ] Completed work order appears in the maintenance timeline

### Finance

- [ ] Finance page loads with Overview, Payments, and Settings tabs
- [ ] Payment status pills (All, Due, Overdue, Paid, Partial) filter the list
- [ ] Search box filters payments by tenant name
- [ ] Clicking a property row navigates to the property detail
- [ ] Admin client shows the correct month's AI usage on the Billing page (no "ambiguous column" error)

### Documents

- [ ] Documents page loads with the correct tenant/property filters
- [ ] Upload modal opens via "Upload Document" button
- [ ] Drag-and-drop area is visible and scope pills work
- [ ] Document preview modal opens; Download button is present
- [ ] Tenant cannot see the Documents page (should show access denied or empty)

### Compliance Suite

- [ ] Tax Readiness tab loads without error for a pro/operator_agency account
- [ ] Rent Shield tab loads without error; property list shows assessments or empty state
- [ ] Lease Auditor tab loads without error; audit list shows findings or empty state
- [ ] Tenant receives access-denied when calling `list_tax_items` via browser dev tools (RPC test)

### Localization

- [ ] Switch locale to English → all UI labels display in English (no "key.path" literals)
- [ ] Switch locale to Polish → all UI labels display in Polish
- [ ] Switch locale to German → all UI labels display in German
- [ ] `common.all` renders as "All" / "Wszystkie" / "Alle" (not as "common.all")

### Dark Mode

- [ ] Toggle dark mode on Properties page — icon buttons are visible with sufficient contrast
- [ ] Command Center page — Attention Needed banner has visible text in dark mode
- [ ] Maintenance KPI — Section nav has visible text in dark mode
- [ ] Portfolio Health — AI insight strip has visible text in dark mode

### Billing, Trial & Operator/Agency

- [ ] New signup account has `trial_ends_at` set (confirm: `select trial_ends_at from accounts order by created_at desc limit 1`)
- [ ] Billing page: operator_agency card shows "Contact Sales", not a checkout button
- [ ] Billing page: self-serve plan cards show "Includes 14-day free trial"
- [ ] Trial banner visible for account with ≤7 days remaining (test via root admin panel → Set trial end to 2 days from now)
- [ ] Root admin panel accessible at `/root/accounts` for root operator; returns 403/redirects for non-root
- [ ] Trial extension: root admin sets date + reason → DB updated → feature gate passes for extended account
- [ ] Blank reason rejected on trial extension form
- [ ] `select public.account_subscription_plan('<new_account_id>')` returns `starter` (trial active → normal plan)
- [ ] After manual `trial_ends_at = now() - interval '1 day'`, same query returns `trial_expired`
- [ ] Grandfathered account (`trial_ends_at IS NULL`) returns `starter` from `account_subscription_plan()` unchanged

---

## Secondary Checks (run on full releases)

### AI Features

- [ ] AI property health explainer renders on a property detail page
- [ ] AI maintenance triage suggestion appears on a maintenance request
- [ ] Weekly portfolio summary renders on Portfolio Health page
- [ ] Usage counter on Billing page increments after an AI call
- [ ] Starter plan account cannot call AI RPCs (feature-denied error in browser console)

### Notifications

- [ ] Creating a maintenance request sends a notification to the owner (check Supabase logs or notification center)
- [ ] Work order status change sends notification to the contractor
- [ ] Notification content is in the user's preferred locale (not Polish when set to English)

### Security

- [ ] Login with wrong password — standard "invalid credentials" error, no stack trace exposed
- [ ] Unauthenticated `GET /rest/v1/accounts` returns 401, not data
- [ ] Storage URL for a document from account B returns 403 when accessed by account A's session token
- [ ] `OPTIONS /functions/v1/send-reminder-emails` returns 405 (CORS wildcard removed)

### Custom Fields & Roles

- [ ] Custom field appears on the property form if enabled
- [ ] Staff member with restricted custom role cannot access admin-only sections

### Audit Log & Notifications

- [ ] Manager creates a maintenance request → owner receives a notification (check Notification Center badge)
- [ ] Manager advances work order status → audit log row visible in `work_order_audit_log` via admin client
- [ ] Tenant can see their own notification but not another tenant's (check via browser storage / network tab)
- [ ] Contractor cannot directly insert into `notifications` table (test via browser dev tools console)

### Schema Guards

- [ ] `npx vitest run tests/integration/schema_regression_guards.test.js` — all pass
- [ ] No `PGRST202` (function not found) errors in Supabase logs after migration

---

## Post-Deploy Verification

- [ ] Sentry / error monitoring shows no new error spikes in first 10 minutes
- [ ] No `500` or `503` responses in API gateway logs
- [ ] Check Supabase Dashboard → Database → Logs for any `ERROR` entries from new migrations
- [ ] At least one successful end-to-end smoke login confirmed on production

---

## Rollback Criteria

Rollback immediately if any of the following occur:

- Auth is broken (users cannot log in)
- Finance page throws an unhandled error for any account
- Tenant portal shows manager-only data
- Any RLS bypass is confirmed (cross-account data visible)
- Supabase migration leaves a table in a broken state

To roll back: revert the deployment tag and re-apply the previous migration set. Document the incident in the security audit ledger.
