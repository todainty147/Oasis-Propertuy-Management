-- Stores the trades array returned by Checkatrade after a successful affiliate job submission.
-- Each row is one trade matched for a specific external_marketplace_jobs record.
-- Access is gated exclusively through security-definer RPCs — no direct table access is granted.

create table if not exists public.external_marketplace_job_trades (
  id uuid primary key default gen_random_uuid(),
  marketplace_job_id uuid not null references public.external_marketplace_jobs(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  trade_id text not null default '',
  name text not null default '',
  profile_url text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists external_marketplace_job_trades_job_idx
  on public.external_marketplace_job_trades(marketplace_job_id, created_at);

create index if not exists external_marketplace_job_trades_account_idx
  on public.external_marketplace_job_trades(account_id, work_order_id);

alter table public.external_marketplace_job_trades enable row level security;

drop policy if exists external_marketplace_job_trades_no_direct_access on public.external_marketplace_job_trades;
create policy external_marketplace_job_trades_no_direct_access
on public.external_marketplace_job_trades
for all
to authenticated
using (false)
with check (false);

-- Returns all trades for a given marketplace job, account-scoped.
create or replace function public.list_marketplace_job_trades(
  p_account_id uuid,
  p_marketplace_job_id uuid
)
returns setof public.external_marketplace_job_trades
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if not exists (
    select 1
    from public.external_marketplace_jobs j
    where j.id = p_marketplace_job_id
      and j.account_id = v_account_id
  ) then
    raise exception 'Marketplace job not found' using errcode = 'P0002';
  end if;

  return query
  select t.*
  from public.external_marketplace_job_trades t
  where t.marketplace_job_id = p_marketplace_job_id
    and t.account_id = v_account_id
  order by t.created_at;
end;
$$;

-- Called by the Edge Function (service_role) to bulk-replace trades for a job after a submission.
-- Deletes existing trades for the job then inserts the new batch atomically.
create or replace function public.edge_store_marketplace_job_trades(
  p_account_id uuid,
  p_marketplace_job_id uuid,
  p_work_order_id uuid,
  p_trades jsonb
)
returns setof public.external_marketplace_job_trades
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade jsonb;
begin
  -- Reject anything that is not a JSON array before touching stored data.
  if p_trades is null or jsonb_typeof(p_trades) <> 'array' then
    raise exception 'p_trades must be a JSON array';
  end if;

  -- Always clear existing trades so a zero-trade resubmission doesn't leave stale rows.
  delete from public.external_marketplace_job_trades t
  where t.marketplace_job_id = p_marketplace_job_id
    and t.account_id = p_account_id;

  -- Nothing to insert for an empty array — return after clearing.
  if jsonb_array_length(p_trades) = 0 then
    return;
  end if;

  for v_trade in select * from jsonb_array_elements(p_trades) loop
    insert into public.external_marketplace_job_trades (
      marketplace_job_id,
      account_id,
      work_order_id,
      trade_id,
      name,
      profile_url,
      raw_payload
    )
    values (
      p_marketplace_job_id,
      p_account_id,
      p_work_order_id,
      coalesce(nullif(trim(v_trade->>'id'), ''), ''),
      coalesce(nullif(trim(v_trade->>'name'), ''), ''),
      coalesce(nullif(trim(v_trade->>'profileURL'), ''), ''),
      v_trade
    );
  end loop;

  return query
  select t.*
  from public.external_marketplace_job_trades t
  where t.marketplace_job_id = p_marketplace_job_id
    and t.account_id = p_account_id
  order by t.created_at;
end;
$$;

grant execute on function public.list_marketplace_job_trades(uuid, uuid) to authenticated;
grant execute on function public.edge_store_marketplace_job_trades(uuid, uuid, uuid, jsonb) to service_role;
