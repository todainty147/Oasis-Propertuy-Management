# AI Attention Insights Operations

This runbook covers the first AI slice in OASIS: the Command Center attention briefing.

## What it does

- reads the existing Command Center queue for the active account
- generates a short action-oriented briefing
- caches the latest result in `ai_insights`
- records prompt runs in `ai_prompt_runs`
- rolls simple monthly usage totals into `ai_usage_meter`

The Command Center queue remains the source of truth. The briefing explains the queue; it does not mutate workflow state.

## Runtime pieces

- SQL overlay:
  - [ai_attention_insights.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/ai_attention_insights.sql)
- Edge Function:
  - [generate-attention-insight/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/generate-attention-insight/index.ts)
- Shared helper:
  - [attentionInsight.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/_shared/attentionInsight.ts)
- App service:
  - [attentionInsightService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/attentionInsightService.js)
- UI surface:
  - [CommandCenterPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/CommandCenterPage.jsx)

## Required deployment steps

1. Apply the SQL overlay:
   - `supabase/ai_attention_insights.sql`
2. Deploy the Edge Function:
   - `generate-attention-insight`
3. Set function secrets as needed:
   - `ALLOWED_APP_ORIGINS`
   - `OPENAI_API_KEY`

Optional secrets:

- `OPENAI_BASE_URL`
- `OPENAI_MODEL` or `OASIS_AI_MODEL`
- `OASIS_AI_CACHE_TTL_HOURS`

## AI capability setup

This slice uses OpenAI through the server-side Edge Function only. The browser never talks to OpenAI directly.

### 1. Create the OpenAI key

In the OpenAI platform:

1. Create a new secret key for the project you want OASIS to use.
2. `Owned by`: `You` is acceptable for now. A service-account key is better later when the setup needs to survive team/user changes.
3. `Permissions`: choose `Restricted`.
4. Set:
   - `Responses (/v1/responses)` -> `Write`
5. Set everything else to `None`, including:
   - `Chat completions`
   - `Embeddings`
   - `Images`
   - `Moderations`
   - `Assistants`
   - `Threads`
   - `Files`
   - `Vector Stores`
   - `Prompts`
   - `Datasets`

For the current OASIS AI slice, `Responses -> Write` is the only provider capability required.

### 2. Set Supabase function secrets

Set the required runtime secrets on the Supabase project:

```bash
supabase secrets set \
  ALLOWED_APP_ORIGINS="https://www.oasisrentalmgt.app,https://oasisrentalmgt.app" \
  OPENAI_API_KEY="YOUR_OPENAI_API_KEY" \
  OASIS_AI_MODEL="gpt-4.1-mini" \
  OASIS_AI_CACHE_TTL_HOURS="6" \
  --project-ref nodpjtkuefcmnxqxjtul
```

Recommended values:

- `ALLOWED_APP_ORIGINS`
  - full browser origins only, for example:
    - `https://www.oasisrentalmgt.app`
    - `https://oasisrentalmgt.app`
- `OPENAI_API_KEY`
  - the OpenAI secret key created above
- `OASIS_AI_MODEL`
  - recommended starting value: `gpt-4.1-mini`
- `OASIS_AI_CACHE_TTL_HOURS`
  - recommended starting value: `6`

Notes:

- `OPENAI_BASE_URL` is usually not needed. Leave it unset unless OASIS is intentionally pointed at a compatible proxy or alternate provider endpoint.
- `OPENAI_MODEL` is supported for compatibility, but `OASIS_AI_MODEL` is the preferred setting name.

### 3. Deploy the function

After secrets are set, deploy the function:

```bash
supabase functions deploy generate-attention-insight --project-ref nodpjtkuefcmnxqxjtul
```

### 4. Verify the feature

1. Sign in as a root, owner, admin, or staff user with Command Center access.
2. Open `/command-center`.
3. Confirm the AI briefing card appears above the existing queue.
4. Click `Refresh briefing`.
5. Confirm the suggested actions still link into the normal OASIS workflow surfaces.

### 5. Confirm fallback behaviour

If the OpenAI key is missing, invalid, or temporarily failing:

- Command Center should still load
- the AI card should still render
- the card should show a deterministic fallback briefing instead of breaking the page

This fallback behavior is intentional and should be preserved.

## Default behaviour when OpenAI is not configured

If `OPENAI_API_KEY` is missing, OASIS does **not** break the Command Center.

Instead it returns a fallback briefing generated from the same queue facts:

- urgent/action counts
- overdue pressure
- top actionable items
- existing link paths back into the real workflow

This keeps the surface useful in local development and during provider outages.

## Current scope and guardrails

- account-scoped only
- manager/root-readable only through existing account access checks
- no direct browser-to-model calls
- no workflow mutations
- no tenant or contractor access
- no raw prompt or provider error leakage to the browser

The function checks:

- `assert_manage_account_access(account_id)`
- `assert_account_feature_access(account_id, 'command_center')`

## Cached insight shape

The current payload stores:

- `summary`
- `priority`
- `top_reasons[]`
- `suggested_actions[]`
- `confidence`
- `source`
- `generated_at`

The first slice supports:

- `source = openai`
- `source = fallback`

## Common failure modes

### 1. Card does not appear

Check:

- the account has Command Center entitlement
- `generate-attention-insight` is deployed
- the SQL overlay is applied

The UI intentionally fails soft here; if the function is missing or blocked, the rest of Command Center still loads.

### 2. Card appears but always says fallback

Check:

- `OPENAI_API_KEY` is set on the function runtime
- outbound network from the function is healthy
- provider responses are parseable

Fallback is expected when:

- no API key is present
- OpenAI returns a non-2xx
- structured payload parsing fails

### 3. Duplicate-key errors in `ai_insights`

This slice uses `scope_entity_id` plus an idempotent upsert path so repeated page loads and refreshes should converge on one row per account insight scope.

If duplicates reappear, verify production has the latest:

- `ai_attention_insights.sql`
- `generate-attention-insight`

### 4. CORS errors

Check:

- `ALLOWED_APP_ORIGINS`

It must include full origins such as:

- `https://www.oasisrentalmgt.app`
- `https://oasisrentalmgt.app`

### 5. OpenAI key works in the provider UI but the OASIS function still falls back

Check:

- the correct OpenAI project was used when creating the key
- `OPENAI_API_KEY` was set on the Supabase project, not only in a local shell
- `generate-attention-insight` was redeployed after setting the secret
- the key still has `Responses -> Write`
- the key does not depend on broader permissions such as `Prompts`, `Files`, or `Datasets`

If these are correct and OASIS still falls back, inspect the function logs before changing model or cache settings.

## Recommended smoke test

1. Sign in as an owner/admin/staff user on a growth/pro account.
2. Open `/command-center`.
3. Confirm the attention briefing card appears.
4. Confirm the suggested actions link back into existing OASIS surfaces.
5. Click `Refresh briefing`.
6. Confirm the queue still loads normally even if the function falls back.

## Useful test coverage

- [attentionInsightHelper.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/attentionInsightHelper.test.js)
- [attentionInsightService.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/attentionInsightService.test.js)
- [safeEdgeErrorResponseContracts.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/safeEdgeErrorResponseContracts.test.js)
- [command-center-ai.spec.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/e2e/command-center-ai.spec.js)
