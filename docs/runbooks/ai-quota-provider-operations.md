# AI Quota / Provider Operations Runbook

## Purpose

Use this when AI features are unavailable, quota is exceeded unexpectedly, provider calls fail, generated output looks unsafe, or source-document context is missing.

## Scope and current status

AI features support operational insight, triage, summaries, and review assistance. They must not be presented as professional, legal, tax, or safety determinations.

## Critical invariants

- Quota enforcement must be account-scoped.
- Provider failures must fall back safely.
- AI output must remain advisory and source-aware.
- Missing source documents or insufficient evidence should produce cautious wording.
- Do not bypass quota or provider safety gates for support convenience.

## Key files

- `src/services/aiUsageService.js`
- `src/services/attentionInsightService.js`
- `src/services/maintenanceTriageInsightService.js`
- `src/services/contractorRecommendationService.js`
- `src/services/weeklyPortfolioInsightService.js`
- `supabase/ai_usage_meter_increment.sql`
- `supabase/ai_*.sql`
- `docs/runbooks/ai-cost-controls-operations.md`
- `docs/runbooks/ai-maintenance-triage-operations.md`
- `docs/runbooks/ai-contractor-recommendation-operations.md`

## Data model / RPCs / functions

Relevant objects include AI usage counters, reserve/increment RPCs, feature-specific insight tables, provider request metadata, and fallback states.

## Normal operation

1. UI requests an AI-assisted insight.
2. Quota/reservation succeeds.
3. Provider call returns output or safe fallback.
4. App stores/returns advisory content with context.

## Common failure modes

- Quota exceeded: account allowance or override exhausted.
- Provider error/time-out: fallback should appear.
- Missing source document: output should say source is unavailable.
- Unsafe/confident output: wording guard or prompt issue.
- Duplicate usage: reservation/increment called twice.

## Triage checklist

1. Confirm account id, feature, and timestamp.
2. Check quota/reservation rows and plan/override state.
3. Check provider error classification or fallback reason.
4. Confirm source records/documents were available.
5. Review output wording for overclaiming.

## Safe operator actions

- Ask user to retry after provider outage.
- Escalate quota override requests to product.
- Disable or hide unsafe AI output if feature flag allows.

## Unsafe actions / never do

- Do not bypass quotas manually.
- Do not tell users AI output is professional advice.
- Do not invent missing source evidence.
- Do not paste secrets or private tokens into provider prompts.

## Customer-safe wording

“The AI feature provides an assistance signal based on available records. If source data is missing or the provider is unavailable, the result may be limited or unavailable.”

## Escalation

Escalate repeated provider failures, hallucination-risk wording, suspected data leakage, quota double-counting, or unsafe output in compliance/tax/security contexts.

## Recovery / rollback notes

Prefer feature-specific fallback and quota reconciliation. Preserve provider error evidence.

## Verification after fix

- Quota count is correct.
- Provider fallback or output is shown as expected.
- Output references available source context and avoids overclaiming.

## Related tests

- AI cost controls and feature runbook tests/contracts where present.
