# Billing / Stripe Operations Runbook

## Purpose

Billing manages plan state, trial/founder entitlements, Stripe checkout and portal access, webhook-driven subscription updates, and feature entitlement resolution. It does not grant compliance, tax, or legal outcomes.

## Scope and current status

Billing is customer-facing and money-impacting. Founder and pilot entitlements may coexist with Stripe plan state; support must inspect the resolver path before changing access.

## Critical invariants

- Stripe webhook processing must be idempotent.
- Entitlements must be account-scoped.
- Trial and founder overrides must be explicit and auditable.
- Do not manually grant broad entitlements without product approval.
- Never expose Stripe secrets or raw payment details.

## Key files

- `src/pages/BillingPage.jsx`
- `src/services/billingService.js`
- `src/services/founderOfferService.js`
- `src/lib/entitlements.js`
- `supabase/account_entitlements.sql`
- `supabase/account_subscription_plan_hardened.sql`
- `supabase/account_subscription_plan_founder.sql`
- `supabase/trial_period_enforcement.sql`
- `supabase/founder_launch_offer.sql`
- `docs/billing/FOUNDER_OFFER.md`
- `docs/release/pilot-billing-mode.md`

## Data model / RPCs / functions

Relevant objects include account subscription plan rows, account entitlements, trial period state, founder offer records, Stripe customer/subscription identifiers, and webhook processing state.

## Normal operation

1. Account starts trial or selected plan.
2. Checkout/portal action goes through Stripe.
3. Webhook updates subscription state.
4. Entitlement resolver exposes feature access.
5. UI reflects current plan/trial/founder state.

## Common failure modes

- Stripe checkout fails or user returns without subscription update.
- Webhook delayed, failed, or duplicated.
- Trial expired but UI still shows access.
- Plan mismatch between Stripe and local account row.
- Founder entitlement conflicts with paid plan.
- AI quota appears wrong because plan resolver and override differ.

## Triage checklist

1. Confirm account id and Stripe customer/subscription ids.
2. Read local subscription, trial, founder, and entitlement rows.
3. Check recent webhook events and idempotency outcome.
4. Compare resolved plan/feature access with UI symptom.
5. Confirm whether an override is approved and still valid.

## Safe operator actions

- Ask user to refresh billing page after webhook delay.
- Reconcile local state from Stripe event ids through approved tooling.
- Escalate plan override requests to product/finance.

## Unsafe actions / never do

- Do not edit plan/entitlement rows without approval and audit notes.
- Do not delete duplicate webhook evidence.
- Do not reveal Stripe secrets or card data.
- Do not use billing state to imply legal/tax/compliance readiness.

## Customer-safe wording

“We are checking the account’s billing and entitlement state against Stripe and Tenaqo’s feature resolver. Access may depend on plan, trial, founder, or approved pilot settings.”

## Escalation

Escalate for payment disputes, webhook replay uncertainty, subscription cancellation mismatch, founder override conflicts, or suspected cross-account entitlement leakage.

## Recovery / rollback notes

Prefer replay/reconciliation from Stripe events. Manual entitlement correction must be account-scoped, approved, and recorded.

## Verification after fix

- Billing page shows expected plan/trial state.
- Entitlement resolver returns expected features.
- Webhook/event evidence explains the change.

## Related tests

- Billing, entitlement, trial, and founder-offer tests under `tests/security` and service tests.
