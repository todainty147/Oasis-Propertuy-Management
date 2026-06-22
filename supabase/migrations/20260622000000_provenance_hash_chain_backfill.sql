-- Sprint 1.5: Add cryptographic hash chain to provenance events.
-- Adds head_hash to counter table, creates hash chain functions and triggers,
-- backfills all existing events, and enforces NOT NULL on hash columns.
--
-- Re-runnable: events with NULL hashes are backfilled; existing non-NULL hashes
-- and links are verified in place and never overwritten. Any mismatch aborts
-- the migration. next_sequence is verified but NOT overwritten; inconsistency
-- is reported for investigation and rejected by final chain verification.

-- Step 1: Extend counter table with chain head hash.
alter table public.provenance_event_counters
  add column if not exists head_hash text;

alter table public.provenance_events
  add column if not exists hash_version smallint not null default 0;

-- Step 2: Create hash chain functions.
-- These are the same definitions as provenance_events.sql (the overlay).
-- The overlay re-creates them with CREATE OR REPLACE on every apply.

create or replace function public.provenance_genesis_sentinel()
returns text
language sql
immutable
parallel safe
as $$
  select repeat('0', 64);
$$;

create or replace function public.provenance_lp(val text)
returns text
language sql
immutable
parallel safe
as $$
  select case when val is null then 'NULL'
              else octet_length(val)::text || ':' || val end;
$$;

create or replace function public.provenance_canonical_payload_v0(ev public.provenance_events)
returns text
language sql
stable
parallel safe
set search_path = public
as $$
  -- Canonical field set v0.3 (26 fields).
  -- v0.3 promoted actor_role, property_id, tenancy_id from v0.2 exclusion.
  -- idempotency_key and created_at remain excluded (operational, not evidential).
  select 'v0:' ||
    public.provenance_lp(ev.account_id::text) || '|' ||
    public.provenance_lp(ev.sequence_number::text) || '|' ||
    public.provenance_lp(ev.entity_type) || '|' ||
    public.provenance_lp(ev.entity_id::text) || '|' ||
    public.provenance_lp(ev.property_id::text) || '|' ||
    public.provenance_lp(ev.tenancy_id::text) || '|' ||
    public.provenance_lp(ev.event_type) || '|' ||
    public.provenance_lp(ev.event_version::text) || '|' ||
    public.provenance_lp(ev.actor_type) || '|' ||
    public.provenance_lp(ev.actor_user_id::text) || '|' ||
    public.provenance_lp(ev.actor_role) || '|' ||
    public.provenance_lp(to_char(ev.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || '|' ||
    public.provenance_lp(to_char(ev.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || '|' ||
    public.provenance_lp(ev.summary) || '|' ||
    public.provenance_lp(ev.reason) || '|' ||
    public.provenance_lp(ev.metadata::text) || '|' ||
    public.provenance_lp(ev.amount_minor::text) || '|' ||
    public.provenance_lp(ev.currency) || '|' ||
    public.provenance_lp(ev.source_type) || '|' ||
    public.provenance_lp(ev.source_id::text) || '|' ||
    public.provenance_lp(ev.supersedes_event_id::text) || '|' ||
    public.provenance_lp(ev.reversal_of_event_id::text) || '|' ||
    public.provenance_lp(ev.correlation_id::text) || '|' ||
    public.provenance_lp(ev.causation_id::text) || '|' ||
    public.provenance_lp(ev.visibility) || '|' ||
    public.provenance_lp(ev.previous_event_hash);
$$;

create or replace function public.provenance_compute_hash_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prev text;
begin
  select head_hash into v_prev
    from public.provenance_event_counters
   where account_id = new.account_id
     for update;

  if not found then
    raise exception 'provenance: counter row missing for account % — sequencing not initialised',
      new.account_id;
  end if;

  if v_prev is null and new.sequence_number > 1 then
    raise exception 'provenance: head_hash is null at sequence % for account % — run the backfill migration before inserting new events',
      new.sequence_number, new.account_id;
  end if;

  new.previous_event_hash := coalesce(v_prev, provenance_genesis_sentinel());
  new.hash_version := 0;

  new.event_hash := encode(
    extensions.digest(
      convert_to(provenance_canonical_payload_v0(new), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return new;
end;
$$;

create or replace function public.provenance_advance_head_hash_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.provenance_event_counters
     set head_hash = new.event_hash
   where account_id = new.account_id;
  return new;
end;
$$;

-- Step 3: Install triggers (idempotent).
drop trigger if exists trg_provenance_events_compute_hash on public.provenance_events;
create trigger trg_provenance_events_compute_hash
before insert on public.provenance_events
for each row execute function public.provenance_compute_hash_before_insert();

drop trigger if exists trg_provenance_events_advance_head_hash on public.provenance_events;
create trigger trg_provenance_events_advance_head_hash
after insert on public.provenance_events
for each row execute function public.provenance_advance_head_hash_after_insert();

-- Step 4: Backfill existing events.
-- session_replication_role = replica bypasses the append-only UPDATE trigger.
-- Only NULL hashes are written; non-NULL hashes are verified in place.
-- A mismatch on an already-hashed event raises an exception rather than
-- silently resealing a tampered chain.
do $$
declare
  v_account record;
  v_event public.provenance_events%rowtype;
  v_prev_hash text;
  v_payload text;
  v_hash text;
  v_backfilled bigint := 0;
  v_verified bigint := 0;
begin
  set local session_replication_role = 'replica';

  for v_account in
    select distinct account_id from public.provenance_events order by account_id
  loop
    v_prev_hash := public.provenance_genesis_sentinel();

    for v_event in
      select * from public.provenance_events
       where account_id = v_account.account_id
       order by sequence_number asc
    loop
      if v_event.event_hash is null then
        -- Backfill: compute and write hash for unhashed event.
        v_event.previous_event_hash := v_prev_hash;
        v_payload := public.provenance_canonical_payload_v0(v_event);
        v_hash := encode(
          extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'),
          'hex'
        );

        update public.provenance_events
           set previous_event_hash = v_prev_hash,
               event_hash = v_hash,
               hash_version = 0
         where id = v_event.id;

        v_prev_hash := v_hash;
        v_backfilled := v_backfilled + 1;
      else
        -- Verify: existing hash must match recomputed value.
        if v_event.previous_event_hash is distinct from v_prev_hash then
          raise exception 'provenance backfill aborted: previous_event_hash mismatch at seq % for account % — chain may have been tampered',
            v_event.sequence_number, v_account.account_id;
        end if;

        v_payload := public.provenance_canonical_payload_v0(v_event);
        v_hash := encode(
          extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'),
          'hex'
        );

        if v_event.event_hash is distinct from v_hash then
          raise exception 'provenance backfill aborted: event_hash mismatch at seq % for account % — chain may have been tampered',
            v_event.sequence_number, v_account.account_id;
        end if;

        v_prev_hash := v_event.event_hash;
        v_verified := v_verified + 1;
      end if;
    end loop;

    -- Sync counter head_hash only (do not touch next_sequence)
    update public.provenance_event_counters
       set head_hash = v_prev_hash
     where account_id = v_account.account_id;
  end loop;

  reset session_replication_role;

  raise notice 'provenance hash chain: backfilled % events, verified % existing',
    v_backfilled, v_verified;
end $$;

-- Step 5: Verify next_sequence consistency (warn, do not overwrite).
do $$
declare
  v_row record;
begin
  for v_row in
    select c.account_id, c.next_sequence,
           coalesce(max(e.sequence_number), 0) + 1 as expected_next
      from public.provenance_event_counters c
      left join public.provenance_events e on e.account_id = c.account_id
     group by c.account_id, c.next_sequence
    having c.next_sequence <> coalesce(max(e.sequence_number), 0) + 1
  loop
    raise warning 'provenance counter inconsistency: account % has next_sequence=% but expected=%',
      v_row.account_id, v_row.next_sequence, v_row.expected_next;
  end loop;
end $$;

-- Step 6: Enforce NOT NULL now that all rows have hashes.
alter table public.provenance_events
  alter column event_hash set not null;
alter table public.provenance_events
  alter column previous_event_hash set not null;

-- Step 7: Create verify function and verify chain integrity.
create or replace function public.verify_provenance_chain(
  p_account_id uuid,
  out is_valid boolean,
  out checked_count bigint,
  out first_broken_sequence bigint,
  out first_broken_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_event public.provenance_events%rowtype;
  v_expected_prev text;
  v_expected_seq bigint := 1;
  v_recomputed text;
  v_count bigint := 0;
  v_last_hash text;
  v_counter_head text;
  v_counter_next bigint;
begin
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  v_role := public.account_member_effective_role(p_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin']) then
    raise exception 'account owner or admin role required';
  end if;

  is_valid := true;
  v_expected_prev := provenance_genesis_sentinel();

  for v_event in
    select * from public.provenance_events e
     where e.account_id = p_account_id
     order by e.sequence_number asc
  loop
    v_count := v_count + 1;

    if v_event.sequence_number <> v_expected_seq then
      is_valid := false;
      checked_count := v_count;
      first_broken_sequence := v_event.sequence_number;
      first_broken_reason := format(
        'sequence gap: expected %s, got %s',
        v_expected_seq, v_event.sequence_number
      );
      return;
    end if;

    if v_event.hash_version <> 0 then
      is_valid := false;
      checked_count := v_count;
      first_broken_sequence := v_event.sequence_number;
      first_broken_reason := format(
        'unsupported hash_version %s at seq %s',
        v_event.hash_version, v_event.sequence_number
      );
      return;
    end if;

    if v_event.previous_event_hash is distinct from v_expected_prev then
      is_valid := false;
      checked_count := v_count;
      first_broken_sequence := v_event.sequence_number;
      first_broken_reason := format(
        'previous_event_hash mismatch at seq %s: expected %s, got %s',
        v_event.sequence_number, v_expected_prev, v_event.previous_event_hash
      );
      return;
    end if;

    v_recomputed := encode(
      extensions.digest(
        convert_to(provenance_canonical_payload_v0(v_event), 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    if v_event.event_hash is distinct from v_recomputed then
      is_valid := false;
      checked_count := v_count;
      first_broken_sequence := v_event.sequence_number;
      first_broken_reason := format(
        'event_hash mismatch at seq %s: expected %s, got %s',
        v_event.sequence_number, v_recomputed, v_event.event_hash
      );
      return;
    end if;

    v_expected_prev := v_event.event_hash;
    v_last_hash := v_event.event_hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;

  if v_count > 0 then
    select head_hash, next_sequence
      into v_counter_head, v_counter_next
      from public.provenance_event_counters
     where account_id = p_account_id;

    if not found then
      is_valid := false;
      first_broken_sequence := null;
      first_broken_reason := format(
        'counter row missing: account has %s events but no counter',
        v_count
      );
      checked_count := v_count;
      return;
    end if;

    if v_counter_head is distinct from v_last_hash then
      is_valid := false;
      first_broken_sequence := null;
      first_broken_reason := format(
        'counter head_hash drift: expected %s, got %s',
        v_last_hash, v_counter_head
      );
      checked_count := v_count;
      return;
    end if;

    if v_counter_next <> v_expected_seq then
      is_valid := false;
      first_broken_sequence := null;
      first_broken_reason := format(
        'counter next_sequence drift: expected %s, got %s',
        v_expected_seq, v_counter_next
      );
      checked_count := v_count;
      return;
    end if;
  end if;

  checked_count := v_count;
end;
$$;

revoke all on function public.verify_provenance_chain(uuid) from public, anon, authenticated;
grant execute on function public.verify_provenance_chain(uuid) to authenticated;

-- Mirror overlay revokes for internal hash helpers.
revoke all on function public.provenance_genesis_sentinel() from public, anon, authenticated;
revoke all on function public.provenance_lp(text) from public, anon, authenticated;
revoke all on function public.provenance_canonical_payload_v0(public.provenance_events) from public, anon, authenticated;
revoke all on function public.provenance_compute_hash_before_insert() from public, anon, authenticated;
revoke all on function public.provenance_advance_head_hash_after_insert() from public, anon, authenticated;

-- Post-backfill verification (inline, not via the RPC which requires auth context).
do $$
declare
  v_account record;
  v_event public.provenance_events%rowtype;
  v_expected_prev text;
  v_expected_seq bigint;
  v_recomputed text;
  v_count bigint;
  v_last_hash text;
  v_counter_head text;
  v_counter_next bigint;
begin
  for v_account in
    select distinct account_id from public.provenance_events order by account_id
  loop
    v_expected_prev := public.provenance_genesis_sentinel();
    v_expected_seq := 1;
    v_count := 0;
    v_last_hash := null;

    for v_event in
      select * from public.provenance_events
       where account_id = v_account.account_id
       order by sequence_number asc
    loop
      v_count := v_count + 1;

      if v_event.sequence_number <> v_expected_seq then
        raise exception 'provenance chain verification failed for account %: sequence gap at position % (expected %, got %)',
          v_account.account_id, v_count, v_expected_seq, v_event.sequence_number;
      end if;

      if v_event.hash_version <> 0 then
        raise exception 'provenance chain verification failed for account %: unsupported hash_version % at seq %',
          v_account.account_id, v_event.hash_version, v_event.sequence_number;
      end if;

      if v_event.previous_event_hash is distinct from v_expected_prev then
        raise exception 'provenance chain verification failed for account %: previous_event_hash mismatch at seq %',
          v_account.account_id, v_event.sequence_number;
      end if;

      v_recomputed := encode(
        extensions.digest(
          convert_to(public.provenance_canonical_payload_v0(v_event), 'UTF8'),
          'sha256'
        ),
        'hex'
      );

      if v_event.event_hash is distinct from v_recomputed then
        raise exception 'provenance chain verification failed for account %: event_hash mismatch at seq %',
          v_account.account_id, v_event.sequence_number;
      end if;

      v_expected_prev := v_event.event_hash;
      v_last_hash := v_event.event_hash;
      v_expected_seq := v_expected_seq + 1;
    end loop;

    if v_count > 0 then
      select head_hash, next_sequence
        into v_counter_head, v_counter_next
        from public.provenance_event_counters
       where account_id = v_account.account_id;

      if not found then
        raise exception 'provenance chain verification failed for account %: counter row missing',
          v_account.account_id;
      end if;

      if v_counter_head is distinct from v_last_hash then
        raise exception 'provenance chain verification failed for account %: counter head_hash drift',
          v_account.account_id;
      end if;

      if v_counter_next <> v_expected_seq then
        raise exception 'provenance chain verification failed for account %: counter next_sequence drift (expected %, got %)',
          v_account.account_id, v_expected_seq, v_counter_next;
      end if;
    end if;
  end loop;

  raise notice 'provenance hash chain: all accounts verified';
end $$;
