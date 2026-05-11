# Founder Launch Offer — OASIS v1

## Overview

The first 20 eligible landlords who create an OASIS landlord account automatically receive:

- **Effective plan**: Pro (full Pro feature access)
- **Billed plan**: Starter (Starter price charged by Stripe)
- **Duration**: 12 months from account creation
- **AI allowance**: 100 AI actions per account per month (configurable)

## Actual User Journey

1. User visits the OASIS marketing site
2. User clicks the CTA ("See OASIS in action") → routed to `/login`
3. User clicks "Sign up as landlord" → `/signup`
4. OASIS creates the landlord account via `create_self_serve_landlord_account()`
5. Immediately after account creation, OASIS calls `apply_founder_offer_on_landlord_signup()`
6. If the account is one of the first 20 eligible accounts:
   - A `launch_offer_redemptions` row is inserted with a unique position (1–20)
   - An `account_entitlements` row is inserted (`effective_plan=pro`, `billed_plan=starter`, `ends_at=now+12months`)
   - The plan resolver returns `pro` for all feature gate checks
7. The landlord sees: *"Founder Offer applied: you've unlocked Pro-level access for the Starter price for 12 months."*
8. If all slots are already claimed, the account is created normally without error

## Why No Marketing-Site Reservation

The marketing site does not reserve slots. Founder slots are only consumed when a real landlord account is created. This prevents:
- Slot squatting via form spam
- Slot leakage from incomplete signups
- Backend complexity from pre-signup lead tracking

## Why `effective_plan` Differs from `billed_plan`

| Concept | Value | Purpose |
|---|---|---|
| `effective_plan` | `pro` | Controls OASIS feature access (what the landlord can use) |
| `billed_plan` | `starter` | Controls Stripe billing (what the landlord is charged) |

The plan resolver (`account_subscription_plan()`) checks `account_entitlements` before Stripe, so the Stripe webhook writing `subscription_plan = 'starter'` to the `accounts` table does not downgrade the landlord's access.

## AI Allowance Rules

- Monthly limit: 100 AI actions per account per calendar month (default)
- Limit is stored in `account_entitlements.monthly_ai_credit_limit`
- `get_account_ai_monthly_limit()` returns this value if `> 0`, otherwise falls back to the plan-based limit
- Quota enforcement is atomic via `reserve_ai_call_checked()` with a PostgreSQL advisory lock
- If the monthly limit is reached, AI features return a 429 error and the UI shows:
  *"You've reached this month's included AI allowance for your Founder plan. Core OASIS features are still available."*

## Offer Expiry

After 12 months:
- `account_entitlements.ends_at` passes
- The plan resolver no longer returns `pro` from the entitlement
- The resolver falls through to the Stripe subscription plan (`starter`)
- The landlord is no longer on Pro — they see Starter features
- No automatic notification is sent in v1 (add a cron job / email workflow in v2)

## First 20 Automation

- The offer is defined in `launch_offers` with `max_redemptions = 20`
- The `apply_founder_offer_on_landlord_signup()` RPC counts active redemptions atomically (PostgreSQL advisory lock) before assigning a position
- Position is sequential (1–20) and unique (enforced by `UNIQUE (offer_id, position)`)
- Once 20 slots are filled, all subsequent signups return `qualified=false, status='slots_full'` and account creation continues normally
- To extend the offer: `UPDATE public.launch_offers SET max_redemptions = 25 WHERE code = 'FOUNDER20';`

## Stripe Configuration Required

1. Ensure a Stripe price for the **Starter plan** exists and is configured in the `create-checkout-session` Edge Function
2. Founder accounts use the Starter Stripe price — they are not charged a Pro price
3. The Stripe webhook continues to work normally; it writes `accounts.subscription_plan = 'starter'` which is overridden by the entitlement in the plan resolver
4. No Stripe coupon is required — the pricing difference is handled entirely by OASIS entitlements

## Supabase Migration Notes

Apply SQL files in this order:

```
1. supabase/founder_launch_offer.sql
   — Creates: launch_offers, launch_offer_redemptions, account_entitlements tables
   — Creates: apply_founder_offer_on_landlord_signup(), admin_apply_founder_offer_to_account(),
              launch_offer_status(), get_account_ai_monthly_limit()
   — Seeds: FOUNDER20 offer row (ON CONFLICT DO NOTHING)

2. supabase/account_subscription_plan_founder.sql
   — Replaces account_subscription_plan() with version that checks account_entitlements
   — Depends on: founder_launch_offer.sql (account_entitlements table)

3. supabase/reserve_ai_call_checked_founder.sql
   — Replaces reserve_ai_call_checked() to use get_account_ai_monthly_limit()
   — Depends on: founder_launch_offer.sql (get_account_ai_monthly_limit function)
```

Each file is idempotent (uses `CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

## RLS Notes

- `launch_offers`: authenticated users can SELECT where `is_active = true`
- `launch_offer_redemptions`: account managers can SELECT their own account's redemptions; no client writes
- `account_entitlements`: account managers can SELECT their own account's entitlements; no client writes
- All writes go through `SECURITY DEFINER` RPCs

## Admin Visibility

Root operators can query offer status via:

```sql
SELECT * FROM launch_offer_status('FOUNDER20');
```

Or via the Root Account Management page in the OASIS admin UI (shows a slot usage card at the top).

## Admin Recovery Steps

If a legitimate founder signup fails (check the `launch_offer_check_failed` events in `security_audit_ledger`):

1. Identify the affected `account_id` from the logs
2. Verify the account is legitimate (not sandbox, not root, owner has the correct role)
3. Use the admin recovery RPC (as a root operator):

```sql
-- Via Supabase SQL Editor (as service_role) or via root operator session:
SELECT admin_apply_founder_offer_to_account(
  'FOUNDER20',
  'affected-account-id-here',
  'Manual recovery: offer_check_failed logged at 2026-05-11 after signup'
);
```

4. Verify the result shows `qualified: true, status: 'redeemed'`
5. Confirm an `account_entitlements` row exists for the account
6. Check `security_audit_ledger` for `launch_offer_recovered_by_admin` event

**If all 20 slots are already taken and a slot needs to be added for a legitimate founder:**

```sql
UPDATE public.launch_offers
SET max_redemptions = 21
WHERE code = 'FOUNDER20';
-- Document the reason in a comment or internal note
```

Then run the recovery RPC above.

## How to Disable the Offer When Launch Period Ends

To stop new redemptions while preserving existing ones:

```sql
UPDATE public.launch_offers
SET is_active = false
WHERE code = 'FOUNDER20';
```

Existing `account_entitlements` rows are unaffected — active founders keep their Pro access until `ends_at`.

To set a hard deadline:

```sql
UPDATE public.launch_offers
SET ends_at = '2026-12-31T23:59:59Z'
WHERE code = 'FOUNDER20';
```

## Events Logged to `security_audit_ledger`

| Action | Trigger |
|---|---|
| `launch_offer_redeemed` | Successful redemption |
| `launch_offer_check_failed` | RPC exception during redemption attempt |
| `launch_offer_recovered_by_admin` | Admin recovery RPC used |

Events never contain: email addresses, passwords, payment details, AI prompt contents.

## Marketing Copy

Near the CTA on the marketing site:

> **Founder Offer**: The first 20 eligible landlords who create an OASIS landlord account get Pro-level access for the Starter price for 12 months, including a monthly AI allowance.

Small print:

> Founder access includes a fair-use AI allowance. Additional AI-heavy usage may be limited or offered as a paid add-on in future.

On successful qualified signup (shown to the landlord in-app):

> Founder Offer applied: you've unlocked Pro-level access for the Starter price for 12 months.

If slots are full: no error shown. Account creation completes normally.
