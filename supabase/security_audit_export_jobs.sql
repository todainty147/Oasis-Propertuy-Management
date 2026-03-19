create table if not exists public.security_audit_export_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  requested_label text null,
  export_kind text not null default 'security_audit_csv',
  format text not null default 'csv',
  status text not null default 'queued',
  filter_criteria jsonb not null default '{}'::jsonb,
  artifact_bucket text null,
  artifact_path text null,
  row_count integer null,
  file_size_bytes bigint null,
  error_summary text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  expires_at timestamptz null,
  constraint security_audit_export_jobs_kind_check
    check (lower(export_kind) in ('security_audit_csv')),
  constraint security_audit_export_jobs_format_check
    check (lower(format) in ('csv')),
  constraint security_audit_export_jobs_status_check
    check (lower(status) in ('queued', 'running', 'completed', 'failed', 'expired'))
);

comment on table public.security_audit_export_jobs is
  'Durable backend export jobs for large or long-retention security audit exports.';

alter table public.security_audit_export_jobs
  add column if not exists requested_label text null;

comment on column public.security_audit_export_jobs.filter_criteria is
  'Normalized filter payload used to generate the export artifact.';

comment on column public.security_audit_export_jobs.requested_label is
  'Optional human-friendly label chosen by the requester for display and artifact naming.';

create index if not exists security_audit_export_jobs_account_created_idx
  on public.security_audit_export_jobs(account_id, created_at desc);

create index if not exists security_audit_export_jobs_account_status_idx
  on public.security_audit_export_jobs(account_id, status, created_at desc);

create index if not exists security_audit_export_jobs_requester_idx
  on public.security_audit_export_jobs(requested_by_user_id, created_at desc);

alter table public.security_audit_export_jobs enable row level security;

drop policy if exists "security_audit_export_jobs_select_managers" on public.security_audit_export_jobs;
create policy "security_audit_export_jobs_select_managers"
on public.security_audit_export_jobs
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists "security_audit_export_jobs_insert_managers" on public.security_audit_export_jobs;
create policy "security_audit_export_jobs_insert_managers"
on public.security_audit_export_jobs
for insert
to authenticated
with check (
  public.user_can_manage_account(account_id)
  and requested_by_user_id = auth.uid()
);

grant select, insert on table public.security_audit_export_jobs to authenticated;

insert into storage.buckets (id, name, public)
values ('security-audit-exports', 'security-audit-exports', false)
on conflict (id) do nothing;

drop policy if exists "security_audit_exports_select_managers" on storage.objects;
create policy "security_audit_exports_select_managers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'security-audit-exports'
  and split_part(name, '/', 1) = 'account'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'security_audit_exports'
  and public.user_can_manage_account(split_part(name, '/', 2)::uuid)
);

create or replace function public.request_security_audit_export(
  p_account_id uuid,
  p_filter_criteria jsonb default '{}'::jsonb,
  p_format text default 'csv',
  p_retention_days integer default 14,
  p_requested_label text default null
)
returns public.security_audit_export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_format text := lower(trim(coalesce(p_format, 'csv')));
  v_retention_days integer := greatest(1, least(coalesce(p_retention_days, 14), 30));
  v_filter_criteria jsonb := coalesce(p_filter_criteria, '{}'::jsonb);
  v_requested_label text := nullif(left(trim(coalesce(p_requested_label, '')), 80), '');
  v_job public.security_audit_export_jobs;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if v_format <> 'csv' then
    raise exception 'Unsupported export format';
  end if;

  insert into public.security_audit_export_jobs (
    account_id,
    requested_by_user_id,
    requested_label,
    export_kind,
    format,
    status,
    filter_criteria,
    expires_at
  )
  values (
    v_account_id,
    auth.uid(),
    v_requested_label,
    'security_audit_csv',
    v_format,
    'queued',
    v_filter_criteria,
    now() + make_interval(days => v_retention_days)
  )
  returning * into v_job;

  return v_job;
end;
$$;

comment on function public.request_security_audit_export(uuid, jsonb, text, integer, text) is
  'Queues a durable backend security audit export job for the active account scope.';

revoke all on function public.request_security_audit_export(uuid, jsonb, text, integer, text) from public;
grant execute on function public.request_security_audit_export(uuid, jsonb, text, integer, text) to authenticated;
grant execute on function public.request_security_audit_export(uuid, jsonb, text, integer, text) to service_role;
