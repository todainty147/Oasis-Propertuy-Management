# AI Maintenance Triage Operations

Use this when the maintenance inbox should show AI triage guidance but the suggestion card is missing, stuck in fallback, or not matching the request context.

## What this slice does

OASIS now generates a read-only triage suggestion for active maintenance requests in the manager inbox.

The suggestion is advisory only. It does not:

- change request priority
- create work orders
- assign contractors
- close or reopen requests

The card shows:

- suggested urgency
- suggested category / trade
- suggested tenant acknowledgement
- manager note
- facts used for the recommendation

## Runtime pieces

Required overlay:

- [ai_maintenance_triage.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_maintenance_triage.sql)

Required function:

- `generate-maintenance-triage`

Shared helper:

- [maintenanceTriageInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/maintenanceTriageInsight.ts)

## Required secrets

Reuse the same AI settings as the Command Center and Portfolio Health slices:

- `ALLOWED_APP_ORIGINS`
- `OPENAI_API_KEY`
- `OASIS_AI_MODEL`
- `OASIS_AI_CACHE_TTL_HOURS`

Optional:

- `OPENAI_BASE_URL`

## Deploy order

1. Apply [ai_maintenance_triage.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_maintenance_triage.sql)
2. Deploy `generate-maintenance-triage`
3. Confirm the existing AI secrets are present
4. Open `/maintenance-inbox` as an owner/admin/staff user

## Expected behavior

- active requests show a triage suggestion card
- closed and resolved requests do not show the card
- if OpenAI is unavailable, the card still renders using deterministic fallback triage
- only manager/root roles can see the card

## If the card is missing

Check:

1. the request is not `closed` or `resolved`
2. the current user is `owner`, `admin`, `staff`, or root
3. `generate-maintenance-triage` is deployed
4. `ALLOWED_APP_ORIGINS` includes the live app origin with full `https://...`
5. the SQL overlay has been applied

## If the card always falls back

Check:

1. `OPENAI_API_KEY` is present for Edge Functions
2. `OASIS_AI_MODEL` is valid
3. OpenAI permissions still allow `Responses -> Write`
4. function logs for `generate-maintenance-triage`

Fallback is acceptable behavior. It means the inbox still works and the triage helper is still available, just without model-generated phrasing.

## If the suggestion looks wrong

Remember:

- the first version uses current request text plus lightweight work-order/property context
- it is meant to help managers triage faster, not replace operational judgment

Check:

1. the request title/description are detailed enough
2. the request has the right current status/priority
3. linked work orders and property labels are present

If the problem is persistent, refresh the suggestion from the card and inspect the latest function logs.
