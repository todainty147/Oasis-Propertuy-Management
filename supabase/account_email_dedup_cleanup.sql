-- Cleanup duplicate landlord email/account collisions.
-- Safe approach: keep the oldest owner-account per email, disable newer duplicates.
-- Run in SQL editor after reviewing preview queries.

-- 1) Preview duplicated landlord emails (owner memberships)
with owner_members as (
  select
    lower(u.email) as email,
    am.account_id,
    a.name as account_name,
    a.created_at,
    row_number() over (
      partition by lower(u.email)
      order by a.created_at asc nulls last, a.id asc
    ) as rn
  from public.account_members am
  join auth.users u on u.id = am.user_id
  join public.accounts a on a.id = am.account_id
  where public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
)
select *
from owner_members
where rn > 1
order by email, rn;

-- 2) Disable duplicate owner accounts (keeps rn=1 per email)
with owner_members as (
  select
    lower(u.email) as email,
    am.account_id,
    row_number() over (
      partition by lower(u.email)
      order by a.created_at asc nulls last, a.id asc
    ) as rn
  from public.account_members am
  join auth.users u on u.id = am.user_id
  join public.accounts a on a.id = am.account_id
  where public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
),
dupes as (
  select account_id
  from owner_members
  where rn > 1
)
update public.accounts a
set
  is_disabled = true,
  disabled_at = now()
from dupes d
where a.id = d.account_id
  and coalesce(a.is_root, false) = false;

-- 3) Revoke extra active landlord invites for same email (keeps oldest active)
with ranked_owner_invites as (
  select
    ai.id,
    row_number() over (
      partition by lower(ai.email)
      order by ai.created_at asc nulls last, ai.id asc
    ) as rn
  from public.account_invitations ai
  where lower(ai.role::text) = 'owner'
    and ai.accepted_at is null
    and ai.revoked_at is null
)
update public.account_invitations ai
set revoked_at = now()
from ranked_owner_invites r
where ai.id = r.id
  and r.rn > 1;
