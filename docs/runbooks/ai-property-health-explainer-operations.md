# AI Property Health Explainer Operations

This runbook covers the second AI slice in OASIS: the Portfolio Health property explainer.

## What it does

- reads the existing property health snapshot for one property
- explains the strongest current risk drivers
- shows the non-AI facts used for the explanation
- caches the latest result in `ai_insights`
- records prompt runs in `ai_prompt_runs`
- rolls usage into `ai_usage_meter`

The property health score and the underlying snapshot remain the source of truth. The explainer interprets the current state; it does not mutate workflow.

## Runtime pieces

- SQL overlay:
  - [ai_property_health_explainer.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_property_health_explainer.sql)
- Edge Function:
  - [generate-property-health-explainer/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/generate-property-health-explainer/index.ts)
- Shared helper:
  - [propertyHealthInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/propertyHealthInsight.ts)
- App service:
  - [propertyHealthInsightService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/propertyHealthInsightService.js)
- UI surface:
  - [PortfolioHealthDashboardPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/PortfolioHealthDashboardPage.jsx)

## Required deployment steps

1. Apply the AI foundation overlay if it is not already present:
   - `supabase/ai_attention_insights.sql`
2. Apply the property explainer overlay:
   - `supabase/ai_property_health_explainer.sql`
3. Deploy the Edge Function:
   - `generate-property-health-explainer`
4. Ensure function secrets are set:
   - `ALLOWED_APP_ORIGINS`
   - `OPENAI_API_KEY`

Optional secrets:

- `OPENAI_BASE_URL`
- `OASIS_AI_MODEL` or `OPENAI_MODEL`
- `OASIS_AI_CACHE_TTL_HOURS`

## What the page expects

The page chooses the lowest-scoring property from the existing property health list and asks the Edge Function to explain that one property.

The explainer is designed to:

- fail soft
- fall back to deterministic text if OpenAI is missing or fails
- always show the facts used beside the explanation

## Common failure modes

### 1. The explainer card does not appear

Check:

- the account has `portfolio_health` entitlement
- `generate-property-health-explainer` is deployed
- the AI overlays are applied
- `property_operational_health_snapshot` returns rows for the account

### 2. The explainer always says fallback

Check:

- `OPENAI_API_KEY` is set on the function runtime
- the function was redeployed after setting the secret
- the key still has `Responses -> Write`
- the provider response is parseable

Fallback is expected when:

- no OpenAI key is present
- OpenAI returns a non-2xx response
- JSON parsing or schema normalization fails

### 3. The explainer is visible but feels detached from the page

Check:

- the lowest-scoring property on the page matches the property label in the AI card
- the `Facts used for the explanation` list reflects current property signals
- the user is not looking at a stale cached card after major data changes

Use the page refresh button on the explainer card to force regeneration.

## Recommended smoke test

1. Sign in as an owner/admin/staff user on an account with Portfolio Health access.
2. Open `/portfolio-health`.
3. Confirm the AI explainer card appears.
4. Confirm the card matches the lowest-scoring property on the page.
5. Confirm the `Facts used for the explanation` list mirrors visible risk signals.
6. Click `Refresh explainer`.
7. Confirm the rest of the page continues to load even if the explainer falls back.

## Useful test coverage

- [propertyHealthInsightHelper.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/propertyHealthInsightHelper.test.js)
- [propertyHealthInsightService.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/propertyHealthInsightService.test.js)
- [safeEdgeErrorResponseContracts.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/safeEdgeErrorResponseContracts.test.js)
- [portfolio-health-ai.spec.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/portfolio-health-ai.spec.js)
