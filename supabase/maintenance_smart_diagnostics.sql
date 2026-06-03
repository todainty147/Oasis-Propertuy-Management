-- Phase 4C: Maintenance Inbox Smart Diagnostics.
-- Additive overlay on top of the lighter Phase 3 diagnostic tables.
-- Diagnostics are information gathering for landlord review and are not a substitute for professional advice.

insert into public.account_feature_flags(account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (
  values
    ('maintenance_smart_diagnostics'),
    ('tenant_maintenance_diagnostics'),
    ('maintenance_deposit_evidence_linking'),
    ('maintenance_eco_upgrade_linking')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;

alter table public.maintenance_diagnostic_templates
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.maintenance_diagnostic_steps
  add column if not exists triggers_emergency boolean not null default false,
  add column if not exists triggers_deposit_flag boolean not null default false,
  add column if not exists triggers_eco_upgrade_flag boolean not null default false,
  add column if not exists triggers_compliance_flag boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.maintenance_diagnostic_steps
set answer_type = 'yes_no'
where answer_type = 'boolean';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_diagnostic_steps_answer_type_check'
      and conrelid = 'public.maintenance_diagnostic_steps'::regclass
  ) then
    alter table public.maintenance_diagnostic_steps
      add constraint maintenance_diagnostic_steps_answer_type_check
      check (answer_type in ('yes_no', 'single_choice', 'multi_choice', 'text', 'number', 'photo', 'info'));
  end if;
end $$;

alter table public.maintenance_diagnostic_sessions
  add column if not exists outcome_category text not null default 'landlord_review',
  add column if not exists recommended_next_step text,
  add column if not exists emergency_flag boolean not null default false,
  add column if not exists deposit_relevant boolean not null default false,
  add column if not exists eco_upgrade_relevant boolean not null default false,
  add column if not exists compliance_relevant boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_diagnostic_sessions_urgency_check'
      and conrelid = 'public.maintenance_diagnostic_sessions'::regclass
  ) then
    alter table public.maintenance_diagnostic_sessions
      add constraint maintenance_diagnostic_sessions_urgency_check
      check (urgency in ('low', 'normal', 'high', 'urgent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_diagnostic_sessions_outcome_check'
      and conrelid = 'public.maintenance_diagnostic_sessions'::regclass
  ) then
    alter table public.maintenance_diagnostic_sessions
      add constraint maintenance_diagnostic_sessions_outcome_check
      check (outcome_category in (
        'landlord_review',
        'contractor_review',
        'tenant_check_needed',
        'emergency_review',
        'deposit_evidence_possible',
        'eco_upgrade_possible',
        'compliance_review_possible'
      ));
  end if;
end $$;

alter table public.maintenance_diagnostic_answers
  add column if not exists answer_label text;

delete from public.maintenance_diagnostic_answers
where session_id is null;

alter table public.maintenance_diagnostic_answers
  alter column session_id set not null;

create table if not exists public.maintenance_diagnostic_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  session_id uuid not null references public.maintenance_diagnostic_sessions(id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  link_type text not null,
  linked_object_id uuid not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint maintenance_diagnostic_links_type_check check (link_type in (
    'maintenance_request',
    'work_order',
    'deposit_deduction',
    'deposit_settlement',
    'evidence_item',
    'eco_upgrade_plan',
    'eco_upgrade_plan_item',
    'compliance_item',
    'note'
  ))
);

create index if not exists idx_maintenance_diagnostic_links_session
  on public.maintenance_diagnostic_links(account_id, session_id);

create table if not exists public.maintenance_diagnostic_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  session_id uuid references public.maintenance_diagnostic_sessions(id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint maintenance_diagnostic_audit_event_type_check check (event_type in (
    'session_started',
    'session_completed',
    'session_linked',
    'landlord_review_recorded',
    'deposit_evidence_flagged',
    'eco_upgrade_flagged',
    'compliance_review_flagged'
  ))
);

create index if not exists idx_maintenance_diagnostic_audit_events_session
  on public.maintenance_diagnostic_audit_events(account_id, session_id, created_at desc);

create or replace function public.prevent_diagnostic_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Maintenance diagnostic audit events are immutable';
end;
$$;

drop trigger if exists prevent_maintenance_diagnostic_audit_mutation on public.maintenance_diagnostic_audit_events;
create trigger prevent_maintenance_diagnostic_audit_mutation
before update or delete on public.maintenance_diagnostic_audit_events
for each row execute function public.prevent_diagnostic_audit_mutation();

create or replace function public.set_maintenance_diagnostics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_diagnostic_templates_updated_at on public.maintenance_diagnostic_templates;
create trigger set_maintenance_diagnostic_templates_updated_at
before update on public.maintenance_diagnostic_templates
for each row execute function public.set_maintenance_diagnostics_updated_at();

drop trigger if exists set_maintenance_diagnostic_steps_updated_at on public.maintenance_diagnostic_steps;
create trigger set_maintenance_diagnostic_steps_updated_at
before update on public.maintenance_diagnostic_steps
for each row execute function public.set_maintenance_diagnostics_updated_at();

drop trigger if exists set_maintenance_diagnostic_sessions_updated_at on public.maintenance_diagnostic_sessions;
create trigger set_maintenance_diagnostic_sessions_updated_at
before update on public.maintenance_diagnostic_sessions
for each row execute function public.set_maintenance_diagnostics_updated_at();

create or replace function public.enforce_maintenance_diagnostic_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_account uuid;
  v_request_account uuid;
begin
  if tg_table_name in ('maintenance_diagnostic_answers', 'maintenance_diagnostic_links', 'maintenance_diagnostic_audit_events') then
    select s.account_id into v_session_account
    from public.maintenance_diagnostic_sessions s
    where s.id = new.session_id;

    if v_session_account is null then
      raise exception 'Maintenance diagnostic session not found';
    end if;
    if v_session_account is distinct from new.account_id then
      raise exception 'Maintenance diagnostic session account mismatch';
    end if;
  end if;

  if tg_table_name in ('maintenance_diagnostic_links', 'maintenance_diagnostic_audit_events') and new.maintenance_request_id is not null then
    select mr.account_id into v_request_account
    from public.maintenance_requests mr
    where mr.id = new.maintenance_request_id;

    if v_request_account is null then
      raise exception 'Maintenance request not found';
    end if;
    if v_request_account is distinct from new.account_id then
      raise exception 'Maintenance request account mismatch';
    end if;
  end if;

  if tg_table_name = 'maintenance_diagnostic_links' and new.link_type = 'maintenance_request' then
    select mr.account_id into v_request_account
    from public.maintenance_requests mr
    where mr.id = new.linked_object_id;

    if v_request_account is null then
      raise exception 'Linked maintenance request not found';
    end if;
    if v_request_account is distinct from new.account_id then
      raise exception 'Linked maintenance request account mismatch';
    end if;
    if new.maintenance_request_id is not null and new.maintenance_request_id is distinct from new.linked_object_id then
      raise exception 'Diagnostic maintenance request link mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_maintenance_diagnostic_answers_account on public.maintenance_diagnostic_answers;
create trigger enforce_maintenance_diagnostic_answers_account
before insert or update on public.maintenance_diagnostic_answers
for each row execute function public.enforce_maintenance_diagnostic_account();

drop trigger if exists enforce_maintenance_diagnostic_links_account on public.maintenance_diagnostic_links;
create trigger enforce_maintenance_diagnostic_links_account
before insert or update on public.maintenance_diagnostic_links
for each row execute function public.enforce_maintenance_diagnostic_account();

drop trigger if exists enforce_maintenance_diagnostic_audit_account on public.maintenance_diagnostic_audit_events;
create trigger enforce_maintenance_diagnostic_audit_account
before insert or update on public.maintenance_diagnostic_audit_events
for each row execute function public.enforce_maintenance_diagnostic_account();

alter table public.maintenance_diagnostic_links enable row level security;
alter table public.maintenance_diagnostic_audit_events enable row level security;

drop policy if exists "Members create diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Managers and members read diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Members update diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Members create diagnostic answers" on public.maintenance_diagnostic_answers;
drop policy if exists "Members read diagnostic answers" on public.maintenance_diagnostic_answers;
drop policy if exists "Managers and tenants create diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Managers and owning tenants read diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Managers update diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Managers and owning tenants delete unlinked diagnostic sessions" on public.maintenance_diagnostic_sessions;
drop policy if exists "Managers and tenants create diagnostic answers" on public.maintenance_diagnostic_answers;
drop policy if exists "Managers and owning tenants read diagnostic answers" on public.maintenance_diagnostic_answers;
drop policy if exists "Managers manage diagnostic links" on public.maintenance_diagnostic_links;
drop policy if exists "Tenants attach diagnostic request links only" on public.maintenance_diagnostic_links;
drop policy if exists "Managers read diagnostic audit events" on public.maintenance_diagnostic_audit_events;
drop policy if exists "Managers and session owners insert diagnostic audit events" on public.maintenance_diagnostic_audit_events;

create policy "Managers and tenants create diagnostic sessions" on public.maintenance_diagnostic_sessions
for insert to authenticated
with check (
  public.user_can_manage_account(account_id)
  or exists (
    select 1 from public.tenants t
    where t.id = tenant_id
      and t.account_id = maintenance_diagnostic_sessions.account_id
      and t.property_id = maintenance_diagnostic_sessions.property_id
      and t.user_id = auth.uid()
  )
);

create policy "Managers and owning tenants read diagnostic sessions" on public.maintenance_diagnostic_sessions
for select to authenticated
using (
  public.user_can_manage_account(account_id)
  or exists (
    select 1 from public.tenants t
    where t.id = tenant_id
      and t.account_id = maintenance_diagnostic_sessions.account_id
      and t.user_id = auth.uid()
  )
);

create policy "Managers update diagnostic sessions" on public.maintenance_diagnostic_sessions
for update to authenticated
using (public.user_can_manage_account(account_id))
with check (public.user_can_manage_account(account_id));

create policy "Managers and owning tenants delete unlinked diagnostic sessions" on public.maintenance_diagnostic_sessions
for delete to authenticated
using (
  public.user_can_manage_account(account_id)
  or (
    not exists (
      select 1
      from public.maintenance_diagnostic_links l
      where l.session_id = maintenance_diagnostic_sessions.id
    )
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id
        and t.account_id = maintenance_diagnostic_sessions.account_id
        and t.user_id = auth.uid()
    )
  )
);

create policy "Managers and tenants create diagnostic answers" on public.maintenance_diagnostic_answers
for insert to authenticated
with check (
  public.user_can_manage_account(account_id)
  or exists (
    select 1
    from public.maintenance_diagnostic_sessions s
    join public.tenants t on t.id = s.tenant_id
    where s.id = maintenance_diagnostic_answers.session_id
      and s.account_id = maintenance_diagnostic_answers.account_id
      and t.user_id = auth.uid()
  )
);

create policy "Managers and owning tenants read diagnostic answers" on public.maintenance_diagnostic_answers
for select to authenticated
using (
  public.user_can_manage_account(account_id)
  or exists (
    select 1
    from public.maintenance_diagnostic_sessions s
    join public.tenants t on t.id = s.tenant_id
    where s.id = maintenance_diagnostic_answers.session_id
      and s.account_id = maintenance_diagnostic_answers.account_id
      and t.user_id = auth.uid()
  )
);

create policy "Managers manage diagnostic links" on public.maintenance_diagnostic_links
for all to authenticated
using (public.user_can_manage_account(account_id))
with check (public.user_can_manage_account(account_id));

create policy "Tenants attach diagnostic request links only" on public.maintenance_diagnostic_links
for insert to authenticated
with check (
  link_type = 'maintenance_request'
  and exists (
    select 1
    from public.maintenance_diagnostic_sessions s
    join public.tenants t on t.id = s.tenant_id
    where s.id = maintenance_diagnostic_links.session_id
      and s.account_id = maintenance_diagnostic_links.account_id
      and t.user_id = auth.uid()
  )
);

create policy "Managers read diagnostic audit events" on public.maintenance_diagnostic_audit_events
for select to authenticated
using (public.user_can_manage_account(account_id));

create policy "Managers and session owners insert diagnostic audit events" on public.maintenance_diagnostic_audit_events
for insert to authenticated
with check (
  public.user_can_manage_account(account_id)
  or exists (
    select 1
    from public.maintenance_diagnostic_sessions s
    join public.tenants t on t.id = s.tenant_id
    where s.id = maintenance_diagnostic_audit_events.session_id
      and s.account_id = maintenance_diagnostic_audit_events.account_id
      and t.user_id = auth.uid()
  )
);

grant select on public.maintenance_diagnostic_templates, public.maintenance_diagnostic_steps to authenticated;
grant select, insert, update, delete on public.maintenance_diagnostic_sessions to authenticated;
grant select, insert on public.maintenance_diagnostic_answers to authenticated;
grant select, insert on public.maintenance_diagnostic_links to authenticated;
revoke update, delete on public.maintenance_diagnostic_links from authenticated;
grant select, insert on public.maintenance_diagnostic_audit_events to authenticated;

with templates(issue_type, title, description, emergency_warning, sort_order) as (
  values
    ('boiler_heating', 'Boiler / heating', 'Basic information gathering for heating issues.', 'If there is a gas smell, carbon monoxide alarm, or immediate danger, contact emergency services or the relevant emergency provider immediately.', 10),
    ('no_hot_water', 'No hot water', 'Basic information gathering for hot-water issues.', null, 20),
    ('damp_mould', 'Damp or mould', 'Basic information gathering for damp, mould, condensation, or leak context.', null, 30),
    ('electrical_issue', 'Electrical issue', 'Basic information gathering for electrical issues.', 'If there is electrical danger, fire, smoke, burning smell, or immediate danger, contact emergency services or the relevant emergency provider immediately.', 40),
    ('leak', 'Leak', 'Basic information gathering for leaks and water escape.', 'If flooding or immediate danger is present, contact emergency services or the relevant emergency provider immediately.', 50),
    ('blocked_drain', 'Blocked drain', 'Basic information gathering for blocked drains.', null, 60),
    ('appliance_issue', 'Appliance issue', 'Basic information gathering for supplied appliance issues.', null, 70),
    ('pest_issue', 'Pest issue', 'Basic information gathering for pest reports.', null, 80),
    ('lost_keys_security', 'Lost keys / security', 'Basic information gathering for key and security incidents.', 'If there is a security risk or immediate danger, contact emergency services or the relevant emergency provider immediately.', 90),
    ('door_window_lock', 'Door, window, or lock', 'Basic information gathering for doors, windows, and locks.', null, 100),
    ('other', 'Other', 'Basic information gathering for other maintenance issues.', null, 110)
)
insert into public.maintenance_diagnostic_templates(issue_type, title, description, emergency_warning, sort_order, active)
select issue_type, title, description, emergency_warning, sort_order, true
from templates
on conflict (issue_type) do update set
  title = excluded.title,
  description = excluded.description,
  emergency_warning = excluded.emergency_warning,
  sort_order = excluded.sort_order,
  active = true;

with step_seed(issue_type, step_key, question, answer_type, options, help_text, sort_order, triggers_emergency, triggers_deposit_flag, triggers_eco_upgrade_flag, triggers_compliance_flag) as (
  values
    ('boiler_heating', 'emergency_risk', 'Is there a gas smell, carbon monoxide alarm, or immediate danger?', 'yes_no', '[]'::jsonb, 'Stop routine checks if this is yes.', 10, true, false, false, true),
    ('boiler_heating', 'power_checked', 'Have basic power and thermostat settings been checked?', 'yes_no', '[]'::jsonb, null, 20, false, false, false, false),
    ('boiler_heating', 'recurring_issue', 'Has this happened before at this property?', 'yes_no', '[]'::jsonb, null, 30, false, false, true, false),
    ('no_hot_water', 'whole_property', 'Is there no hot water across the whole property?', 'yes_no', '[]'::jsonb, null, 10, false, false, false, false),
    ('no_hot_water', 'vulnerable_occupant', 'Is a vulnerable occupant affected?', 'yes_no', '[]'::jsonb, null, 20, false, false, false, true),
    ('no_hot_water', 'recurring_issue', 'Has this happened before at this property?', 'yes_no', '[]'::jsonb, null, 30, false, false, true, false),
    ('damp_mould', 'active_leak', 'Is there an active leak, wet patch, or water coming in now?', 'yes_no', '[]'::jsonb, null, 10, false, false, false, true),
    ('damp_mould', 'ventilation_context', 'Are extractor fans, vents, or windows available and used?', 'single_choice', '[{"value":"yes","label":"Yes"},{"value":"no","label":"No"},{"value":"not_sure","label":"Not sure"}]'::jsonb, null, 20, false, false, true, false),
    ('damp_mould', 'recurring_issue', 'Has damp or mould returned after previous action?', 'yes_no', '[]'::jsonb, null, 30, false, false, true, true),
    ('electrical_issue', 'emergency_risk', 'Is there smoke, burning smell, sparking, exposed wiring, or immediate danger?', 'yes_no', '[]'::jsonb, null, 10, true, false, false, true),
    ('electrical_issue', 'area_affected', 'What area is affected?', 'text', '[]'::jsonb, null, 20, false, false, false, false),
    ('leak', 'emergency_risk', 'Is there flooding, water near electrics, or immediate danger?', 'yes_no', '[]'::jsonb, null, 10, true, false, false, true),
    ('leak', 'water_source', 'Can the likely water source be identified?', 'text', '[]'::jsonb, null, 20, false, false, false, false),
    ('blocked_drain', 'multiple_fixtures', 'Are multiple sinks, toilets, or drains affected?', 'yes_no', '[]'::jsonb, null, 10, false, false, false, false),
    ('blocked_drain', 'tenant_damage_possible', 'Is there evidence of wipes, foreign objects, or misuse?', 'yes_no', '[]'::jsonb, null, 20, false, true, false, false),
    ('appliance_issue', 'supplied_appliance', 'Is this a landlord-supplied appliance?', 'yes_no', '[]'::jsonb, null, 10, false, false, false, false),
    ('appliance_issue', 'tenant_damage_possible', 'Is there visible damage or signs of misuse?', 'yes_no', '[]'::jsonb, null, 20, false, true, false, false),
    ('pest_issue', 'location_detail', 'Where has activity been seen?', 'text', '[]'::jsonb, null, 10, false, false, false, false),
    ('pest_issue', 'neighbouring_properties', 'Could neighbouring properties or communal areas be affected?', 'yes_no', '[]'::jsonb, null, 20, false, false, false, true),
    ('lost_keys_security', 'emergency_risk', 'Is there an immediate security risk or danger?', 'yes_no', '[]'::jsonb, null, 10, true, false, false, true),
    ('lost_keys_security', 'tenant_damage_possible', 'Were keys lost, damaged, or retained by the tenant?', 'yes_no', '[]'::jsonb, null, 20, false, true, false, false),
    ('door_window_lock', 'property_insecure', 'Is the property currently insecure?', 'yes_no', '[]'::jsonb, null, 10, true, false, false, true),
    ('door_window_lock', 'tenant_damage_possible', 'Is there visible damage or signs of misuse?', 'yes_no', '[]'::jsonb, null, 20, false, true, false, false),
    ('other', 'issue_context', 'Please describe what has happened and when it started.', 'text', '[]'::jsonb, null, 10, false, false, false, false),
    ('other', 'emergency_risk', 'Is there immediate danger, flooding, fire, electrical risk, gas smell, carbon monoxide alarm, or security risk?', 'yes_no', '[]'::jsonb, null, 20, true, false, false, true),
    ('other', 'photo_prompt', 'Photos can be added after submission from the request details panel.', 'info', '[]'::jsonb, null, 30, false, false, false, false)
)
insert into public.maintenance_diagnostic_steps(
  template_id,
  step_key,
  question,
  answer_type,
  options,
  help_text,
  sort_order,
  triggers_emergency,
  triggers_deposit_flag,
  triggers_eco_upgrade_flag,
  triggers_compliance_flag,
  active
)
select
  t.id,
  s.step_key,
  s.question,
  s.answer_type,
  s.options,
  s.help_text,
  s.sort_order,
  s.triggers_emergency,
  s.triggers_deposit_flag,
  s.triggers_eco_upgrade_flag,
  s.triggers_compliance_flag,
  true
from step_seed s
join public.maintenance_diagnostic_templates t on t.issue_type = s.issue_type
on conflict (template_id, step_key) do update set
  question = excluded.question,
  answer_type = excluded.answer_type,
  options = excluded.options,
  help_text = excluded.help_text,
  sort_order = excluded.sort_order,
  triggers_emergency = excluded.triggers_emergency,
  triggers_deposit_flag = excluded.triggers_deposit_flag,
  triggers_eco_upgrade_flag = excluded.triggers_eco_upgrade_flag,
  triggers_compliance_flag = excluded.triggers_compliance_flag,
  active = true;
