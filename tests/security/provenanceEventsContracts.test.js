import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance event ledger contracts", () => {
  const sql = readSource("supabase/provenance_events.sql");

  it("defines the complete account-scoped event shape and server-owned defaults", () => {
    for (const column of [
      "id uuid primary key default gen_random_uuid()",
      "account_id uuid not null",
      "sequence_number bigint not null",
      "entity_type text not null",
      "entity_id uuid not null",
      "property_id uuid null",
      "tenancy_id uuid null",
      "event_type text not null",
      "event_version integer not null default 1",
      "actor_type text not null",
      "actor_user_id uuid null",
      "occurred_at timestamptz not null",
      "recorded_at timestamptz not null default now()",
      "metadata jsonb not null default '{}'::jsonb",
      "amount_minor bigint null",
      "visibility text not null default 'internal'",
      "previous_event_hash text null",
      "event_hash text null",
      "hash_version smallint not null default 0",
      "idempotency_key text null",
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("enforces actor, metadata, money, correction, visibility, and idempotency integrity", () => {
    expect(sql).toContain("unique (account_id, sequence_number)");
    expect(sql).toContain("where idempotency_key is not null");
    expect(sql).toContain("amount_minor is null or nullif(btrim(currency), '') is not null");
    expect(sql).toContain("num_nonnulls(supersedes_event_id, reversal_of_event_id) <= 1");
    expect(sql).toContain("actor_type in ('human', 'system', 'ai', 'integration')");
    expect(sql).toContain("actor_type <> 'human' or actor_user_id is not null");
    expect(sql).toContain("jsonb_typeof(metadata) = 'object'");
    expect(sql).toContain("visibility in ('internal', 'account')");
    expect(sql).toContain("occurred_at cannot be more than five minutes in the future");
  });

  it("retains a pseudonymous actor UUID without blocking reviewed Auth deletion", () => {
    expect(sql).toContain("actor_user_id uuid null");
    expect(sql).not.toContain(
      "actor_user_id uuid null references auth.users(id) on delete restrict",
    );
    expect(sql).toContain(
      "drop constraint if exists provenance_events_actor_user_id_fkey",
    );
    expect(sql).toContain(
      "reviewed identity deletion does not mutate or block the append-only ledger",
    );
  });

  it("creates every required account lookup index", () => {
    expect(sql).toContain("on public.provenance_events(account_id, sequence_number)");
    expect(sql).toContain("on public.provenance_events(account_id, tenancy_id, occurred_at)");
    expect(sql).toContain("on public.provenance_events(account_id, property_id, occurred_at)");
    expect(sql).toContain("on public.provenance_events(account_id, entity_type, entity_id)");
    expect(sql).toContain("on public.provenance_events(account_id, event_type)");
    expect(sql).toContain("on public.provenance_events(account_id, correlation_id)");
  });

  it("makes mutation and truncation unavailable to normal API roles", () => {
    expect(sql).toContain("before update on public.provenance_events");
    expect(sql).toContain("before delete on public.provenance_events");
    expect(sql).toContain("before truncate on public.provenance_events");
    expect(sql).toContain("revoke all on table public.provenance_events from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.provenance_events to authenticated");
    expect(sql).toContain("record a correction or reversal event instead");
  });

  it("uses an explicit security-definer authorization boundary", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("v_actor_user_id uuid := auth.uid()");
    expect(sql).toContain("public.account_member_effective_role(p_account_id, v_actor_user_id)");
    expect(sql).toContain("array['owner', 'admin', 'staff']");
    expect(sql).toContain("account operator role required");
    expect(sql).not.toMatch(/p_(sequence_number|recorded_at|previous_event_hash|event_hash)\b/);
  });

  it("allocates per-account sequences without max-plus-one and handles retries race-safely", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0)");
    expect(sql).toContain("insert into public.provenance_event_counters");
    expect(sql).toContain("returning next_sequence - 1 into v_sequence_number");
    expect(sql).not.toMatch(/max\s*\(\s*sequence_number\s*\)\s*\+\s*1/i);
    expect(sql).toContain("on conflict (account_id, idempotency_key)");
    expect(sql).toContain("do nothing");
    expect(sql).toContain("return v_event");
  });

  it("validates correction and reversal targets inside the account", () => {
    expect(sql).toContain("v_reference_event.account_id <> p_account_id");
    expect(sql).toContain("v_reference_event.id = v_event_id");
    expect(sql).toContain("cross-entity references require a reason");
    expect(sql).toContain("only one correction or reversal reference may be set");
  });

  it("computes a SHA-256 hash chain via BEFORE INSERT trigger with self-locking counter", () => {
    expect(sql).toContain("provenance_genesis_sentinel");
    expect(sql).toContain("repeat('0', 64)");
    expect(sql).toContain("provenance_lp");
    expect(sql).toContain("provenance_canonical_payload_v0");
    expect(sql).toContain("'v0:' ||");
    expect(sql).toContain("extensions.digest");
    expect(sql).toContain("convert_to(provenance_canonical_payload_v0(new), 'UTF8')");
    expect(sql).toContain("'sha256'");
    expect(sql).toContain("before insert on public.provenance_events");
    expect(sql).toContain("provenance_compute_hash_before_insert");
    expect(sql).toContain("for update");
    expect(sql).toContain("provenance: counter row missing for account");
    expect(sql).toContain("coalesce(v_prev, provenance_genesis_sentinel())");
    expect(sql).toContain("head_hash is null at sequence");
    expect(sql).toContain("run the backfill migration before inserting new events");
    expect(sql).toContain("new.hash_version := 0");
  });

  it("advances the counter head_hash via AFTER INSERT trigger", () => {
    expect(sql).toContain("provenance_advance_head_hash_after_insert");
    expect(sql).toContain("after insert on public.provenance_events");
    expect(sql).toContain("set head_hash = new.event_hash");
    expect(sql).toContain("head_hash text");
  });

  it("provides a verify_provenance_chain RPC with auth, sequence, version, and counter checks", () => {
    expect(sql).toContain("verify_provenance_chain");
    expect(sql).toContain("out is_valid boolean");
    expect(sql).toContain("out checked_count bigint");
    expect(sql).toContain("out first_broken_sequence bigint");
    expect(sql).toContain("out first_broken_reason text");
    expect(sql).toContain("v_actor_id uuid := auth.uid()");
    expect(sql).toContain("account owner or admin role required");
    expect(sql).toContain("array['owner', 'admin']");
    expect(sql).toContain("previous_event_hash is distinct from v_expected_prev");
    expect(sql).toContain("event_hash is distinct from v_recomputed");
    expect(sql).toContain("sequence gap: expected");
    expect(sql).toContain("unsupported hash_version");
    expect(sql).toContain("counter row missing");
    expect(sql).toContain("counter head_hash drift");
    expect(sql).toContain("counter next_sequence drift");
    expect(sql).toContain("grant execute on function public.verify_provenance_chain(uuid) to authenticated");
    expect(sql).toContain("revoke all on function public.verify_provenance_chain(uuid) from public, anon, authenticated");
  });

  it("hashes actor_role, property_id, and tenancy_id in canonical field set v0.3", () => {
    expect(sql).toContain("canonical field set v0.3");
    expect(sql).toContain("provenance_lp(ev.actor_role)");
    expect(sql).toContain("provenance_lp(ev.property_id::text)");
    expect(sql).toContain("provenance_lp(ev.tenancy_id::text)");
    expect(sql).toContain("SHA-256 hex of the length-prefixed canonical payload v0.3");
    expect(sql).toContain("idempotency_key and created_at remain excluded");
  });

  it("persists hash_version per event for future format evolution", () => {
    expect(sql).toContain("hash_version smallint not null default 0");
    expect(sql).toContain("new.hash_version := 0");
    expect(sql).toContain("future format changes do not invalidate historical hashes");
  });

  it("revokes direct execution of hash internals from all API roles", () => {
    expect(sql).toContain("revoke all on function public.provenance_genesis_sentinel() from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.provenance_lp(text) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.provenance_canonical_payload_v0(public.provenance_events) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.provenance_compute_hash_before_insert() from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.provenance_advance_head_hash_after_insert() from public, anon, authenticated");
  });

  it("enforces NOT NULL on hash columns after backfill and keeps tenant access closed", () => {
    expect(sql).toContain('create policy "provenance_events_select_account_operators"');
    expect(sql).not.toMatch(/create policy[^;]+tenant/is);
    expect(sql).toContain("alter column event_hash set not null");
    expect(sql).toContain("alter column previous_event_hash set not null");
  });

  it("is registered in both database application paths before final hardening", () => {
    const applyScript = readSource("scripts/dbApplyRepoSql.js");
    const bootstrapScript = readSource("scripts/dbBootstrap.js");

    expect(applyScript).toContain(
      '"provenance_events.sql",\n  "provenance_finance_cutover.sql",\n  "provenance_explain_balance.sql",\n  "supabase_linter_security_hardening.sql"',
    );
    expect(bootstrapScript).toContain('path.join(supabaseDir, "provenance_events.sql")');
  });
});
