-- =========================================================
-- AI contractor recommendation
-- Purpose: extend the AI insight foundation so OASIS can cache
-- maintenance-request-scoped contractor recommendations and treat
-- maintenance_request as a first-class AI entity type.
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

alter table public.ai_insights
  drop constraint if exists ai_insights_entity_type_check;

alter table public.ai_insights
  add constraint ai_insights_entity_type_check
  check (
    entity_type in (
      'account',
      'property',
      'tenant',
      'work_order',
      'payment',
      'portfolio',
      'maintenance_request'
    )
  );

alter table public.ai_prompt_runs
  drop constraint if exists ai_prompt_runs_entity_type_check;

alter table public.ai_prompt_runs
  add constraint ai_prompt_runs_entity_type_check
  check (
    entity_type in (
      'account',
      'property',
      'tenant',
      'work_order',
      'payment',
      'portfolio',
      'maintenance_request'
    )
  );
