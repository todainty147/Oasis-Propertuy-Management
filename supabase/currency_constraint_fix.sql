-- =============================================================================
-- Currency Constraint Fix
-- =============================================================================
-- Fixes two issues from the initial currency_internationalization.sql:
--   1. Croatia (HR) mapped to HRK — Croatia adopted EUR on 2023-01-01.
--      Drop HRK from CHECK constraints; add CAD and AUD (Canada/Australia).
--   2. Recreate the update_account_localization RPC with the corrected list.
-- =============================================================================


-- ── 1. Fix accounts.currency CHECK constraint ─────────────────────────────────
alter table public.accounts
  drop constraint if exists accounts_currency_check;

alter table public.accounts
  add constraint accounts_currency_check
    check (currency = any (array[
      'PLN','EUR','GBP','USD',
      'CZK','CHF','DKK','SEK','NOK',
      'HUF','RON','BGN','CAD','AUD'
    ]));


-- ── 2. Fix payments.currency CHECK constraint ─────────────────────────────────
alter table public.payments
  drop constraint if exists payments_currency_check;

alter table public.payments
  add constraint payments_currency_check
    check (currency = any (array[
      'PLN','EUR','GBP','USD',
      'CZK','CHF','DKK','SEK','NOK',
      'HUF','RON','BGN','CAD','AUD'
    ]));


-- ── 3. Re-create RPC with corrected currency list ─────────────────────────────
create or replace function public.update_account_localization(
  p_account_id  uuid,
  p_country_code text,
  p_currency    text,
  p_language    text
)
returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.accounts;
begin
  if coalesce(public.account_role_for(p_account_id), '') not in ('owner', 'admin') then
    raise exception 'Not permitted';
  end if;

  if p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country_code: must be two uppercase letters (ISO 3166-1 alpha-2)';
  end if;

  if p_currency not in (
    'PLN','EUR','GBP','USD',
    'CZK','CHF','DKK','SEK','NOK',
    'HUF','RON','BGN','CAD','AUD'
  ) then
    raise exception 'Unsupported currency: %', p_currency;
  end if;

  if p_language not in ('pl','en','de') then
    raise exception 'Unsupported language: %', p_language;
  end if;

  update public.accounts
  set country_code = p_country_code,
      currency     = p_currency,
      language     = p_language
  where id = p_account_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_account_localization(uuid, text, text, text) from public;
grant  execute on function public.update_account_localization(uuid, text, text, text) to authenticated;
