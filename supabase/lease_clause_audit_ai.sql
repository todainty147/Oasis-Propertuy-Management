-- =============================================================================
-- Lease Clause Audit AI — SQL helpers
-- =============================================================================
-- get_lease_extraction   : finds the best completed text extraction for a
--                          lease's associated documents (by tenant_id or
--                          property_id), ordered by content length.
-- bulk_create_lease_audit_findings : inserts AI-generated findings in bulk
--                          without N round-trips from the edge function.
-- =============================================================================

-- ── get_lease_extraction ──────────────────────────────────────────────────────

create or replace function public.get_lease_extraction(
  p_account_id uuid,
  p_lease_id   uuid
)
returns table (
  document_id     uuid,
  document_name   text,
  text_content    text,
  character_count integer,
  extractor       text,
  completed_at    timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    d.id            as document_id,
    d.name          as document_name,
    de.text_content,
    de.character_count,
    de.extractor,
    de.completed_at
  from public.leases l
  join public.documents d on (
        d.account_id = l.account_id
    and (d.tenant_id = l.tenant_id or d.property_id = l.property_id)
  )
  join public.document_extractions de on (
        de.document_id  = d.id
    and de.account_id   = d.account_id
    and de.status       = 'completed'
    and de.text_content is not null
    and coalesce(de.character_count, 0) > 100
  )
  where l.id         = p_lease_id
    and l.account_id = public.assert_manage_account_access(p_account_id)
  order by de.character_count desc nulls last, de.completed_at desc nulls last
  limit 1;
$$;

comment on function public.get_lease_extraction(uuid, uuid) is
  'Returns the richest completed text extraction for documents linked to a '
  'lease (via tenant_id or property_id). Used by the AI lease clause auditor. '
  'Requires manage access to the account.';

revoke all on function public.get_lease_extraction(uuid, uuid) from public;
grant execute on function public.get_lease_extraction(uuid, uuid) to authenticated;
grant execute on function public.get_lease_extraction(uuid, uuid) to service_role;

-- ── bulk_create_lease_audit_findings ─────────────────────────────────────────

create or replace function public.bulk_create_lease_audit_findings(
  p_account_id     uuid,
  p_lease_audit_id uuid,
  p_findings       jsonb
)
returns setof public.lease_audit_findings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_finding    jsonb;
  v_row        public.lease_audit_findings;
  v_risk       text;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  if not exists (
    select 1 from public.lease_audits
    where id = p_lease_audit_id and account_id = v_account_id
  ) then
    raise exception 'Lease audit not found or does not belong to this account';
  end if;

  if jsonb_typeof(p_findings) <> 'array' then
    raise exception 'p_findings must be a JSON array';
  end if;

  for v_finding in select * from jsonb_array_elements(p_findings) loop
    v_risk := lower(trim(coalesce(v_finding->>'risk_level', 'medium')));
    if v_risk not in ('low', 'medium', 'high', 'critical') then
      v_risk := 'medium';
    end if;

    insert into public.lease_audit_findings (
      account_id, lease_audit_id,
      clause_ref, clause_text, risk_level, category, explanation
    ) values (
      v_account_id,
      p_lease_audit_id,
      nullif(trim(coalesce(v_finding->>'clause_ref', '')), ''),
      nullif(trim(coalesce(v_finding->>'clause_text', '')), ''),
      v_risk,
      nullif(trim(coalesce(v_finding->>'category', '')), ''),
      nullif(trim(coalesce(v_finding->>'explanation', '')), '')
    )
    returning * into v_row;

    return next v_row;
  end loop;
end;
$$;

comment on function public.bulk_create_lease_audit_findings(uuid, uuid, jsonb) is
  'Inserts AI-generated lease audit findings in bulk. Validates account access '
  'and feature entitlement. p_findings must be a JSON array of objects with '
  'keys: clause_ref, clause_text, risk_level, category, explanation.';

revoke all on function public.bulk_create_lease_audit_findings(uuid, uuid, jsonb) from public;
grant execute on function public.bulk_create_lease_audit_findings(uuid, uuid, jsonb) to authenticated;
grant execute on function public.bulk_create_lease_audit_findings(uuid, uuid, jsonb) to service_role;
