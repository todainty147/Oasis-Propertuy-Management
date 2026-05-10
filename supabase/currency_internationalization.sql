-- =============================================================================
-- Currency Internationalisation
-- =============================================================================
-- Adds per-account country_code + currency so financial records are stored with
-- the correct currency code rather than a hardcoded 'PLN' default.
--
-- Design decisions:
--   • One currency per account.  International landlords with mixed portfolios
--     can be addressed later by adding currency at the property level.
--   • currency is stored on payments at creation so historical records remain
--     correct even if the account currency is changed later.
--   • language constraint broadened from ('pl','en') → ('pl','en','de') so
--     German landlords can be fully onboarded.
-- =============================================================================


-- ── 1. Broaden language constraint to allow German ────────────────────────────
alter table public.accounts
  drop constraint if exists accounts_language_check;

alter table public.accounts
  add constraint accounts_language_check
    check (language = any (array['pl','en','de']));


-- ── 2. country_code column (ISO 3166-1 alpha-2) ───────────────────────────────
alter table public.accounts
  add column if not exists country_code text not null default 'PL'
  check (country_code ~ '^[A-Z]{2}$');


-- ── 3. currency column (ISO 4217) ─────────────────────────────────────────────
alter table public.accounts
  add column if not exists currency text not null default 'PLN'
  constraint accounts_currency_check
    check (currency = any (array[
      'PLN','EUR','GBP','USD',
      'CZK','CHF','DKK','SEK','NOK',
      'HUF','RON','BGN','CAD','AUD'
    ]));


-- ── 4. Backfill existing accounts from language column ────────────────────────
-- Polish landlords stay PLN.
-- English-language accounts are assumed to be UK (GBP) — owners can override
-- via the Localization settings page if they are in another English-speaking
-- territory (US, AU, IE, etc.).
update public.accounts
set country_code = 'PL', currency = 'PLN'
where language = 'pl';

update public.accounts
set country_code = 'GB', currency = 'GBP'
where language = 'en';

update public.accounts
set country_code = 'DE', currency = 'EUR'
where language = 'de';


-- ── 5. currency column on payments (inherits from account at creation) ────────
alter table public.payments
  add column if not exists currency text not null default 'PLN'
  constraint payments_currency_check
    check (currency = any (array[
      'PLN','EUR','GBP','USD',
      'CZK','CHF','DKK','SEK','NOK',
      'HUF','RON','BGN','CAD','AUD'
    ]));

-- Backfill: pull currency from the owning account
update public.payments p
set currency = (
  select a.currency
  from public.accounts a
  where a.id = p.account_id
)
where true;


-- ── 6. RPC to update account localization (owner/admin only) ──────────────────
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
  -- Only owner / admin of the account may change localisation settings
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
