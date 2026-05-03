# AI Cost Controls Operations

Use this when the AI usage card shows wrong totals, quota limits are being hit unexpectedly, a user is rate-limited despite seemingly having budget remaining, or the monthly reset does not appear to have happened.

## What this slice does

The AI cost controls system gates all five AI Edge Functions behind plan-aware daily and monthly call limits, and tracks usage in `ai_usage_meter`. The billing page exposes this via `AiUsageSummaryCard`.

- **Daily limit** — per-account per-feature ceiling enforced by `reserve_ai_call_checked` SQL RPC
- **Monthly limit** — same RPC, summing daily rows for the calendar month
- **Meter rows** — only daily (`YYYY-MM-DD`) rows are written; monthly totals are derived at query time
- **Quota reservation** — `checkAndReserveAiCall` is called atomically before the AI model call; uses `pg_advisory_xact_lock` to prevent concurrent callers from both passing the limit check

Plan limits:

| Plan | Daily | Monthly |
|---|---|---|
| starter | 0 (AI gated) | 0 |
| growth | 50 | 500 |
| pro | 200 | 3,000 |
| operator_agency | unlimited | unlimited |

## Runtime pieces

Required migrations:

```
supabase/ai_cost_controls.sql
supabase/ai_usage_meter_increment.sql
supabase/reserve_ai_call_checked.sql
supabase/account_entitlements.sql
```

Shared Edge Function helper:

- [supabase/functions/_shared/aiSafety.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/aiSafety.ts)

Frontend card:

- [src/components/AiUsageSummaryCard.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/AiUsageSummaryCard.jsx)

## Inspecting raw usage data

All meter rows (daily granularity):

```sql
select feature_key, period_key, prompt_runs, input_tokens, output_tokens,
       estimated_cost, updated_at
from public.ai_usage_meter
where account_id = '<account_id>'
order by period_key desc, feature_key;
```

Usage for the current calendar month:

```sql
select feature_key,
       sum(prompt_runs)    as runs,
       sum(input_tokens)   as input_tokens,
       sum(output_tokens)  as output_tokens,
       sum(estimated_cost) as estimated_cost
from public.ai_usage_meter
where account_id = '<account_id>'
  and period_key >= date_trunc('month', now())::date::text
  and period_key <  (date_trunc('month', now()) + interval '1 month')::date::text
group by feature_key
order by runs desc;
```

Note: `period_key` is stored as `YYYY-MM-DD` text. The range filter above avoids double-counting; there should be no `YYYY-MM` aggregate rows for accounts on the current codebase.

## Usage card shows ~2x the expected total

This was a known bug (fixed in the current codebase). Prior to the double-counting fix, `reserveAiCall` wrote both a daily row (`YYYY-MM-DD`) and a monthly aggregate row (`YYYY-MM`), and the summary query matched both.

If you see `YYYY-MM` rows in `ai_usage_meter`:

```sql
select period_key, feature_key, prompt_runs
from public.ai_usage_meter
where account_id = '<account_id>'
  and length(period_key) = 7  -- YYYY-MM format
order by period_key desc;
```

These are legacy rows. They are excluded from all current queries (`LIKE 'YYYY-MM-__'` filter in `get_account_ai_usage_summary`). You can delete them after confirming the current codebase is deployed:

```sql
-- Dry run first:
select count(*) from public.ai_usage_meter
where account_id = '<account_id>'
  and length(period_key) = 7;

-- Delete after confirming:
delete from public.ai_usage_meter
where account_id = '<account_id>'
  and length(period_key) = 7;
```

## User is getting 429 but usage seems low

The 429 can come from either the daily or monthly limit. Inspect both:

```sql
-- Daily usage today
select feature_key, prompt_runs
from public.ai_usage_meter
where account_id = '<account_id>'
  and period_key = to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

-- Monthly total
select feature_key, sum(prompt_runs) as monthly_total
from public.ai_usage_meter
where account_id = '<account_id>'
  and period_key >= to_char(date_trunc('month', now()), 'YYYY-MM-DD')
  and period_key <  to_char(date_trunc('month', now()) + interval '1 month', 'YYYY-MM-DD')
group by feature_key;
```

Compare against the plan limits:

```sql
select public.ai_daily_call_limit_for_plan(
  public.account_subscription_plan('<account_id>'), '<feature_key>'
);
select public.ai_monthly_call_limit_for_plan(
  public.account_subscription_plan('<account_id>')
);
```

If the usage is legitimately at the limit, the 429 is correct. The limit resets at UTC midnight (daily) or on the first of the month (monthly).

## Quota is consumed but no AI output was produced

The call was likely running in fallback mode. If `OPENAI_API_KEY` is not set in Edge Function secrets, all five functions return deterministic fallback output without hitting the model. In the current codebase, `checkAndReserveAiCall` is only called when `OPENAI_API_KEY` is present — so no quota should be consumed in fallback mode.

Check Edge Function logs for the function in question to confirm whether OpenAI was called or the fallback branch executed.

If quota was consumed during fallback, the deployed Edge Function predates the fallback-path fix. Re-deploy the function.

## Monthly usage did not reset at month start

Monthly enforcement is derived by summing daily rows for the current calendar month. There is no separate monthly counter that needs to reset. The usage resets naturally because new daily rows for the new month start at zero.

If the monthly total appears to carry over into the new month, inspect the `period_key` values:

```sql
select period_key, sum(prompt_runs)
from public.ai_usage_meter
where account_id = '<account_id>'
  and feature_key = '<feature_key>'
group by period_key
order by period_key desc
limit 10;
```

Rows from the previous month have dates like `2026-03-31` and will not appear in the April month range query. If they do, the date range calculation in the RPC or TS layer is using local time instead of UTC.

## Usage card is hidden

The card hides itself when `summary.plan === 'starter'` and `totalPromptRuns === 0`. Starter accounts with no AI usage do not see the card. This is expected.

If a non-Starter account cannot see the card, confirm `AiUsageSummaryCard` is rendered on the Billing page and the `get_account_ai_usage_summary` RPC is deployed.

## Usage summary RPC returns no rows

`get_account_ai_usage_summary(account_id, period)` returns one row per feature key with non-zero usage for the given month. If it returns zero rows, there is genuinely no recorded usage for that period.

Test the RPC directly:

```sql
select *
from public.get_account_ai_usage_summary(
  '<account_id>',
  to_char(now(), 'YYYY-MM')
);
```

If the function does not exist, `ai_cost_controls.sql` has not been applied.

## Verifying the atomic check+reserve RPC is deployed

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'reserve_ai_call_checked';
```

If this returns no row, apply `supabase/reserve_ai_call_checked.sql`. Without it, the Edge Functions will throw a 500 on every AI request.
