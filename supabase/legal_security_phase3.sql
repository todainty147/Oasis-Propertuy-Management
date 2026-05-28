-- Phase 3: Legal Security + Operational Loss Prevention.
-- Additive tables/RPCs only. No government/legal submission and no AI/OCR dependency.

create extension if not exists pgcrypto;

create or replace function public.phase3_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Compliance Safe ────────────────────────────────────────────────────────

create table if not exists public.compliance_templates (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  jurisdiction text not null,
  template_key text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(country_code, jurisdiction, template_key)
);

create table if not exists public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.compliance_templates(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text,
  requirement_type text not null default 'document',
  default_due_offset_days integer default 0,
  expiry_tracking boolean not null default false,
  acknowledgement_required boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(template_id, requirement_key)
);

create table if not exists public.tenancy_compliance_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  tenancy_id uuid references public.leases(id) on delete set null,
  requirement_id uuid references public.compliance_requirements(id),
  status text not null default 'missing',
  due_date date,
  completed_at timestamptz,
  expires_at date,
  evidence_document_id uuid,
  acknowledged_by_tenant_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenancy_compliance_items_status_check check (
    status in ('missing', 'logged', 'acknowledged', 'expiring_soon', 'expired', 'needs_review', 'not_applicable')
  )
);

create table if not exists public.compliance_evidence_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  compliance_item_id uuid references public.tenancy_compliance_items(id) on delete cascade,
  user_id uuid default auth.uid(),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenancy_compliance_items_account_status
  on public.tenancy_compliance_items(account_id, status);
create index if not exists idx_tenancy_compliance_items_property_tenant
  on public.tenancy_compliance_items(account_id, property_id, tenant_id);
create index if not exists idx_compliance_evidence_events_account_created
  on public.compliance_evidence_events(account_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenancy_compliance_items_tenancy_id_fkey'
      and conrelid = 'public.tenancy_compliance_items'::regclass
  ) then
    alter table public.tenancy_compliance_items
      add constraint tenancy_compliance_items_tenancy_id_fkey
      foreign key (tenancy_id) references public.leases(id) on delete set null not valid;
  end if;
end;
$$;

drop trigger if exists trg_tenancy_compliance_items_updated_at on public.tenancy_compliance_items;
create trigger trg_tenancy_compliance_items_updated_at
  before update on public.tenancy_compliance_items
  for each row execute function public.phase3_set_updated_at();

-- ── Photo Evidence Vault ───────────────────────────────────────────────────

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  inspection_type text not null,
  status text not null default 'draft',
  title text not null,
  inspection_date date not null,
  locked_at timestamptz,
  locked_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_reports_type_check check (
    inspection_type in ('check_in', 'check_out', 'mid_tenancy', 'maintenance_evidence')
  ),
  constraint inspection_reports_status_check check (
    status in ('draft', 'ready_for_signature', 'signed', 'locked', 'archived')
  )
);

create table if not exists public.inspection_rooms (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inspection_report_id uuid references public.inspection_reports(id) on delete cascade,
  room_name text not null,
  sort_order integer default 0
);

create table if not exists public.inspection_evidence_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inspection_room_id uuid references public.inspection_rooms(id) on delete cascade,
  item_label text not null,
  condition_rating text,
  notes text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_evidence_condition_check check (
    condition_rating is null or condition_rating in ('excellent', 'good', 'fair', 'poor', 'damaged', 'needs_review')
  )
);

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  evidence_item_id uuid references public.inspection_evidence_items(id) on delete cascade,
  document_id uuid,
  storage_path text,
  caption text,
  captured_at timestamptz default now(),
  created_by uuid
);

create table if not exists public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inspection_report_id uuid references public.inspection_reports(id) on delete cascade,
  signer_type text not null,
  signer_name text not null,
  signed_at timestamptz default now(),
  signature_data text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_inspection_reports_account_property
  on public.inspection_reports(account_id, property_id, inspection_date desc);
create index if not exists idx_inspection_rooms_report
  on public.inspection_rooms(account_id, inspection_report_id);
create index if not exists idx_inspection_items_room
  on public.inspection_evidence_items(account_id, inspection_room_id);

drop trigger if exists trg_inspection_reports_updated_at on public.inspection_reports;
create trigger trg_inspection_reports_updated_at
  before update on public.inspection_reports
  for each row execute function public.phase3_set_updated_at();

drop trigger if exists trg_inspection_evidence_items_updated_at on public.inspection_evidence_items;
create trigger trg_inspection_evidence_items_updated_at
  before update on public.inspection_evidence_items
  for each row execute function public.phase3_set_updated_at();

create or replace function public.prevent_locked_inspection_item_edits()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select r.status into v_status
  from public.inspection_reports r
  join public.inspection_rooms room on room.inspection_report_id = r.id
  where room.id = coalesce(new.inspection_room_id, old.inspection_room_id);

  if v_status = 'locked' then
    raise exception 'Locked inspection reports cannot be edited';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_locked_inspection_item_edits on public.inspection_evidence_items;
create trigger trg_prevent_locked_inspection_item_edits
  before insert or update or delete on public.inspection_evidence_items
  for each row execute function public.prevent_locked_inspection_item_edits();

drop function if exists public.create_inspection_report_with_rooms(uuid, uuid, uuid, text, text, date, text[]);

create or replace function public.create_inspection_report_with_rooms(
  p_account_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_inspection_type text,
  p_title text,
  p_inspection_date date,
  p_rooms text[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_report public.inspection_reports;
  v_rooms jsonb := '[]'::jsonb;
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized to create inspection reports for this account';
  end if;

  if not exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.account_id = p_account_id
  ) then
    raise exception 'Property is not available for this account';
  end if;

  if p_tenant_id is not null and not exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id
      and t.account_id = p_account_id
      and t.archived_at is null
  ) then
    raise exception 'Tenant is not available for this account';
  end if;

  insert into public.inspection_reports (
    account_id,
    property_id,
    tenant_id,
    inspection_type,
    title,
    inspection_date,
    created_by
  ) values (
    p_account_id,
    p_property_id,
    p_tenant_id,
    coalesce(nullif(p_inspection_type, ''), 'check_in'),
    coalesce(nullif(trim(p_title), ''), 'Inspection report'),
    coalesce(p_inspection_date, current_date),
    auth.uid()
  )
  returning * into v_report;

  insert into public.inspection_rooms(account_id, inspection_report_id, room_name, sort_order)
  select
    p_account_id,
    v_report.id,
    nullif(trim(room_name), ''),
    (ordinality::integer - 1) * 10
  from unnest(coalesce(p_rooms, array[]::text[])) with ordinality as room(room_name, ordinality)
  where nullif(trim(room_name), '') is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'room_name', r.room_name,
        'sort_order', r.sort_order
      )
      order by r.sort_order asc
    ),
    '[]'::jsonb
  )
  into v_rooms
  from public.inspection_rooms r
  where r.account_id = p_account_id
    and r.inspection_report_id = v_report.id;

  return to_jsonb(v_report) || jsonb_build_object('inspection_rooms', v_rooms);
end;
$$;

grant execute on function public.create_inspection_report_with_rooms(uuid, uuid, uuid, text, text, date, text[]) to authenticated;

-- ── Maintenance Diagnostics ────────────────────────────────────────────────

create table if not exists public.maintenance_diagnostic_templates (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null unique,
  title text not null,
  description text,
  emergency_warning text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_diagnostic_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.maintenance_diagnostic_templates(id) on delete cascade,
  step_key text not null,
  question text not null,
  answer_type text not null,
  options jsonb not null default '[]'::jsonb,
  help_text text,
  sort_order integer default 0,
  active boolean not null default true,
  unique(template_id, step_key)
);

create table if not exists public.maintenance_diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  template_id uuid references public.maintenance_diagnostic_templates(id),
  issue_type text not null,
  urgency text not null default 'normal',
  summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.maintenance_diagnostic_answers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  session_id uuid references public.maintenance_diagnostic_sessions(id) on delete cascade,
  step_id uuid references public.maintenance_diagnostic_steps(id),
  answer jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_maintenance_diagnostic_sessions_request
  on public.maintenance_diagnostic_sessions(account_id, maintenance_request_id);

-- ── Tenant Application Links ───────────────────────────────────────────────

create table if not exists public.property_application_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  title text not null,
  status text not null default 'active',
  available_from date,
  monthly_rent numeric(12,2),
  preferences jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint property_application_links_status_check check (
    status in ('draft', 'active', 'paused', 'closed', 'expired')
  )
);

alter table public.rental_applications
  add column if not exists application_link_id uuid references public.property_application_links(id) on delete set null,
  add column if not exists applicant_name text,
  add column if not exists applicant_email text,
  add column if not exists applicant_phone text,
  add column if not exists preferred_move_in_date date,
  add column if not exists occupants_count integer,
  add column if not exists pets_status text,
  add column if not exists smoking_status text,
  add column if not exists estimated_income_band text,
  add column if not exists employment_status text,
  add column if not exists guarantor_available boolean,
  add column if not exists message text,
  add column if not exists consent_accepted boolean not null default false,
  add column if not exists score_reasons jsonb not null default '[]'::jsonb;

alter table public.rental_applications alter column tenant_id drop not null;

do $$
begin
  alter table public.rental_applications drop constraint if exists rental_applications_status_check;
  alter table public.rental_applications
    add constraint rental_applications_status_check check (
      status in ('new', 'screening', 'shortlisted', 'accepted_pending_signing', 'approved', 'rejected', 'converted', 'withdrawn')
    );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.rental_application_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  rental_application_id uuid references public.rental_applications(id) on delete cascade,
  user_id uuid default auth.uid(),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_property_application_links_account_property
  on public.property_application_links(account_id, property_id);
create index if not exists idx_rental_applications_link
  on public.rental_applications(account_id, application_link_id);
create index if not exists idx_rental_application_events_account_created
  on public.rental_application_events(account_id, created_at desc);

create or replace function public.submit_public_rental_application(
  p_public_token text,
  p_payload jsonb
) returns public.rental_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.property_application_links;
  v_app public.rental_applications;
  v_score integer := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_completed integer := 0;
  v_preferred_move_in date;
  v_available_from date;
  v_days integer;
  v_monthly_rent numeric := 0;
  v_income_band text;
  v_estimated_income numeric;
  v_has_pets boolean;
  v_smokes boolean;
begin
  select *
  into v_link
  from public.property_application_links
  where public_token = p_public_token
    and status = 'active'
    and (expires_at is null or expires_at > now());

  if v_link.id is null then
    raise exception 'Application link is not available';
  end if;

  if coalesce((p_payload->>'consent_accepted')::boolean, false) is not true then
    raise exception 'Consent is required';
  end if;

  if nullif(trim(p_payload->>'applicant_name'), '') is not null then v_completed := v_completed + 1; end if;
  if nullif(trim(p_payload->>'applicant_email'), '') is not null then v_completed := v_completed + 1; end if;
  if nullif(trim(p_payload->>'preferred_move_in_date'), '') is not null then v_completed := v_completed + 1; end if;
  if nullif(trim(p_payload->>'occupants_count'), '') is not null then v_completed := v_completed + 1; end if;
  if nullif(trim(p_payload->>'employment_status'), '') is not null then v_completed := v_completed + 1; end if;

  v_score := v_score + round((v_completed::numeric / 5) * 30)::integer;
  v_reasons := v_reasons || jsonb_build_array('Application completeness contributed ' || round((v_completed::numeric / 5) * 30)::integer || ' points.');

  v_preferred_move_in := nullif(p_payload->>'preferred_move_in_date', '')::date;
  v_available_from := coalesce(v_link.available_from, nullif(v_link.preferences->>'availableFrom', '')::date);
  if v_preferred_move_in is not null and v_available_from is not null then
    v_days := abs(v_preferred_move_in - v_available_from);
    if v_days <= 14 then
      v_score := v_score + 20;
      v_reasons := v_reasons || jsonb_build_array('Move-in date is close to the property availability date.');
    end if;
  end if;

  v_monthly_rent := coalesce(v_link.monthly_rent, nullif(v_link.preferences->>'monthlyRent', '')::numeric, 0);
  v_income_band := lower(nullif(trim(p_payload->>'estimated_income_band'), ''));
  v_estimated_income := case v_income_band
    when 'under_20k' then 20000
    when '20k_30k' then 30000
    when '30k_45k' then 45000
    when '45k_60k' then 60000
    when '60k_plus' then 75000
    else null
  end;
  if v_monthly_rent > 0 and v_estimated_income is not null then
    if v_estimated_income >= (v_monthly_rent * 12 * 2.5) then
      v_score := v_score + 20;
      v_reasons := v_reasons || jsonb_build_array('Income band appears to meet the configured rent-to-income estimate.');
    else
      v_reasons := v_reasons || jsonb_build_array('Income band may need review against the rent level.');
    end if;
  end if;

  if coalesce((v_link.preferences->>'guarantorPreferred')::boolean, false)
     and coalesce((p_payload->>'guarantor_available')::boolean, false) then
    v_score := v_score + 10;
    v_reasons := v_reasons || jsonb_build_array('Guarantor is available and this is marked as preferred.');
  end if;

  if v_link.preferences ? 'petsAllowed' and nullif(trim(p_payload->>'pets_status'), '') is not null then
    v_has_pets := lower(p_payload->>'pets_status') = 'has_pets';
    if coalesce((v_link.preferences->>'petsAllowed')::boolean, false) or not v_has_pets then
      v_score := v_score + 10;
      v_reasons := v_reasons || jsonb_build_array('Pets answer matches the configured preference.');
    end if;
  end if;

  if v_link.preferences ? 'smokingAllowed' and nullif(trim(p_payload->>'smoking_status'), '') is not null then
    v_smokes := lower(p_payload->>'smoking_status') = 'smoker';
    if coalesce((v_link.preferences->>'smokingAllowed')::boolean, false) or not v_smokes then
      v_score := v_score + 5;
      v_reasons := v_reasons || jsonb_build_array('Smoking answer matches the configured preference.');
    end if;
  end if;

  if length(trim(coalesce(p_payload->>'message', ''))) >= 40 then
    v_score := v_score + 5;
    v_reasons := v_reasons || jsonb_build_array('Applicant included a useful message.');
  end if;

  v_score := greatest(0, least(100, v_score));

  insert into public.rental_applications (
    account_id, property_id, application_link_id, status,
    applicant_name, applicant_email, applicant_phone,
    preferred_move_in_date, occupants_count, pets_status, smoking_status,
    estimated_income_band, employment_status, guarantor_available,
    message, consent_accepted, score, score_reasons
  ) values (
    v_link.account_id, v_link.property_id, v_link.id, 'new',
    nullif(trim(p_payload->>'applicant_name'), ''),
    nullif(trim(p_payload->>'applicant_email'), ''),
    nullif(trim(p_payload->>'applicant_phone'), ''),
    nullif(p_payload->>'preferred_move_in_date', '')::date,
    nullif(p_payload->>'occupants_count', '')::integer,
    nullif(trim(p_payload->>'pets_status'), ''),
    nullif(trim(p_payload->>'smoking_status'), ''),
    nullif(trim(p_payload->>'estimated_income_band'), ''),
    nullif(trim(p_payload->>'employment_status'), ''),
    coalesce((p_payload->>'guarantor_available')::boolean, false),
    nullif(trim(p_payload->>'message'), ''),
    true,
    v_score,
    v_reasons
  )
  returning * into v_app;

  insert into public.rental_application_events(account_id, rental_application_id, event_type, metadata)
  values (v_app.account_id, v_app.id, 'application.submitted', jsonb_build_object('source', 'public_link'));

  return v_app;
end;
$$;

grant execute on function public.submit_public_rental_application(text, jsonb) to anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.compliance_templates enable row level security;
alter table public.compliance_requirements enable row level security;
alter table public.tenancy_compliance_items enable row level security;
alter table public.compliance_evidence_events enable row level security;
alter table public.inspection_reports enable row level security;
alter table public.inspection_rooms enable row level security;
alter table public.inspection_evidence_items enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.inspection_signatures enable row level security;
alter table public.maintenance_diagnostic_templates enable row level security;
alter table public.maintenance_diagnostic_steps enable row level security;
alter table public.maintenance_diagnostic_sessions enable row level security;
alter table public.maintenance_diagnostic_answers enable row level security;
alter table public.property_application_links enable row level security;
alter table public.rental_application_events enable row level security;

drop policy if exists "Public can read active compliance templates" on public.compliance_templates;
create policy "Public can read active compliance templates" on public.compliance_templates
  for select to authenticated using (active = true);
drop policy if exists "Public can read active compliance requirements" on public.compliance_requirements;
create policy "Public can read active compliance requirements" on public.compliance_requirements
  for select to authenticated using (active = true);

drop policy if exists "Managers manage tenancy compliance items" on public.tenancy_compliance_items;
create policy "Managers manage tenancy compliance items" on public.tenancy_compliance_items
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Tenants read assigned acknowledgement compliance items" on public.tenancy_compliance_items;
create policy "Tenants read assigned acknowledgement compliance items" on public.tenancy_compliance_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.compliance_requirements cr
      where cr.id = tenancy_compliance_items.requirement_id
        and cr.acknowledgement_required = true
    )
    and exists (
      select 1 from public.tenants t
      where t.id = tenancy_compliance_items.tenant_id
        and t.account_id = tenancy_compliance_items.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Managers insert compliance evidence events" on public.compliance_evidence_events;
create policy "Managers insert compliance evidence events" on public.compliance_evidence_events
  for insert to authenticated with check (public.user_can_manage_account(account_id));
drop policy if exists "Managers read compliance evidence events" on public.compliance_evidence_events;
create policy "Managers read compliance evidence events" on public.compliance_evidence_events
  for select to authenticated using (public.user_can_manage_account(account_id));

drop policy if exists "Managers manage inspection reports" on public.inspection_reports;
create policy "Managers manage inspection reports" on public.inspection_reports
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));
drop policy if exists "Tenants read assigned inspection reports" on public.inspection_reports;
create policy "Tenants read assigned inspection reports" on public.inspection_reports
  for select to authenticated using (
    exists (
      select 1 from public.tenants t
      where t.id = inspection_reports.tenant_id
        and t.account_id = inspection_reports.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );
drop policy if exists "Managers manage inspection rooms" on public.inspection_rooms;
create policy "Managers manage inspection rooms" on public.inspection_rooms
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));
drop policy if exists "Managers manage inspection evidence items" on public.inspection_evidence_items;
create policy "Managers manage inspection evidence items" on public.inspection_evidence_items
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));
drop policy if exists "Managers manage inspection photos" on public.inspection_photos;
create policy "Managers manage inspection photos" on public.inspection_photos
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));
drop policy if exists "Managers manage inspection signatures" on public.inspection_signatures;
create policy "Managers manage inspection signatures" on public.inspection_signatures
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));
drop policy if exists "Tenants read assigned inspection signatures" on public.inspection_signatures;
create policy "Tenants read assigned inspection signatures" on public.inspection_signatures
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_reports ir
      join public.tenants t on t.id = ir.tenant_id and t.account_id = ir.account_id
      where ir.id = inspection_signatures.inspection_report_id
        and ir.account_id = inspection_signatures.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );
drop policy if exists "Tenants sign assigned inspection reports" on public.inspection_signatures;
create policy "Tenants sign assigned inspection reports" on public.inspection_signatures
  for insert to authenticated with check (
    signer_type = 'tenant'
    and exists (
      select 1
      from public.inspection_reports ir
      join public.tenants t on t.id = ir.tenant_id and t.account_id = ir.account_id
      where ir.id = inspection_signatures.inspection_report_id
        and ir.account_id = inspection_signatures.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
        and ir.status in ('ready_for_signature', 'signed')
    )
  );

drop policy if exists "Authenticated read maintenance diagnostic templates" on public.maintenance_diagnostic_templates;
create policy "Authenticated read maintenance diagnostic templates" on public.maintenance_diagnostic_templates
  for select to authenticated using (active = true);
drop policy if exists "Authenticated read maintenance diagnostic steps" on public.maintenance_diagnostic_steps;
create policy "Authenticated read maintenance diagnostic steps" on public.maintenance_diagnostic_steps
  for select to authenticated using (active = true);
drop policy if exists "Members create diagnostic sessions" on public.maintenance_diagnostic_sessions;
create policy "Members create diagnostic sessions" on public.maintenance_diagnostic_sessions
  for insert to authenticated with check (public.is_account_member(account_id));
drop policy if exists "Managers and members read diagnostic sessions" on public.maintenance_diagnostic_sessions;
create policy "Managers and members read diagnostic sessions" on public.maintenance_diagnostic_sessions
  for select to authenticated using (public.is_account_member(account_id));
drop policy if exists "Members update diagnostic sessions" on public.maintenance_diagnostic_sessions;
create policy "Members update diagnostic sessions" on public.maintenance_diagnostic_sessions
  for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
drop policy if exists "Members create diagnostic answers" on public.maintenance_diagnostic_answers;
create policy "Members create diagnostic answers" on public.maintenance_diagnostic_answers
  for insert to authenticated with check (public.is_account_member(account_id));
drop policy if exists "Members read diagnostic answers" on public.maintenance_diagnostic_answers;
create policy "Members read diagnostic answers" on public.maintenance_diagnostic_answers
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "Managers manage property application links" on public.property_application_links;
create policy "Managers manage property application links" on public.property_application_links
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));
drop policy if exists "Managers manage rental application events" on public.rental_application_events;
create policy "Managers manage rental application events" on public.rental_application_events
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

grant select on public.compliance_templates, public.compliance_requirements to authenticated;
grant select, insert, update, delete on public.tenancy_compliance_items to authenticated;
grant select, insert on public.compliance_evidence_events to authenticated;
grant select, insert, update, delete on public.inspection_reports, public.inspection_rooms, public.inspection_evidence_items, public.inspection_photos, public.inspection_signatures to authenticated;
grant select on public.maintenance_diagnostic_templates, public.maintenance_diagnostic_steps to authenticated;
grant select, insert, update on public.maintenance_diagnostic_sessions to authenticated;
grant select, insert on public.maintenance_diagnostic_answers to authenticated;
grant select, insert, update, delete on public.property_application_links to authenticated;
grant select, insert on public.rental_application_events to authenticated;

-- Seeds
insert into public.compliance_templates(country_code, jurisdiction, template_key, name, description)
values
  ('GB', 'england', 'uk_england_tenancy_security', 'UK/England tenancy security checklist', 'Track statutory tenancy documents, safety certificates, deposit evidence and onboarding acknowledgements.'),
  ('PL', 'poland', 'pl_najem_okazjonalny', 'Poland Najem Okazjonalny checklist', 'Track Najem Okazjonalny evidence and tenancy security documents.')
on conflict(country_code, jurisdiction, template_key) do update
set name = excluded.name, description = excluded.description, active = true;

insert into public.compliance_requirements(template_id, requirement_key, label, description, requirement_type, expiry_tracking, acknowledgement_required, sort_order)
select t.id, r.key, r.label, r.description, r.type, r.expiry, r.ack, r.sort_order
from public.compliance_templates t
join (
  values
    ('GB','england','uk_england_tenancy_security','right_to_rent_check','Right to rent check','Document recorded for review.','document',false,false,10),
    ('GB','england','uk_england_tenancy_security','gas_safety_certificate','Gas safety certificate','Safety certificate evidence.','certificate',true,false,20),
    ('GB','england','uk_england_tenancy_security','epc','EPC','Energy performance certificate evidence.','certificate',true,false,30),
    ('GB','england','uk_england_tenancy_security','eicr','EICR','Electrical installation condition report evidence.','certificate',true,false,40),
    ('GB','england','uk_england_tenancy_security','deposit_protection_certificate','Deposit protection certificate','Deposit evidence logged.','document',false,false,50),
    ('GB','england','uk_england_tenancy_security','deposit_prescribed_information','Deposit prescribed information','Prescribed information evidence.','document',false,true,60),
    ('GB','england','uk_england_tenancy_security','tenancy_agreement','Tenancy agreement','Signed agreement recorded.','document',false,true,70),
    ('GB','england','uk_england_tenancy_security','inventory_check_in_report','Inventory check-in report','Check-in condition evidence.','document',false,true,80),
    ('GB','england','uk_england_tenancy_security','smoke_co_alarm_confirmation','Smoke/CO alarm confirmation','Alarm confirmation recorded.','document',false,true,90),
    ('GB','england','uk_england_tenancy_security','tenant_onboarding_acknowledgement','Tenant onboarding acknowledgement','Tenant acknowledgement recorded.','acknowledgement',false,true,100),
    ('GB','england','uk_england_tenancy_security','local_licence_or_hmo_licence_optional','Local licence or HMO licence optional','Licence evidence if relevant.','document',true,false,110),
    ('PL','poland','pl_najem_okazjonalny','umowa_najmu_okazjonalnego','Umowa najmu okazjonalnego','Document recorded for review.','document',false,true,10),
    ('PL','poland','pl_najem_okazjonalny','akt_notarialny','Akt notarialny','Notarial statement evidence.','document',false,false,20),
    ('PL','poland','pl_najem_okazjonalny','alternative_address_declaration','Alternative address declaration','Alternative address evidence.','document',false,false,30),
    ('PL','poland','pl_najem_okazjonalny','owner_consent_for_alternative_address','Owner consent for alternative address','Consent evidence recorded.','document',false,false,40),
    ('PL','poland','pl_najem_okazjonalny','tax_office_notification_evidence','Tax office notification evidence','Notification evidence recorded.','document',false,false,50),
    ('PL','poland','pl_najem_okazjonalny','tenant_identity_evidence','Tenant identity evidence','Identity evidence recorded.','document',false,false,60),
    ('PL','poland','pl_najem_okazjonalny','protocol_zdawczo_odbiorczy','Protokol zdawczo-odbiorczy','Check-in handover evidence.','document',false,true,70),
    ('PL','poland','pl_najem_okazjonalny','kaucja_record','Kaucja record','Deposit record evidence.','document',false,false,80)
) as r(country, jurisdiction, template_key, key, label, description, type, expiry, ack, sort_order)
  on t.country_code = r.country and t.jurisdiction = r.jurisdiction and t.template_key = r.template_key
on conflict(template_id, requirement_key) do update
set label = excluded.label,
    description = excluded.description,
    requirement_type = excluded.requirement_type,
    expiry_tracking = excluded.expiry_tracking,
    acknowledgement_required = excluded.acknowledgement_required,
    sort_order = excluded.sort_order,
    active = true;

insert into public.maintenance_diagnostic_templates(issue_type, title, description, emergency_warning)
values
  ('boiler_heating', 'Boiler / heating', 'Basic information gathering before a heating repair is submitted.', 'If there is a gas smell, burning smell, active leak, or immediate danger, contact emergency services or the relevant emergency provider.'),
  ('no_hot_water', 'No hot water', 'Collect key context for hot-water issues.', 'If there is immediate danger, contact emergency services or the relevant emergency provider.'),
  ('damp_mould', 'Damp / mould', 'Collect location, spread, and visible evidence.', null),
  ('electrical_issue', 'Electrical issue', 'Collect basic electrical issue context.', 'If there is electrical danger, fire, sparks, or burning smell, contact emergency services.'),
  ('blocked_drain', 'Blocked drain', 'Collect basic blockage information.', null),
  ('leak', 'Leak', 'Collect location and severity information.', 'If there is flooding or immediate risk, contact emergency services or the relevant emergency provider.'),
  ('appliance_issue', 'Appliance issue', 'Collect appliance fault context.', null),
  ('pest_issue', 'Pest issue', 'Collect pest issue context.', null),
  ('lost_keys_security', 'Lost keys / security', 'Collect access and security context.', 'If there is immediate security risk, contact emergency services.'),
  ('other', 'Other issue', 'General maintenance issue intake.', null)
on conflict(issue_type) do update
set title = excluded.title, description = excluded.description, emergency_warning = excluded.emergency_warning, active = true;

insert into public.maintenance_diagnostic_steps(template_id, step_key, question, answer_type, options, help_text, sort_order)
select t.id, s.step_key, s.question, s.answer_type, s.options::jsonb, s.help_text, s.sort_order
from public.maintenance_diagnostic_templates t
join (
  values
    ('boiler_heating','immediate_danger','Is there a smell of gas, active leak, burning smell, or immediate danger?','boolean','[]','Do not attempt repairs you are not qualified to perform.',10),
    ('boiler_heating','error_code','Is there an error code on the boiler display?','text','[]',null,20),
    ('boiler_heating','display_photo','Can you upload a photo of the boiler display?','photo','[]',null,30),
    ('boiler_heating','pressure_gauge','Is the pressure gauge outside the normal range shown in your boiler manual?','single_choice','["yes","no","not_sure"]',null,40),
    ('boiler_heating','thermostat_timer','Have you checked thermostat/timer settings?','single_choice','["yes","no","not_sure"]',null,50),
    ('boiler_heating','meter_checked','Have you checked the utility/prepayment meter?','single_choice','["yes","no","not_sure"]',null,60),
    ('boiler_heating','affected_area','Is heating affected in all rooms or one room only?','single_choice','["all_rooms","one_room","not_sure"]',null,70),
    ('no_hot_water','immediate_danger','Is there a smell of gas, active leak, burning smell, or immediate danger?','boolean','[]','If there is immediate danger, stop and contact the relevant emergency provider.',10),
    ('no_hot_water','affected_taps','Is hot water missing from all taps or only one tap?','single_choice','["all_taps","one_tap","not_sure"]',null,20),
    ('no_hot_water','boiler_display','Is there an error code or warning light on the boiler display?','text','[]',null,30),
    ('damp_mould','location','Where is the damp or mould visible?','text','[]',null,10),
    ('damp_mould','active_leak','Is there an active leak, flooding, or water entering the property now?','boolean','[]','Active leaks should be reported urgently.',20),
    ('damp_mould','photos','Can you upload photos of the affected area?','photo','[]',null,30),
    ('electrical_issue','immediate_danger','Is there sparking, smoke, burning smell, exposed wiring, or loss of power creating immediate risk?','boolean','[]','Do not touch exposed wiring or unsafe fittings.',10),
    ('electrical_issue','affected_area','Is the issue affecting the whole property or one area?','single_choice','["whole_property","one_area","single_fitting","not_sure"]',null,20),
    ('electrical_issue','breaker_checked','Have you checked whether a breaker has tripped, if safe to do so?','single_choice','["yes","no","not_safe","not_sure"]',null,30),
    ('blocked_drain','overflowing','Is water overflowing or backing up inside the property?','boolean','[]','Overflowing water may need urgent review.',10),
    ('blocked_drain','affected_fixture','Which fixture is blocked?','single_choice','["sink","toilet","bath_shower","external_drain","multiple","not_sure"]',null,20),
    ('blocked_drain','photo','Can you upload a photo of the affected fixture or drain?','photo','[]',null,30),
    ('leak','active_leak','Is water actively leaking now?','boolean','[]','If flooding is severe, contact emergency support.',10),
    ('leak','source_known','Do you know where the leak appears to be coming from?','text','[]',null,20),
    ('leak','water_isolated','Have you isolated the water supply if safe and practical?','single_choice','["yes","no","not_safe","not_sure"]',null,30),
    ('appliance_issue','appliance','Which appliance has the issue?','text','[]',null,10),
    ('appliance_issue','error_code','Is there an error code or warning light?','text','[]',null,20),
    ('appliance_issue','photo','Can you upload a photo of the appliance and any display?','photo','[]',null,30),
    ('pest_issue','pest_type','What type of pest or evidence have you seen?','text','[]',null,10),
    ('pest_issue','location','Where have you seen the issue?','text','[]',null,20),
    ('pest_issue','photos','Can you upload photos of evidence if available?','photo','[]',null,30),
    ('lost_keys_security','security_risk','Is there an immediate security risk or suspected break-in?','boolean','[]','If there is immediate risk, contact emergency services.',10),
    ('lost_keys_security','access_available','Can you currently access the property safely?','single_choice','["yes","no","not_sure"]',null,20),
    ('lost_keys_security','keys_missing','Which keys, fobs, or access devices are missing?','text','[]',null,30),
    ('other','issue_summary','Briefly describe the issue.','text','[]',null,10),
    ('other','urgency','How urgent does this feel?','single_choice','["normal","soon","urgent","emergency"]','Use emergency only for immediate risk to safety or serious property damage.',20),
    ('other','photos','Can you upload a photo if it helps explain the issue?','photo','[]',null,30)
) as s(issue_type, step_key, question, answer_type, options, help_text, sort_order)
  on t.issue_type = s.issue_type
on conflict(template_id, step_key) do update
set question = excluded.question, answer_type = excluded.answer_type, options = excluded.options, help_text = excluded.help_text, sort_order = excluded.sort_order, active = true;
