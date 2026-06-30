-- ============================================================
-- Phase 2 Critical / High repair pass
-- E-066b : Emergency diagnostics misrouting        (Critical)
-- E-077  : Maintenance evidence strength           (High)
-- E-074  : Checkatrade go-live gating             (Medium)
-- Applied after maintenance_smart_diagnostics.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- E-066b  Remove immediate_danger duplicate steps
--
-- Background:
--   Legacy migrations inserted `immediate_danger` steps into
--   boiler_heating, electrical_issue, and leak templates at the
--   same sort_order (10) as `emergency_risk` (triggers_emergency=t).
--   PostgREST returns rows in ctid/heap order when no ORDER BY
--   is present. Because `immediate_danger` was inserted first its
--   ctid is lower; ES2019 stable sort preserves that order when
--   both share sort_order=10. The non-emergency question renders
--   before the emergency question. A tenant answering YES to the
--   first visible gas-smell prompt does NOT fire the emergency
--   flag — it is silently swallowed.
--
-- Fix:
--   Delete the duplicate non-emergency steps so only
--   emergency_risk (triggers_emergency=true) remains at the
--   top of each hazard template.
-- ────────────────────────────────────────────────────────────

-- Delete the non-emergency immediate_danger duplicates for templates that already
-- have an emergency_risk step (boiler_heating, electrical_issue). The DELETE in
-- legal_security_phase3.sql (which runs before this file) is the source-level fix;
-- this is the safety net for any environment that ran legal_security_phase3.sql
-- before the cleanup block was added.
delete from public.maintenance_diagnostic_steps mds
using public.maintenance_diagnostic_templates mdt
where mds.template_id = mdt.id
  and mdt.issue_type in ('boiler_heating', 'electrical_issue')
  and mds.step_key = 'immediate_danger';

-- no_hot_water has immediate_danger (triggers_emergency=false by default) but no
-- conflicting emergency_risk step. Fix the flag so a gas-smell answer actually fires
-- the emergency path instead of being silently dropped.
update public.maintenance_diagnostic_steps mds
set    triggers_emergency = true
from   public.maintenance_diagnostic_templates mdt
where  mds.template_id = mdt.id
  and  mdt.issue_type  = 'no_hot_water'
  and  mds.step_key    = 'immediate_danger';

-- ────────────────────────────────────────────────────────────
-- E-077  Evidence lock and attester metadata
--
-- Part 1: attester_role column
--   Records which party uploaded each evidence item and in what
--   capacity. Required to distinguish independent attestation
--   (e.g. third-party inspection) from aligned attestation
--   (contractor's own completion photo) in the deposit dispute
--   pack.
-- ────────────────────────────────────────────────────────────

alter table public.work_order_attachments
  add column if not exists attester_role text
  check (
    attester_role is null
    or attester_role in ('contractor', 'landlord', 'tenant', 'admin', 'system')
  );

comment on column public.work_order_attachments.attester_role is
  'Role of the uploading party (contractor, landlord, tenant, admin, system). '
  'Used in the deposit dispute pack to flag aligned vs independent attestation.';

-- Part 2: Evidence lock at work-order completion.
--
-- Lock boundary: COMPLETION, not upload.
--   In-progress work orders: uploaders may freely edit their
--     own evidence (correcting a mis-uploaded photo is legitimate).
--   Completed/cancelled work orders: only account owner/admin/staff
--     may delete (data-correction path). The uploader arm is blocked.
--
-- Two legacy policies (woa_delete, wo_attach_delete) allowed
-- unrestricted uploader deletion.  Both are replaced below.
-- wo_attachments_delete (owner/staff only) is already correct
-- and is left unchanged.

drop policy if exists "woa_delete" on public.work_order_attachments;
create policy "woa_delete" on public.work_order_attachments
  for delete to authenticated
  using (
    (
      -- Uploader may delete while the work order is still open
      uploaded_by = auth.uid()
      and exists (
        select 1
        from public.work_orders wo
        where wo.id        = work_order_attachments.work_order_id
          and wo.account_id = work_order_attachments.account_id
          and wo.status not in (
            'completed',  'cancelled',
            'zakończone', 'anulowane'
          )
      )
    )
    or
    -- Account owner / admin / staff may always delete (data-correction)
    exists (
      select 1
      from public.account_members am
      where am.account_id = work_order_attachments.account_id
        and am.user_id    = auth.uid()
        and lower(am.role::text) = any(
          array['owner', 'admin', 'staff']
        )
    )
  );

drop policy if exists "wo_attach_delete" on public.work_order_attachments;
create policy "wo_attach_delete" on public.work_order_attachments
  for delete to authenticated
  using (
    (
      uploaded_by = auth.uid()
      and exists (
        select 1
        from public.work_orders wo
        where wo.id        = work_order_attachments.work_order_id
          and wo.account_id = work_order_attachments.account_id
          and wo.status not in (
            'completed',  'cancelled',
            'zakończone', 'anulowane'
          )
      )
    )
    or
    exists (
      select 1
      from public.account_members am
      where am.account_id = work_order_attachments.account_id
        and am.user_id    = auth.uid()
        and lower(am.role::text) = any(
          array['owner', 'admin', 'staff']
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- E-074  Checkatrade go-live gate
--
-- category_ids_verified must be true before any account is
-- allowed to set configuration.live_submission_enabled or
-- configuration.external_submission_url.
-- A database trigger enforces this invariant.
-- ────────────────────────────────────────────────────────────

alter table public.marketplace_integration_settings
  add column if not exists category_ids_verified boolean not null default false;

comment on column public.marketplace_integration_settings.category_ids_verified is
  'Must be true (IDs verified against live Checkatrade category API at '
  'https://developer.checkatrade.com/affiliate/categories) before '
  'configuration.live_submission_enabled may be set. '
  'Enforced by tg_enforce_checkatrade_go_live_gate.';

create or replace function public.enforce_checkatrade_go_live_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider_key = 'checkatrade'
     and (
       (new.configuration->>'live_submission_enabled')::boolean is true
       or (new.configuration->>'external_submission_url') is not null
     )
     and new.category_ids_verified is not true
  then
    raise exception
      'Checkatrade go-live gate: category_ids_verified must be true before '
      'enabling live submission or setting an external_submission_url. '
      'Verify all 18 category IDs against https://developer.checkatrade.com/affiliate/categories '
      'then set category_ids_verified = true on this record.';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_enforce_checkatrade_go_live_gate
  on public.marketplace_integration_settings;

create trigger tg_enforce_checkatrade_go_live_gate
  before insert or update on public.marketplace_integration_settings
  for each row execute function public.enforce_checkatrade_go_live_gate();

-- Also return category_ids_verified from the settings listing function
-- so the UI can surface an honest staged-vs-live distinction.
drop function if exists public.list_marketplace_integration_settings(uuid);

create or replace function public.list_marketplace_integration_settings(
  p_account_id uuid
)
returns table(
  provider_key          text,
  enabled               boolean,
  configuration         jsonb,
  category_ids_verified boolean,
  updated_at            timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    mp.provider_key,
    coalesce(s.enabled, false),
    coalesce(s.configuration, '{}'::jsonb),
    coalesce(s.category_ids_verified, false),
    s.updated_at
  from public.marketplace_providers mp
  left join public.marketplace_integration_settings s
    on s.provider_key = mp.provider_key
   and s.account_id   = p_account_id
  order by mp.provider_key;
$$;
