# Pilot Billing Mode

Status: controlled 5-10 landlord pilot.

This pilot does not depend on live Stripe self-serve payments. The user promise is simple: early access trial users are not charged automatically, and billing is handled manually by the Tenaqo team until a live billing cutover is explicitly completed.

Stripe status: sandbox/test until live cutover.

## Billing Surface Map

| Surface | Location | Current pilot mode | Notes |
| --- | --- | --- | --- |
| Self-serve checkout | `src/pages/BillingPage.jsx` -> `startCheckout` -> `supabase/functions/create-checkout-session` | Live-ready but disabled by default | Hidden from normal pilot users unless `VITE_STRIPE_LIVE_BILLING_ENABLED=true`. |
| Customer portal | `src/pages/BillingPage.jsx` -> `openCustomerPortal` -> `supabase/functions/create-customer-portal-session` | Live-ready but disabled by default | Replaced with a contact billing action during pilot mode. |
| Stripe webhook | `supabase/functions/stripe-webhook/index.ts` | Sandbox/test until cutover | Updates billing state when Stripe events are received; live processing has not been used as the pilot dependency. |
| Subscription table | `supabase/20260315_billing.sql`, `billing_subscriptions` | Backend-ready | RLS allows account managers to read; direct authenticated writes are blocked. |
| Tenaqo trial | `supabase/self_serve_landlord_signup.sql`, `supabase/create_landlord_invitation.sql`, `src/context/AccountContext.jsx` | Active pilot path | New self-serve or invited landlord accounts get a 14-day trial. |
| Trial expiry and near-expiry UI | `src/pages/BillingPage.jsx`, `src/context/AccountContext.jsx` | Manual contact flow | Near expiry and expired states tell users to contact Tenaqo, not to self-serve checkout. |
| Root trial controls | `src/pages/admin/RootAccountsPage.jsx`, `src/services/operatorAgencyService.js`, `supabase/trial_period_enforcement.sql` | Pilot operations path | Root operators can identify expiring/expired trials, extend trial end dates, or remove the cap with a reason. |
| Operator/Agency grants | `RootAccountsPage.jsx`, `operator_agency_grants.sql` | Root-controlled | Root can create grants and payment links; normal users do not generate these links themselves. |
| Founder offer | `src/services/founderOfferService.js`, `FounderEntitlementCard`, `founder_launch_offer.sql` | Active entitlement overlay | `FOUNDER20` gives Pro effective access at Starter billed plan for 12 months, capped by the launch offer counter. |
| Pricing CTAs | `marketing-site/content/pricing.ts` | Early access CTA | Public pricing links to the app/early access flow and does not trigger Stripe checkout directly. |

## User Promise

- Pilot users are on an early access trial.
- Tenaqo will not automatically charge a card during the pilot.
- If the trial is close to ending or has ended, the next step is to contact Tenaqo for an extension or manual activation.
- Existing account data remains intact when a trial expires; paid feature gates may restrict access until root extends the trial or activates the account.

## Trial Behaviour

Self-serve landlord signup and root invitations apply a 14-day trial. `AccountContext` resolves expired trials to the `trial_expired` sentinel plan, which has rank 0 in `src/lib/entitlements.js`. This keeps feature access restricted without deleting account data.

Root operators can use Account Management to:

- filter trial active, expiring, and expired accounts;
- set a future trial end date with an audit reason;
- remove the trial cap for approved accounts;
- distinguish root accounts from landlord accounts;
- manage Operator/Agency grant state separately from self-serve subscriptions.

## Founder Offer Behaviour

The founder offer is separate from live Stripe checkout. `FOUNDER20` is applied through the founder launch offer RPC and stored as an active `launch_offer` entitlement. The frontend reads that entitlement and shows the effective plan, billed plan, expiry date, monthly AI limit, and founder position.

The root account page reads `launch_offer_status` so operators can see redeemed, remaining, cancelled, and last redeemed counts. The offer does not bypass root-only billing controls or RLS.

## Manual Pilot Process

1. Confirm the pilot account has the expected owner/admin membership.
2. Confirm the account trial end date and plan label in root Account Management.
3. If the pilot needs more time, extend the trial with a clear reason.
4. If the pilot should be activated manually, remove the trial cap or create the appropriate Operator/Agency grant.
5. Tell the user that billing is handled manually during early access and that no automatic card charge will occur.
6. Keep Stripe checkout and Customer Portal hidden from normal users unless the live cutover flag is intentionally enabled.

## Live Cutover Checklist Placeholder

Do not enable live self-serve billing until the following are complete:

- Stripe products, prices, checkout, Customer Portal, and webhook are verified in live mode.
- Webhook signing secret and Edge Function environment variables are live and rotated.
- A live checkout can create/update `billing_subscriptions` correctly.
- A live Customer Portal session can be opened and scoped to the correct account.
- Root operators have a rollback path for mistaken subscriptions or failed webhooks.
- Billing copy is changed from manual pilot mode to self-serve live billing.
- `VITE_STRIPE_LIVE_BILLING_ENABLED=true` is set only for the intended live environment.
