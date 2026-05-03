# Rent Shield Operations

Use this when the Rent Shield score looks wrong, a property is missing from the portfolio view, a recalculation is not updating the score, or the low-confidence badge is appearing unexpectedly.

## What this slice does

Rent Shield (`/compliance/rent-shield`) computes a payment health score for each rental property based on historical payment behaviour. It provides:

- A per-property shield score (0–100) and tier (Excellent / Good / At Risk / Critical)
- A portfolio overview showing all properties' latest assessments
- A "Recalculate" button per property and "Recalculate all" for the portfolio
- A low-confidence indicator when the score is based on fewer than 5 overdue payment data points

Score computation is deterministic — no AI is involved. An `ai_narrative` column exists for a future Rent Shield explainer edge function but is not populated yet (see L-024 in limitations doc).

Requires **growth** plan or above.

## Runtime pieces

Required migrations (apply in order):

```
supabase/compliance_suite_phase0.sql
supabase/account_entitlements.sql
supabase/compliance_security_hardening.sql
supabase/compliance_hardening_phase7.sql
```

Services:

- [src/services/rentShieldService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/rentShieldService.js)

Pages:

- [src/pages/compliance/RentShieldPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/compliance/RentShieldPage.jsx)

Known open limitations:

- [docs/COMPLIANCE_SUITE_LIMITATIONS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/COMPLIANCE_SUITE_LIMITATIONS.md) — L-022, L-024, L-026 status

## First checks

```sql
select public.account_subscription_plan('<account_id>');
select public.account_feature_required_plan('rent_shield');
-- expected: 'growth'
```

The page shows `FeatureAccessCard` if the plan is Starter.

## Portfolio overview is empty

No assessments exist yet. The page shows an empty state until at least one property has been assessed.

Verify properties exist for the account:

```sql
select id, address, city from public.properties
where account_id = '<account_id>'
order by address;
```

If properties exist but no assessments, the user must click Recalculate on at least one property, or use "Recalculate all" from the portfolio view.

Verify assessments:

```sql
select property_id, period, shield_score, tier, sample_size,
       generated_at
from public.rent_shield_assessments
where account_id = '<account_id>'
order by generated_at desc
limit 20;
```

## Score looks wrong for a property

### Score always reflects a different time period

As of Phase 6, `computeAndSaveAssessment` derives the payment window from the `period` parameter (YYYY-MM format). Confirm the period key passed matches the expected calendar month:

```sql
select property_id, period, shield_score, tier, sample_size,
       metadata, generated_at
from public.rent_shield_assessments
where account_id = '<account_id>'
  and property_id = '<property_id>'
order by generated_at desc
limit 5;
```

The `metadata` column contains the date range used (`date_from`, `date_to`). If it shows a fixed 12-month window, the Phase 6 fix has not been deployed.

### Score is correct but low-confidence badge is surprising

The badge appears when `sample_size < 5`. This means fewer than 5 overdue payments were used to compute the P90 percentile, which makes the tail-risk estimate statistically weak. It is not an error — it is an expected data confidence indicator.

Query the underlying payment data:

```sql
select id, amount, due_date, paid_date, status
from public.payments
where account_id = '<account_id>'
  and property_id = '<property_id>'
  and status in ('overdue', 'partial', 'late')
order by due_date desc
limit 20;
```

If there are fewer than 5 such payments, the badge is correct.

### Score is unchanged after Recalculate

The `computeAndSaveAssessment` call upserts on `(account_id, property_id, period)`. If the score does not change after clicking Recalculate, the payment data for that period has not changed since the last assessment.

To force a fresh row, compute with a different period key or inspect whether new payments have been added for the period.

## "Recalculate all" does not finish

The portfolio view iterates all properties sequentially. For accounts with many properties, this can take a while. The button shows a counter as it runs.

If it appears to stall:

1. Open browser devtools → Network. Look for failed requests to the Supabase client.
2. Check for individual property failures — each property is attempted independently. A single failure does not abort the batch.
3. If a specific property is causing consistent failures, recalculate that property individually and note the error.

## Assessment row exists but portfolio view is outdated

`get_latest_assessments_by_property` uses `DISTINCT ON (property_id)` ordered by `generated_at DESC` to return only the most recent assessment per property. If the portfolio row shows a stale score:

```sql
select property_id, period, shield_score, tier, generated_at
from public.rent_shield_assessments
where account_id = '<account_id>'
  and property_id = '<property_id>'
order by generated_at desc
limit 3;
```

If the most recent row has the correct score but the UI shows an older one, the RPC `get_latest_assessments_by_property` may not be deployed (Phase 6 fix). Re-apply `compliance_suite_phase0.sql` or equivalent.

## Entitlement error on write

```
assert_account_feature_access: feature 'rent_shield' not available on plan 'starter'
```

The account is on the Starter plan. `upsert_rent_shield_assessment` RPC enforces plan entitlement server-side. Upgrade the account or use a growth/pro test account.
