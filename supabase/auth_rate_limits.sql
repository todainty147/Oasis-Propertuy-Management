-- =============================================================================
-- Authentication Rate Limiting
-- =============================================================================
-- Thin client-callable (anon role) wrapper around the existing
-- api_rate_limit_events infrastructure, scoped strictly to auth surfaces.
--
-- Why a separate function: record_api_rate_limit_attempt is service_role-only
-- (called from Edge Functions). Auth flows happen before login so they need an
-- anon-accessible variant. This function validates the surface is an auth
-- surface and enforces hard-coded per-surface limits to prevent abuse.
--
-- Surfaces and limits:
--   auth_login   — 5 attempts per 15 minutes
--   auth_reset   — 3 attempts per 60 minutes
--   auth_signup  — 10 attempts per 60 minutes
--   auth_invite  — 5 attempts per 30 minutes
-- =============================================================================

create or replace function public.record_auth_rate_limit_attempt(
  p_email_hash text,
  p_surface    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_hash     text    := nullif(trim(coalesce(p_email_hash, '')), '');
  v_surface        text    := nullif(trim(lower(coalesce(p_surface, ''))), '');
  v_window_seconds integer;
  v_max_attempts   integer;
  v_attempt_count  integer;
  v_allowed        boolean;
  v_retry_after    integer := 0;
begin
  -- Only permit known auth surfaces
  case v_surface
    when 'auth_login'  then v_window_seconds := 900;  v_max_attempts := 5;
    when 'auth_reset'  then v_window_seconds := 3600; v_max_attempts := 3;
    when 'auth_signup' then v_window_seconds := 3600; v_max_attempts := 10;
    when 'auth_invite' then v_window_seconds := 1800; v_max_attempts := 5;
    else
      raise exception 'Unknown auth surface: %', coalesce(p_surface, '(null)')
        using errcode = '22023';
  end case;

  if v_email_hash is null then
    raise exception 'email_hash is required'
      using errcode = '22023';
  end if;

  -- Advisory lock to prevent double-counting under concurrent requests
  perform pg_advisory_xact_lock(
    hashtext(v_surface),
    hashtext(v_email_hash)
  );

  -- Count recent attempts for this surface + identifier
  select count(*)::integer + 1
    into v_attempt_count
  from public.api_rate_limit_events e
  where e.surface          = v_surface
    and e.identifier_hash  = v_email_hash
    and e.actor_user_id    is null
    and e.account_id       is null
    and e.created_at       >= now() - make_interval(secs => v_window_seconds);

  v_allowed := v_attempt_count <= v_max_attempts;

  -- Compute retry-after when denied
  if not v_allowed then
    select greatest(
      1,
      ceil(
        extract(epoch from
          (min(e.created_at) + make_interval(secs => v_window_seconds) - now())
        )
      )::integer
    )
      into v_retry_after
    from public.api_rate_limit_events e
    where e.surface         = v_surface
      and e.identifier_hash = v_email_hash
      and e.actor_user_id   is null
      and e.account_id      is null
      and e.created_at      >= now() - make_interval(secs => v_window_seconds);
  end if;

  -- Record the attempt
  insert into public.api_rate_limit_events (
    surface, identifier_hash,
    window_seconds, max_attempts,
    attempt_count, allowed,
    metadata
  )
  values (
    v_surface, v_email_hash,
    v_window_seconds, v_max_attempts,
    v_attempt_count, v_allowed,
    jsonb_build_object('via', 'auth_rate_limit')
  );

  -- Log denied attempts to the security observability stream
  if not v_allowed then
    insert into public.security_observability_events (
      category, kind, surface, reason, outcome, code, guard_denied,
      source, metadata
    )
    values (
      'api_rate_limit',
      'authorization_denied',
      v_surface,
      'rate_limit_exceeded',
      'denied',
      '429',
      true,
      'auth_client',
      jsonb_build_object(
        'window_seconds',    v_window_seconds,
        'max_attempts',      v_max_attempts,
        'attempt_count',     v_attempt_count,
        'retry_after_seconds', v_retry_after
      )
    );
  end if;

  return jsonb_build_object(
    'allowed',              v_allowed,
    'surface',              v_surface,
    'attempt_count',        v_attempt_count,
    'max_attempts',         v_max_attempts,
    'window_seconds',       v_window_seconds,
    'retry_after_seconds',  v_retry_after
  );
end;
$$;

-- Grant to anon so pre-auth flows (login, reset, signup) can call it
grant execute on function public.record_auth_rate_limit_attempt(text, text) to anon;
grant execute on function public.record_auth_rate_limit_attempt(text, text) to authenticated;
