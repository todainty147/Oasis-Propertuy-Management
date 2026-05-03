-- =========================================================
-- AI weekly portfolio summary
-- Purpose: extend the AI insight foundation so OASIS can cache
-- account-scoped weekly portfolio briefings alongside the existing
-- operator-facing AI surfaces.
-- =========================================================

alter table public.ai_insights
  drop constraint if exists ai_insights_type_check;

alter table public.ai_insights
  add constraint ai_insights_type_check
  check (
    insight_type in (
      'attention_briefing',
      'property_health_explainer',
      'maintenance_triage_suggestion',
      'contractor_recommendation',
      'weekly_portfolio_summary_ai'
    )
  );

alter table public.ai_prompt_runs
  drop constraint if exists ai_prompt_runs_type_check;

alter table public.ai_prompt_runs
  add constraint ai_prompt_runs_type_check
  check (
    insight_type in (
      'attention_briefing',
      'property_health_explainer',
      'maintenance_triage_suggestion',
      'contractor_recommendation',
      'weekly_portfolio_summary_ai'
    )
  );
