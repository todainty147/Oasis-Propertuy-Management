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

  it("keeps tenant access closed and hash work server-side for Sprint 1.5", () => {
    expect(sql).toContain('create policy "provenance_events_select_account_operators"');
    expect(sql).not.toMatch(/create policy[^;]+tenant/is);
    expect(sql).toContain("Sprint 1.5 TODO");
    expect(sql).toContain("null,\n    null,\n    p_idempotency_key");
  });

  it("is registered in both database application paths before final hardening", () => {
    const applyScript = readSource("scripts/dbApplyRepoSql.js");
    const bootstrapScript = readSource("scripts/dbBootstrap.js");

    expect(applyScript).toContain(
      '"hmrc_mtd_e1_uk_property_compliance.sql",\n  "provenance_events.sql",\n  "supabase_linter_security_hardening.sql"',
    );
    expect(bootstrapScript).toContain('path.join(supabaseDir, "provenance_events.sql")');
  });
});
