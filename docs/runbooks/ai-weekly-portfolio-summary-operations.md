# AI Weekly Portfolio Summary Operations

Use this when the weekly portfolio AI card is missing, stuck in fallback, or not reflecting the current portfolio picture.

## What this slice does

OASIS now generates a read-only weekly portfolio briefing for manager/root users.

The briefing is advisory only. It does not:

- send email automatically
- change reporting settings
- mutate portfolio health scores
- change finance or maintenance records

The card shows:

- a headline summary
- wins
- risks
- recommended focus
- cashflow notes
- properties to watch when the current data supports that view

## Runtime pieces

Required overlay:

- [ai_weekly_portfolio_summary.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_weekly_portfolio_summary.sql)

Required function:

- `generate-weekly-portfolio-summary`

Shared helper:

- [weeklyPortfolioInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/weeklyPortfolioInsight.ts)

## Required secrets

Reuse the same AI settings as the other AI slices:

- `ALLOWED_APP_ORIGINS`
- `OPENAI_API_KEY`
- `OASIS_AI_MODEL`
- `OASIS_AI_CACHE_TTL_HOURS`

Optional:

- `OPENAI_BASE_URL`

## Deploy order

1. Apply [ai_weekly_portfolio_summary.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_weekly_portfolio_summary.sql)
2. Deploy `generate-weekly-portfolio-summary`
3. Confirm the existing AI secrets are present
4. Open `/portfolio-health` as an owner/admin/staff user

## Expected behavior

- the portfolio health page shows a weekly AI briefing card
- the card can refresh without altering reporting settings
- the card uses current weekly summary, property health, attention, and open security signals
- if OpenAI is unavailable, the card still renders using deterministic fallback
- only manager/root roles can see the card

## If the card is missing

Check:

1. the current user is `owner`, `admin`, `staff`, or root
2. `generate-weekly-portfolio-summary` is deployed
3. `ALLOWED_APP_ORIGINS` includes the live app origin with full `https://...`
4. the SQL overlay has been applied

## If the card always falls back

Check:

1. `OPENAI_API_KEY` is present for Edge Functions
2. `OASIS_AI_MODEL` is valid
3. OpenAI permissions still allow `Responses -> Write`
4. function logs for `generate-weekly-portfolio-summary`

Fallback is acceptable behavior. It means the page still produces a usable briefing from deterministic rules.

## If the summary feels stale or incomplete

Remember:

- the first version is built from the current portfolio weekly summary, property operational health snapshot, top attention items, and open security anomaly count
- refreshes are still cache-aware, so repeated reads without material data changes should reuse the current insight

Check:

1. `OASIS_AI_CACHE_TTL_HOURS` is set to an expected value
2. the underlying portfolio weekly summary RPC is current
3. property operational health rows exist for the account
4. the account has enough recent activity to produce meaningful wins/risks

If the summary still looks wrong, force refresh the card and inspect the latest function logs.
