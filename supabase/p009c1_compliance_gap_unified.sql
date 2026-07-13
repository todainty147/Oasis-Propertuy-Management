-- P-009C1: Compliance Gap Unified View + Attested Row Surfacing
-- Creates compliance_gap_unified view and extends command_center_items,
-- attention_center_items, and get_operating_calendar to surface imported
-- (attested) compliance records alongside native ones.
--
-- Ordering constraint: must run AFTER compliance_import_labeling.sql
-- (which adds import_batch_id to tenancy_compliance_items).
--
-- RB-01 idempotent: CREATE OR REPLACE VIEW; _v0 rename guard; DROP IF EXISTS + CREATE.
-- RB-03: registered in both dbApplyRepoSql.js OVERLAY_SEQUENCE and dbBootstrap.js.

begin;

-- ── §1  compliance_gap_unified VIEW ──────────────────────────────────────────────
-- UNION ALL of compliance_items (native task model) and tenancy_compliance_items
-- (document-oriented model, includes attested imports).
-- security_invoker = true: direct API queries respect underlying RLS.
-- source_model identifies the physical table. NEVER 'imported'.
-- is_attested_import = true ONLY when tenancy_compliance_items.import_batch_id IS NOT NULL.

create or replace view public.compliance_gap_unified
  with (security_invoker = true)
as
  -- Source 1: compliance_items (native landlord-created task/reminder items)
  select
    ci.id                              as source_item_id,
    'compliance_items'::text           as source_model,
    ci.account_id,
    ci.property_id,
    ci.tenant_id,
    null::uuid                         as tenancy_id,
    ci.title,
    ci.due_date,
    -- scan_status: date-led, 5-step precedence (inactive > overdue > due_soon > current > missing)
    case
      when lower(coalesce(ci.status, 'active')) not in ('active') then 'inactive'
      when ci.due_date < current_date                              then 'overdue'
      when ci.due_date <= current_date + ci.reminder_window_days   then 'due_soon'
      when ci.due_date > current_date                              then 'current'
      else                                                             'missing'
    end                                as scan_status,
    null::uuid                         as import_batch_id,
    false                              as is_attested_import,
    ci.status                          as source_status,
    ci.updated_at,
    ci.created_at
  from public.compliance_items ci

  union all

  -- Source 2: tenancy_compliance_items (document-oriented; includes imported records)
  -- is_attested_import = TRUE only when import_batch_id IS NOT NULL.
  -- Native TCI rows (import_batch_id IS NULL) remain unmarked (is_attested_import = false).
  select
    tci.id                                     as source_item_id,
    'tenancy_compliance_items'::text           as source_model,
    tci.account_id,
    tci.property_id,
    tci.tenant_id,
    tci.tenancy_id,
    coalesce(cr.label, 'Compliance item')      as title,
    coalesce(tci.expires_at, tci.due_date)     as due_date,
    -- date-led scan_status for TCI
    -- TCI statuses: missing/logged/acknowledged/expiring_soon/expired/needs_review/not_applicable
    case
      when tci.status = 'not_applicable'
                                                                    then 'inactive'
      when tci.status = 'expired'
        or (tci.expires_at is not null and tci.expires_at < current_date)
        or (tci.expires_at is null and tci.due_date is not null
            and tci.due_date < current_date)
                                                                    then 'overdue'
      when tci.status = 'expiring_soon'
        or (
          coalesce(tci.expires_at, tci.due_date) is not null
          and coalesce(tci.expires_at, tci.due_date) >= current_date
          and coalesce(tci.expires_at, tci.due_date)
              <= current_date + coalesce(tci.reminder_days_before, 30)
        )                                                           then 'due_soon'
      when coalesce(tci.expires_at, tci.due_date) is not null
        and coalesce(tci.expires_at, tci.due_date)
            > current_date + coalesce(tci.reminder_days_before, 30) then 'current'
      else                                                              'missing'
    end                                        as scan_status,
    tci.import_batch_id,
    (tci.import_batch_id is not null)          as is_attested_import,
    tci.status                                 as source_status,
    tci.updated_at,
    tci.created_at
  from public.tenancy_compliance_items tci
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
;

-- ── §2  command_center_items — extend with attested compliance rows ────────────────
-- Pattern: rename original to _v0 (idempotent guard), then create a wrapper
-- that delegates to _v0 and UNIONs attested TCI compliance rows.
-- The _v0 rename runs only once; subsequent applies skip the rename and
-- only drop+recreate the wrapper.

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'command_center_items_v0'
  ) then
    alter function public.command_center_items(uuid, integer)
      rename to command_center_items_v0;
  end if;
end $$;

drop function if exists public.command_center_items(uuid, integer);

create function public.command_center_items(
  p_account_id uuid,
  p_limit      integer default 80
)
returns table (
  item_key          text,
  item_type         text,
  category          text,
  severity          text,
  bucket            text,
  entity_type       text,
  entity_id         text,
  title             text,
  body              text,
  link_path         text,
  property_id       uuid,
  property_label    text,
  tenant_id         uuid,
  tenant_label      text,
  entity_label      text,
  contractor_label  text,
  amount            numeric,
  age_hours         integer,
  due_days          integer,
  created_at        timestamptz,
  resolved_state    boolean,
  source_table      text,
  sort_order        integer
)
language sql
security definer
set search_path = public
as $$
  -- Native items from the original function (includes native compliance_items rows)
  select * from public.command_center_items_v0(p_account_id, p_limit)

  union all

  -- Attested imported compliance items: overdue
  -- source_table = 'tenancy_compliance_items' signals attested badge on frontend
  select
    'compliance-attested-overdue-' || tci.id::text,
    'compliance_overdue'::text,
    'compliance'::text,
    'urgent'::text,
    'urgent'::text,
    case when tci.tenant_id is not null then 'tenant' else 'property' end::text,
    coalesce(tci.tenant_id::text, tci.property_id::text),
    'Compliance overdue'::text,
    coalesce(tci.notes, ''),
    '/compliance/safe',
    tci.property_id,
    coalesce(p.address, '—'),
    tci.tenant_id,
    coalesce(t.name, '—'),
    coalesce(cr.label, 'Compliance item'),
    ''::text,
    null::numeric,
    null::int,
    (coalesce(tci.expires_at, tci.due_date) - current_date)::int,
    tci.updated_at,
    false,
    'tenancy_compliance_items'::text,
    19
  from public.tenancy_compliance_items tci
  left join public.properties p  on p.id  = tci.property_id
  left join public.tenants    t  on t.id  = tci.tenant_id
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
  where tci.account_id = (select public.assert_command_center_access(p_account_id))
    and tci.import_batch_id is not null
    and (
      tci.status = 'expired'
      or (tci.expires_at is not null and tci.expires_at < current_date)
      or (tci.expires_at is null and tci.due_date is not null
          and tci.due_date < current_date)
    )

  union all

  -- Attested imported compliance items: due soon
  select
    'compliance-attested-due-' || tci.id::text,
    'compliance_due_soon'::text,
    'compliance'::text,
    'action'::text,
    'action'::text,
    case when tci.tenant_id is not null then 'tenant' else 'property' end::text,
    coalesce(tci.tenant_id::text, tci.property_id::text),
    'Compliance due soon'::text,
    coalesce(tci.notes, ''),
    '/compliance/safe',
    tci.property_id,
    coalesce(p.address, '—'),
    tci.tenant_id,
    coalesce(t.name, '—'),
    coalesce(cr.label, 'Compliance item'),
    ''::text,
    null::numeric,
    null::int,
    (coalesce(tci.expires_at, tci.due_date) - current_date)::int,
    tci.updated_at,
    false,
    'tenancy_compliance_items'::text,
    20
  from public.tenancy_compliance_items tci
  left join public.properties p  on p.id  = tci.property_id
  left join public.tenants    t  on t.id  = tci.tenant_id
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
  where tci.account_id = (select public.assert_command_center_access(p_account_id))
    and tci.import_batch_id is not null
    and tci.status not in ('expired', 'not_applicable')
    and (
      tci.status = 'expiring_soon'
      or (
        coalesce(tci.expires_at, tci.due_date) is not null
        and coalesce(tci.expires_at, tci.due_date) >= current_date
        and coalesce(tci.expires_at, tci.due_date)
            <= current_date + coalesce(tci.reminder_days_before, 30)
      )
    )
$$;

grant execute on function public.command_center_items(uuid, integer) to authenticated;

-- ── §3  attention_center_items — extend with attested compliance rows ────────────
-- Same RENAME + WRAPPER pattern.

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'attention_center_items_v0'
  ) then
    alter function public.attention_center_items(uuid, integer)
      rename to attention_center_items_v0;
  end if;
end $$;

drop function if exists public.attention_center_items(uuid, integer);

create function public.attention_center_items(
  p_account_id uuid,
  p_limit      integer default 60
)
returns table (
  item_key       text,
  item_type      text,
  bucket         text,
  property_label text,
  tenant_label   text,
  entity_label   text,
  amount         numeric,
  age_hours      integer,
  due_days       integer,
  link_path      text,
  source_table   text,
  sort_order     integer
)
language sql
security definer
set search_path = public
as $$
  select * from public.attention_center_items_v0(p_account_id, p_limit)

  union all

  -- Attested imported compliance: overdue
  select
    'compliance-attested-overdue-' || tci.id::text,
    'compliance_overdue'::text,
    'urgent'::text,
    coalesce(p.address, '—'),
    coalesce(t.name, '—'),
    coalesce(cr.label, 'Compliance item'),
    null::numeric,
    null::int,
    (coalesce(tci.expires_at, tci.due_date) - current_date)::int,
    '/compliance/safe',
    'tenancy_compliance_items'::text,
    19
  from public.tenancy_compliance_items tci
  left join public.properties p  on p.id  = tci.property_id
  left join public.tenants    t  on t.id  = tci.tenant_id
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
  where tci.account_id = (select public.assert_manage_account_access(p_account_id))
    and tci.import_batch_id is not null
    and (
      tci.status = 'expired'
      or (tci.expires_at is not null and tci.expires_at < current_date)
      or (tci.expires_at is null and tci.due_date is not null
          and tci.due_date < current_date)
    )

  union all

  -- Attested imported compliance: due soon
  select
    'compliance-attested-due-' || tci.id::text,
    'compliance_due_soon'::text,
    'upcoming'::text,
    coalesce(p.address, '—'),
    coalesce(t.name, '—'),
    coalesce(cr.label, 'Compliance item'),
    null::numeric,
    null::int,
    (coalesce(tci.expires_at, tci.due_date) - current_date)::int,
    '/compliance/safe',
    'tenancy_compliance_items'::text,
    57
  from public.tenancy_compliance_items tci
  left join public.properties p  on p.id  = tci.property_id
  left join public.tenants    t  on t.id  = tci.tenant_id
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
  where tci.account_id = (select public.assert_manage_account_access(p_account_id))
    and tci.import_batch_id is not null
    and tci.status not in ('expired', 'not_applicable')
    and (
      tci.status = 'expiring_soon'
      or (
        coalesce(tci.expires_at, tci.due_date) is not null
        and coalesce(tci.expires_at, tci.due_date) >= current_date
        and coalesce(tci.expires_at, tci.due_date)
            <= current_date + coalesce(tci.reminder_days_before, 30)
      )
    )
$$;

grant execute on function public.attention_center_items(uuid, integer) to authenticated;

-- ── §4  get_operating_calendar — add is_attested_import + attested rows ──────────
-- Adds is_attested_import boolean to return type (requires DROP + CREATE).
-- Native rows get is_attested_import = false.
-- Attested imported compliance rows get is_attested_import = true.
-- Attested rows link to /compliance/safe (NOT the legacy /compliance/tax path).

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_operating_calendar_v0'
  ) then
    alter function public.get_operating_calendar(uuid, date, date, uuid, text, text, text)
      rename to get_operating_calendar_v0;
  end if;
end $$;

drop function if exists public.get_operating_calendar(uuid, date, date, uuid, text, text, text);

create function public.get_operating_calendar(
  p_account_id    uuid,
  p_start_date    date,
  p_end_date      date,
  p_property_id   uuid  default null,
  p_source_module text  default null,
  p_urgency       text  default null,
  p_status        text  default null
)
returns table (
  id                 uuid,
  source_module      text,
  title              text,
  due_date           date,
  status             text,
  urgency            text,
  property_id        uuid,
  property_label     text,
  tenant_id          uuid,
  tenant_label       text,
  amount             numeric,
  link_path          text,
  notes              text,
  is_attested_import boolean
)
language sql
security definer
set search_path = public
as $$
  -- Native calendar items: all existing sources, is_attested_import = false
  select
    v.id,
    v.source_module,
    v.title,
    v.due_date,
    v.status,
    v.urgency,
    v.property_id,
    v.property_label,
    v.tenant_id,
    v.tenant_label,
    v.amount,
    v.link_path,
    v.notes,
    false as is_attested_import
  from public.get_operating_calendar_v0(
    p_account_id, p_start_date, p_end_date,
    p_property_id, p_source_module, p_urgency, p_status
  ) v

  union all

  -- Attested imported compliance items in the calendar window
  -- link_path: /compliance/safe (NOT /compliance/tax)
  select
    tci.id,
    'compliance'::text                                              as source_module,
    coalesce(cr.label, 'Compliance item')                          as title,
    coalesce(tci.expires_at, tci.due_date)                         as due_date,
    case
      when tci.status = 'expired'
        or (tci.expires_at is not null and tci.expires_at < current_date)
        or (tci.expires_at is null and tci.due_date is not null
            and tci.due_date < current_date)                       then 'overdue'
      when tci.status = 'expiring_soon'
        or (
          coalesce(tci.expires_at, tci.due_date) is not null
          and coalesce(tci.expires_at, tci.due_date) >= current_date
          and coalesce(tci.expires_at, tci.due_date)
              <= current_date + coalesce(tci.reminder_days_before, 30)
        )                                                          then 'due_soon'
      else                                                             'scheduled'
    end                                                            as status,
    case
      when tci.status = 'expired'
        or (tci.expires_at is not null
            and tci.expires_at < current_date - interval '30 days') then 'critical'
      when tci.status = 'expired'
        or (tci.expires_at is not null and tci.expires_at < current_date)
                                                                   then 'high'
      when coalesce(tci.expires_at, tci.due_date) <= current_date + 14
                                                                   then 'medium'
      else                                                             'low'
    end                                                            as urgency,
    tci.property_id,
    coalesce(pr.address, '—')                                      as property_label,
    tci.tenant_id,
    coalesce(tn.name, '—')                                         as tenant_label,
    null::numeric                                                   as amount,
    '/compliance/safe'::text                                        as link_path,
    tci.notes,
    true                                                            as is_attested_import
  from public.tenancy_compliance_items tci
  join (
    select public.assert_manage_account_access(p_account_id) as account_id
  ) authz on tci.account_id = authz.account_id
  left join public.properties pr on pr.id = tci.property_id
  left join public.tenants    tn on tn.id = tci.tenant_id
  left join public.compliance_requirements cr on cr.id = tci.requirement_id
  where tci.import_batch_id is not null
    and tci.status not in ('not_applicable')
    and coalesce(tci.expires_at, tci.due_date) is not null
    and coalesce(tci.expires_at, tci.due_date) between p_start_date and p_end_date
    and (p_property_id   is null or tci.property_id = p_property_id)
    and (p_source_module is null or p_source_module = 'compliance')
    and (p_urgency is null or (
      case
        when tci.status = 'expired'
          or (tci.expires_at is not null
              and tci.expires_at < current_date - interval '30 days') then 'critical'
        when tci.status = 'expired'
          or (tci.expires_at is not null and tci.expires_at < current_date) then 'high'
        when coalesce(tci.expires_at, tci.due_date) <= current_date + 14   then 'medium'
        else                                                                     'low'
      end = p_urgency
    ))
    and (p_status is null or (
      case
        when tci.status = 'expired'
          or (tci.expires_at is not null and tci.expires_at < current_date)
          or (tci.expires_at is null and tci.due_date is not null
              and tci.due_date < current_date)                     then 'overdue'
        when tci.status = 'expiring_soon'
          or (
            coalesce(tci.expires_at, tci.due_date) >= current_date
            and coalesce(tci.expires_at, tci.due_date)
                <= current_date + coalesce(tci.reminder_days_before, 30)
          )                                                        then 'due_soon'
        else                                                           'scheduled'
      end = p_status
    ))
$$;

grant execute on function public.get_operating_calendar(uuid, date, date, uuid, text, text, text)
  to authenticated;

commit;
