# AI Contractor Recommendation Operations

Use this when the create-work-order drawer should show contractor guidance but the recommendation card is missing, stuck in fallback, or clearly not matching the request history.

## What this slice does

OASIS now generates a read-only contractor recommendation for maintenance requests before a manager assigns the work order.

The recommendation is advisory only. It does not:

- assign the contractor
- create the work order
- change request state
- contact the contractor

The card shows:

- recommended contractor
- reason for the recommendation
- alternatives when they exist
- facts used
- missing-data warning when history is thin

## Runtime pieces

Required overlay:

- [ai_contractor_recommendation.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_contractor_recommendation.sql)

Required function:

- `generate-contractor-recommendation`

Shared helpers:

- [contractorRecommendationInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/contractorRecommendationInsight.ts)
- [maintenanceTriageInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/maintenanceTriageInsight.ts)

## Required secrets

Reuse the same AI settings as the earlier AI slices:

- `ALLOWED_APP_ORIGINS`
- `OPENAI_API_KEY`
- `OASIS_AI_MODEL`
- `OASIS_AI_CACHE_TTL_HOURS`

Optional:

- `OPENAI_BASE_URL`

## Deploy order

1. Apply [ai_contractor_recommendation.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_contractor_recommendation.sql)
2. Deploy `generate-contractor-recommendation`
3. Confirm the existing AI secrets are present
4. Open `/maintenance-inbox` as an owner/admin/staff user
5. Open `Create work order` for an active request

## Expected behavior

- the drawer shows a contractor recommendation card
- the card can refresh without changing the request or work-order state
- managers can click `Use recommendation` or an alternative to prefill the contractor field
- if OpenAI is unavailable, the card still renders using deterministic fallback
- only manager/root roles can see the card

## If the card is missing

Check:

1. the request is visible and the drawer is open
2. the current user is `owner`, `admin`, `staff`, or root
3. `generate-contractor-recommendation` is deployed
4. `ALLOWED_APP_ORIGINS` includes the live app origin with full `https://...`
5. the SQL overlay has been applied

## If the card always falls back

Check:

1. `OPENAI_API_KEY` is present for Edge Functions
2. `OASIS_AI_MODEL` is valid
3. OpenAI permissions still allow `Responses -> Write`
4. function logs for `generate-contractor-recommendation`

Fallback is acceptable behavior. It means the drawer still provides a recommendation, just without model-generated phrasing.

## If the recommendation looks weak

Remember:

- the first version leans on active contractors, prior work-order history, acknowledgement behavior, and ratings where available
- thin contractor history should produce a missing-data warning rather than fake certainty

Check:

1. the account has active contractors
2. those contractors have prior work-order history
3. contractor ratings exist if you expect quality weighting
4. the request title/description are detailed enough for trade matching

If the problem is persistent, refresh the recommendation from the drawer and inspect the latest function logs.
