-- =============================================================================
-- Atomic AI usage meter increment RPC
-- =============================================================================
-- Replaces the read-modify-write pattern in each Edge Function with a single
-- atomic SQL INSERT ... ON CONFLICT DO UPDATE that adds to existing counters
-- rather than reading them first.
--
-- The previous pattern was:
--   SELECT prompt_runs FROM ai_usage_meter
--   next = current + 1
--   UPSERT prompt_runs = next   ← absolute write; two concurrent calls both
--                                  read the same value and both write the same
--                                  incremented value (under-counts by N-1).
--
-- This RPC uses:
--   INSERT ... ON CONFLICT DO UPDATE SET prompt_runs = prompt_runs + excluded.prompt_runs
-- which is atomic under the unique index on (account_id, feature_key, period_key).
-- =============================================================================

create or replace function public.increment_ai_usage_meter(
  p_account_id    uuid,
  p_feature_key   text,
  p_period_key    text,
  p_prompt_runs   integer default 0,
  p_input_tokens  bigint  default 0,
  p_output_tokens bigint  default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage_meter (
    account_id,
    feature_key,
    period_key,
    prompt_runs,
    input_tokens,
    output_tokens,
    estimated_cost
  )
  values (
    p_account_id,
    p_feature_key,
    p_period_key,
    p_prompt_runs,
    p_input_tokens,
    p_output_tokens,
    round(
      (p_input_tokens::numeric  / 1000000) * 0.4 +
      (p_output_tokens::numeric / 1000000) * 1.6,
      6
    )
  )
  on conflict (account_id, feature_key, period_key) do update
    set
      prompt_runs    = ai_usage_meter.prompt_runs    + excluded.prompt_runs,
      input_tokens   = ai_usage_meter.input_tokens   + excluded.input_tokens,
      output_tokens  = ai_usage_meter.output_tokens  + excluded.output_tokens,
      estimated_cost = round(
        ((ai_usage_meter.input_tokens  + excluded.input_tokens)::numeric  / 1000000) * 0.4 +
        ((ai_usage_meter.output_tokens + excluded.output_tokens)::numeric / 1000000) * 1.6,
        6
      );
$$;

comment on function public.increment_ai_usage_meter(uuid, text, text, integer, bigint, bigint) is
  'Atomically adds to ai_usage_meter counters using ON CONFLICT DO UPDATE += excluded. '
  'Called by Edge Functions before the AI model call (prompt_runs=1, tokens=0) to '
  'pre-reserve the quota slot, then again after the call (prompt_runs=0, actual tokens) '
  'to record token usage. Both calls are atomic; there is no read-modify-write race.';

-- Service_role only: Edge Functions authenticate as service_role.
-- Authenticated clients (browser) must never call this directly.
revoke all on function public.increment_ai_usage_meter(uuid, text, text, integer, bigint, bigint) from public;
revoke all on function public.increment_ai_usage_meter(uuid, text, text, integer, bigint, bigint) from authenticated;
grant execute on function public.increment_ai_usage_meter(uuid, text, text, integer, bigint, bigint) to service_role;
