import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance explain balance contracts (Sprint 2B)", () => {
  const sql = readSource("supabase/provenance_explain_balance.sql");

  describe("B3. period breakdown helper", () => {
    it("defines finance_property_period_breakdown with correct return shape", () => {
      expect(sql).toContain("finance_property_period_breakdown");
      for (const col of [
        "period_index integer",
        "period_start date",
        "period_end date",
        "period_key text",
        "rent_minor bigint",
        "rent_start_date date",
        "rent_start_source text",
        "currency text",
      ]) {
        expect(sql).toContain(col);
      }
    });

    it("derives periods from the shared accumulation function", () => {
      expect(sql).toContain("finance_property_accumulation(p_account_id)");
      expect(sql).toContain("generate_series(1, fa.months_elapsed)");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fnMatch = sql.match(
        /finance_property_period_breakdown[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fnMatch).not.toBeNull();
    });

    it("is revoked from API roles", () => {
      expect(sql).toContain(
        "revoke all on function public.finance_property_period_breakdown(uuid, uuid)",
      );
    });

    it("does NOT grant execute to authenticated (internal only)", () => {
      expect(sql).not.toMatch(
        /grant execute on function public\.finance_property_period_breakdown.*to authenticated/,
      );
    });
  });

  describe("B1-B2. forward rent accrual", () => {
    it("defines provenance_accrue_rent_charges with correct signature", () => {
      expect(sql).toContain("provenance_accrue_rent_charges");
      expect(sql).toContain("p_account_id uuid default null");
      expect(sql).toContain("p_property_id uuid default null");
      expect(sql).toContain("returns jsonb");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fnMatch = sql.match(
        /provenance_accrue_rent_charges[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fnMatch).not.toBeNull();
    });

    it("skips periods covered by the obligation snapshot (cutover seam B4)", () => {
      expect(sql).toContain("if v_period.period_index <= v_snapshot_months then");
    });

    it("reads snapshot months_elapsed from obligation event metadata", () => {
      expect(sql).toContain("metadata ->> 'months_elapsed'");
      expect(sql).toContain("finance.legacy_obligation_snapshot");
    });

    it("uses idempotency keys with cutover_version for rent.charged", () => {
      expect(sql).toContain("'live:rent.charged:'");
      expect(sql).toContain("v_cutover_version::text");
    });

    it("accrues native accounts without requiring a legacy snapshot or cutover row", () => {
      expect(sql).toContain(
        "where public.provenance_finance_tracking_active(a.id)",
      );
      expect(sql).toContain(
        "if v_snapshot_months is null and v_provenance_mode = 'native' then",
      );
      expect(sql).toContain("v_snapshot_months := 0");
    });

    it("checks idempotency before allocating sequence numbers", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const idemCheck = body.indexOf("select id into v_existing_event_id");
      const counterAlloc = body.indexOf(
        "provenance_event_counters",
        idemCheck,
      );
      expect(idemCheck).toBeLessThan(counterAlloc);
    });

    it("emits rent.charged events with correct event_type and version", () => {
      expect(sql).toContain("'rent.charged', 1");
    });

    it("uses actor_type=system for accrual events", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'system', null, 'system'");
    });

    it("uses source_type=rent_accrual", () => {
      expect(sql).toContain("'rent_accrual'");
    });

    it("includes accrual metadata with period and rent details", () => {
      for (const key of [
        "charge_period_start",
        "charge_period_end",
        "period_key",
        "period_index",
        "rent_minor_used",
        "rent_source",
        "accrual_basis",
        "cutover_version",
        "source",
      ]) {
        expect(sql).toContain(`'${key}'`);
      }
    });

    it("documents accrual past lease_end_date in metadata (B9)", () => {
      expect(sql).toContain("accrual_continues_past_lease_end_date");
    });

    it("mirrors finance_snapshot lease filtering (only checks renewal_status)", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain(
        "lower(coalesce(l.renewal_status, 'active')) not in ('ended')",
      );
    });

    it("does not accrue native rent beyond the recorded lease end", () => {
      expect(sql).toContain("v_period.period_start > v_lease_end_date");
      expect(sql).toContain("v_lease_id is null");
    });

    it("skips accounts where provenance finance tracking is not active", () => {
      expect(sql).toContain("'provenance finance tracking is not active'");
    });

    it("returns emitted and skipped counts", () => {
      expect(sql).toContain("'emitted'");
      expect(sql).toContain("'skipped_existing'");
    });

    it("is granted to authenticated", () => {
      expect(sql).toContain(
        "grant execute on function public.provenance_accrue_rent_charges(uuid, uuid) to authenticated",
      );
    });
  });

  describe("C. balance projection update", () => {
    it("includes rent.charged in the event type filter", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'rent.charged'");
    });

    it("rent.charged contributes positive to balance (debit)", () => {
      expect(sql).toContain(
        "when re.event_type = 'rent.charged' then coalesce(re.amount_minor, 0)",
      );
    });

    it("rent.charged treatment is active", () => {
      expect(sql).toContain(
        "when re.event_type = 'rent.charged' then 'active'",
      );
    });

    it("selects the latest non-null tenancy without unsupported UUID aggregation", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain(
        "array_agg(e.ev_tenancy_id order by e.sequence_number desc)",
      );
      expect(fn[0]).toContain("filter (where e.ev_tenancy_id is not null)");
      expect(fn[0]).not.toContain("max(e.ev_tenancy_id)");
    });

    it("casts bigint aggregation back to the declared balance return type", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("pp.balance::bigint as balance_minor");
    });

    it("is granted to authenticated but revoked from public", () => {
      expect(sql).toContain(
        "grant execute on function public.provenance_balance_projection(uuid, uuid) to authenticated",
      );
      expect(sql).toContain(
        "revoke all on function public.provenance_balance_projection(uuid, uuid)",
      );
    });
  });

  describe("D. reconciliation gate update", () => {
    it("calls provenance_accrue_rent_charges before comparing (on-read catch-up)", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_reconciliation_gate[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const accrualCall = body.indexOf("provenance_accrue_rent_charges");
      const projectionCall = body.indexOf("provenance_balance_projection");
      expect(accrualCall).toBeGreaterThan(-1);
      expect(accrualCall).toBeLessThan(projectionCall);
    });

    it("classifies post_cutover_rent_change as explained_divergence", () => {
      expect(sql).toContain("'post_cutover_rent_change'");
      expect(sql).toContain("snap_rent_minor");
    });

    it("explains rent change divergence with friendly copy", () => {
      expect(sql).toContain(
        "The legacy finance view recalculates ALL earlier months using the current rent",
      );
    });

    it("returns display_basis for each status", () => {
      expect(sql).toContain("display_basis");
      expect(sql).toContain("'legacy_compatible'");
    });

    it("classifies properties without provenance as cannot_compare (not unexplained)", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_reconciliation_gate[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("when c.p_curr is null then 'cannot_compare'");
      expect(fn[0]).toContain("'not_yet_cut_over'");
    });

    it("still classifies overpayment as explained_divergence only when legacy is exactly zero", () => {
      expect(sql).toContain(
        "when c.leg_balance = 0 and c.prov_bal < 0 then 'explained_divergence'",
      );
      expect(sql).not.toMatch(
        /leg_balance\s*>\s*0.*then\s+'explained_divergence'/,
      );
    });
  });

  describe("I. internal anchoring", () => {
    it("creates provenance_chain_anchors table with required columns", () => {
      expect(sql).toContain("provenance_chain_anchors");
      for (const col of [
        "account_id uuid not null",
        "head_sequence bigint not null",
        "head_hash text not null",
        "event_count bigint not null",
        "anchor_hash text not null",
        "anchored_at timestamptz not null default now()",
        "anchored_by uuid",
      ]) {
        expect(sql).toContain(col);
      }
    });

    it("enforces unique anchor per (account_id, head_sequence)", () => {
      expect(sql).toContain("provenance_chain_anchors_unique_head");
      expect(sql).toContain("unique (account_id, head_sequence)");
    });

    it("enables RLS on anchors table", () => {
      expect(sql).toContain(
        "alter table public.provenance_chain_anchors enable row level security",
      );
    });

    it("restricts anchor reads to owner/admin via RLS", () => {
      expect(sql).toContain("provenance_chain_anchors_select_operators");
      expect(sql).toContain("array['owner', 'admin']");
    });

    it("is append-only: blocks UPDATE, DELETE, and TRUNCATE", () => {
      expect(sql).toContain("trg_provenance_anchors_no_update");
      expect(sql).toContain("trg_provenance_anchors_no_delete");
      expect(sql).toContain("trg_provenance_anchors_no_truncate");
      expect(sql).toContain("provenance_chain_anchors is append-only");
    });

    it("anchor function verifies chain before anchoring", () => {
      const fn = sql.match(
        /create or replace function public\.anchor_provenance_chain[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("verify_provenance_chain(p_account_id)");
      expect(fn[0]).toContain("chain verification failed");
    });

    it("anchor function uses SHA-256 via extensions.digest", () => {
      expect(sql).toContain("extensions.digest");
      expect(sql).toContain("sha256");
    });

    it("anchor function deduplicates by (account_id, head_sequence)", () => {
      const fn = sql.match(
        /create or replace function public\.anchor_provenance_chain[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("on conflict (account_id, head_sequence) do nothing");
    });

    it("verify_provenance_anchor returns anchor consistency and events_after_anchor", () => {
      expect(sql).toContain("verify_provenance_anchor");
      expect(sql).toContain("anchor_consistent");
      expect(sql).toContain("events_after_anchor");
    });

    it("anchor_all_provenance_chains handles per-account failures independently", () => {
      const fn = sql.match(
        /create or replace function public\.anchor_all_provenance_chains[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("exception when others then");
    });

    it("batch anchor function is NOT granted to authenticated (internal only)", () => {
      expect(sql).toContain(
        "revoke all on function public.anchor_all_provenance_chains()",
      );
      expect(sql).not.toMatch(
        /grant execute on function public\.anchor_all_provenance_chains.*to authenticated/,
      );
    });
  });

  describe("Part 2. provenance_chain_status verification cache", () => {
    it("defines provenance_chain_status table with required columns", () => {
      expect(sql).toContain("provenance_chain_status");
      for (const col of [
        "account_id uuid primary key references public.accounts(id) on delete cascade",
        "verified boolean not null",
        "last_verified_at timestamptz not null",
        "head_sequence bigint",
        "head_hash text",
        "event_count bigint",
        "first_broken_sequence bigint null",
        "first_broken_reason text null",
        "updated_at timestamptz not null default now()",
      ]) {
        expect(sql).toContain(col);
      }
    });

    it("is NOT append-only (mutable cache, intentionally updatable)", () => {
      expect(sql).toContain(
        "Mutable per-account cache of the latest chain verification result",
      );
      expect(sql).not.toMatch(
        /trg_provenance_chain_status_no_update/,
      );
    });

    it("enables RLS on chain_status table", () => {
      expect(sql).toContain(
        "alter table public.provenance_chain_status enable row level security",
      );
    });

    it("restricts status reads to owner/admin/staff and root operators", () => {
      expect(sql).toContain("provenance_chain_status_select_operators");
      expect(sql).toContain("array['owner', 'admin', 'staff']");
    });

    it("revokes all and grants only select to authenticated", () => {
      expect(sql).toContain(
        "revoke all on table public.provenance_chain_status from public, anon, authenticated",
      );
      expect(sql).toContain(
        "grant select on table public.provenance_chain_status to authenticated",
      );
    });

    it("defines get_provenance_chain_head as stable SECURITY DEFINER", () => {
      const fn = sql.match(
        /create or replace function public\.get_provenance_chain_head[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("stable");
      expect(fn[0]).toContain("security definer");
      expect(fn[0]).toContain("set search_path = public");
    });

    it("get_provenance_chain_head reads from provenance_event_counters", () => {
      const fn = sql.match(
        /create or replace function public\.get_provenance_chain_head[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("provenance_event_counters");
      expect(fn[0]).toContain("c.next_sequence - 1");
      expect(fn[0]).toContain("c.head_hash");
    });

    it("get_provenance_chain_head is revoked from API roles (internal only)", () => {
      expect(sql).toContain(
        "revoke all on function public.get_provenance_chain_head(uuid)",
      );
      expect(sql).not.toMatch(
        /grant execute on function public\.get_provenance_chain_head.*to authenticated/,
      );
    });

    it("defines verify_and_persist_chain_status as SECURITY DEFINER", () => {
      const fn = sql.match(
        /create or replace function public\.verify_and_persist_chain_status[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("security definer");
      expect(fn[0]).toContain("set search_path = public");
    });

    it("verify_and_persist_chain_status calls internal verifier", () => {
      const fn = sql.match(
        /create or replace function public\.verify_and_persist_chain_status[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("_verify_provenance_chain_internal(p_account_id)");
    });

    it("verify_and_persist_chain_status upserts into provenance_chain_status", () => {
      const fn = sql.match(
        /create or replace function public\.verify_and_persist_chain_status[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("insert into public.provenance_chain_status");
      expect(fn[0]).toContain("on conflict (account_id) do update set");
    });

    it("verify_and_persist_chain_status returns last_verified_at", () => {
      const fn = sql.match(
        /create or replace function public\.verify_and_persist_chain_status[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("out last_verified_at timestamptz");
    });

    it("verify_and_persist_chain_status is granted to authenticated", () => {
      expect(sql).toContain(
        "grant execute on function public.verify_and_persist_chain_status(uuid) to authenticated",
      );
    });
  });

  describe("E/F. explain_property_balance RPC", () => {
    it("defines explain_property_balance with property_id parameter", () => {
      expect(sql).toContain("explain_property_balance");
      expect(sql).toContain("p_property_id uuid");
      expect(sql).toContain("returns jsonb");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fn).not.toBeNull();
    });

    it("calls provenance_accrue_rent_charges before projecting (on-read accrual)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const accrualCall = body.indexOf("provenance_accrue_rent_charges");
      const projectionCall = body.indexOf("provenance_balance_projection");
      expect(accrualCall).toBeGreaterThan(-1);
      expect(accrualCall).toBeLessThan(projectionCall);
    });

    it("uses head-based freshness check with verify_and_persist fallback", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      expect(body).toContain("get_provenance_chain_head(v_account_id)");
      expect(body).toContain("provenance_chain_status");
      expect(body).toContain("verify_and_persist_chain_status(v_account_id)");
    });

    it("runs accrual BEFORE freshness check (not after)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const accrualPos = body.indexOf("provenance_accrue_rent_charges");
      const freshnessPos = body.indexOf("get_provenance_chain_head");
      expect(accrualPos).toBeGreaterThan(-1);
      expect(freshnessPos).toBeGreaterThan(accrualPos);
    });

    it("calls verify_provenance_anchor for anchor consistency", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("verify_provenance_anchor(v_account_id)");
    });

    it("auto-anchors when chain is valid but no anchor exists", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_chain_is_valid is true and not coalesce(v_anchor.has_anchor, false)");
      expect(fn[0]).toContain("anchor_provenance_chain(v_account_id)");
    });

    it("returns all required response sections", () => {
      for (const section of [
        "'balance'",
        "'events'",
        "'legacy_reconciliation'",
        "'chain_verification'",
        "'anchor_consistency'",
        "'badge_state'",
        "'export_allowed'",
        "'safe_user_message'",
        "'notices'",
      ]) {
        expect(sql).toContain(section);
      }
    });

    it("returns balance with display_balance_minor and display_basis", () => {
      expect(sql).toContain("'display_balance_minor'");
      expect(sql).toContain("'provenance_balance_minor'");
      expect(sql).toContain("'legacy_balance_minor'");
      expect(sql).toContain("'display_basis'");
    });

    it("is granted to authenticated but revoked from public", () => {
      expect(sql).toContain(
        "grant execute on function public.explain_property_balance(uuid) to authenticated",
      );
      expect(sql).toContain(
        "revoke all on function public.explain_property_balance(uuid)",
      );
    });
  });

  describe("J. badge state computation", () => {
    it("computes all five badge states", () => {
      for (const badge of [
        "verified",
        "verified_unanchored",
        "reconciliation_warning",
        "issue",
      ]) {
        expect(sql).toContain(`'${badge}'`);
      }
    });

    it("sets badge to issue when chain verification fails", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_chain_is_valid is not true");
    });

    it("sets badge to issue when anchor is inconsistent", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_anchor.anchor_consistent is not true");
    });

    it("sets badge to reconciliation_warning for unexplained divergence", () => {
      expect(sql).toContain("'reconciliation_warning'");
      expect(sql).toContain("'unexplained_divergence'");
    });

    it("sets badge to verified_unanchored when chain valid but no anchor", () => {
      expect(sql).toContain("'verified_unanchored'");
    });
  });

  describe("K. client payload safety", () => {
    it("uses safe_user_message instead of exposing raw failure details", () => {
      expect(sql).toContain("'safe_user_message'");
      expect(sql).toContain(
        "A verification check found an inconsistency. Our team has been notified.",
      );
    });

    it("does not expose raw chain verification failure details in returned payload", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const returnPayload = fn[0].match(/return jsonb_build_object\([\s\S]*?\);/);
      expect(returnPayload).not.toBeNull();
      expect(returnPayload[0]).not.toContain("first_broken_sequence");
      expect(returnPayload[0]).not.toContain("first_broken_reason");
    });

    it("blocks export for issue and reconciliation_warning badges", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const issueExport = body.match(/v_badge_state := 'issue'[\s\S]*?v_export_allowed := false/);
      const warningExport = body.match(/v_badge_state := 'reconciliation_warning'[\s\S]*?v_export_allowed := false/);
      expect(issueExport).not.toBeNull();
      expect(warningExport).not.toBeNull();
    });
  });

  describe("L. runtime integrity fixes", () => {
    const eventsSql = readSource("supabase/provenance_events.sql");
    const persistFn = () => sql.match(
      /create or replace function public\.verify_and_persist_chain_status\b[\s\S]*?\$\$;/,
    );

    it("verify_and_persist requires authentication", () => {
      expect(persistFn()).not.toBeNull();
      expect(persistFn()[0]).toContain("authentication required");
    });

    it("verify_and_persist authorizes owner, admin, and staff", () => {
      expect(persistFn()[0]).toContain("array['owner', 'admin', 'staff']");
    });

    it("verify_and_persist takes the same advisory lock as ledger writers", () => {
      expect(persistFn()[0]).toContain("pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0)");
    });

    it("verify_and_persist captures head before and after, rejects on change", () => {
      expect(persistFn()[0]).toContain("v_head_before");
      expect(persistFn()[0]).toContain("v_head_after");
      expect(persistFn()[0]).toContain("chain head changed during verification");
    });

    it("verify_and_persist calls internal verifier (not public)", () => {
      expect(persistFn()[0]).toContain("_verify_provenance_chain_internal");
      expect(persistFn()[0]).not.toContain("verify_provenance_chain(p_account_id)");
    });

    it("explain_property_balance takes the writer advisory lock before freshness check", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const lockPos = body.indexOf("pg_advisory_xact_lock(hashtext('provenance:' || v_account_id::text), 0)");
      const headPos = body.indexOf("get_provenance_chain_head(v_account_id)");
      expect(lockPos).toBeGreaterThan(-1);
      expect(headPos).toBeGreaterThan(lockPos);
    });

    it("internal verifier exists and is revoked from all API roles", () => {
      expect(eventsSql).toContain("_verify_provenance_chain_internal");
      expect(eventsSql).toContain(
        "revoke all on function public._verify_provenance_chain_internal(uuid)",
      );
    });

    it("public verify_provenance_chain delegates to internal verifier after auth", () => {
      const fn = eventsSql.match(
        /create or replace function public\.verify_provenance_chain[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("account owner or admin role required");
      expect(fn[0]).toContain("_verify_provenance_chain_internal");
    });

    it("projection includes metadata in event JSON for scanner access", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'metadata', e.metadata");
    });

    it("cache freshness checks both head_sequence and head_hash", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const cacheBlock = fn[0].match(
        /v_status\.head_sequence is not distinct from[\s\S]*?v_status\.head_hash is not distinct from/,
      );
      expect(cacheBlock).not.toBeNull();
    });

    it("bulk activation script calls the atomic RPC with auth context", () => {
      const script = readSource("scripts/activateAllProvenanceCutovers.js");
      expect(script).toContain("activate_provenance_cutover");
      expect(script).toContain("result?.activated");
      expect(script).toContain("result?.reason");
    });

    it("bulk activation script reads response shape correctly (activated/reason, not status)", () => {
      const script = readSource("scripts/activateAllProvenanceCutovers.js");
      expect(script).not.toContain("result?.status");
      expect(script).not.toContain('result.status');
    });

    it("bulk activation script uses ephemeral client for verifyOtp (not admin)", () => {
      const script = readSource("scripts/activateAllProvenanceCutovers.js");
      expect(script).not.toMatch(/admin\.auth\.verifyOtp/);
      expect(script).toContain("ephemeral");
    });
  });

  describe("O. internal alerts (observability)", () => {
    it("logs chain verification failure via log_security_event", () => {
      expect(sql).toContain("'provenance.chain_verification_failure'");
      expect(sql).toContain("log_security_event");
    });

    it("logs anchor mismatch via log_security_event", () => {
      expect(sql).toContain("'provenance.anchor_mismatch'");
    });

    it("logs unexplained divergence via log_security_event", () => {
      expect(sql).toContain("'provenance.unexplained_divergence'");
    });
  });

  describe("Part 3. lease-end accrual notices and data-hygiene alerts", () => {
    it("scans projected events for accrual_continues_past_lease_end_date", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("accrual_continues_past_lease_end_date");
    });

    it("builds a notices array with type lease_end_accrual", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'lease_end_accrual'");
      expect(fn[0]).toContain("v_notices");
    });

    it("deduplicates notices per lease_id (one notice per lease)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_seen_leases");
      expect(fn[0]).toContain("v_ev_lease_id = any(v_seen_leases)");
    });

    it("fires upsert_security_anomaly_alert for lease-end accrual (data-hygiene)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("upsert_security_anomaly_alert");
      expect(fn[0]).toContain("'provenance.lease_end_accrual'");
    });

    it("anomaly alert severity is action (not urgent)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const alertCall = fn[0].match(
        /upsert_security_anomaly_alert\([\s\S]*?'provenance\.lease_end_accrual'[\s\S]*?'action'/,
      );
      expect(alertCall).not.toBeNull();
    });

    it("includes notices in the response payload", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const returnPayload = fn[0].match(/return jsonb_build_object\([\s\S]*?\);/);
      expect(returnPayload).not.toBeNull();
      expect(returnPayload[0]).toContain("'notices'");
    });

    it("notice includes property_id, lease_id, period_key, and user-facing message", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      for (const key of [
        "'property_id'",
        "'lease_id'",
        "'period_key'",
        "'message'",
      ]) {
        expect(fn[0]).toContain(key);
      }
      expect(fn[0]).toContain("Review the lease status or record a renewal");
    });

    it("does NOT implement reversal or correction of post-end events", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).not.toMatch(/delete\s+from\s+.*provenance_events/i);
      expect(fn[0]).not.toMatch(/update\s+.*provenance_events/i);
      expect(fn[0]).not.toContain("reversal_of_event_id");
    });
  });

  describe("self-serve cutover activation", () => {
    it("defines activate_provenance_cutover with account_id parameter", () => {
      expect(sql).toContain("activate_provenance_cutover");
      expect(sql).toContain("p_account_id uuid");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fn).not.toBeNull();
    });

    it("requires owner or admin role (not staff)", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("array['owner', 'admin']");
      expect(fn[0]).not.toContain("'staff'");
    });

    it("is idempotent — returns already_active for existing cutover", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'already_active'");
    });

    it("inserts cutover row, runs backfill, and anchors the chain", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("insert into public.provenance_finance_cutover");
      expect(fn[0]).toContain("provenance_finance_backfill(p_account_id)");
      expect(fn[0]).toContain("anchor_provenance_chain(p_account_id)");
    });

    it("classifies activated cutovers as legacy migrated", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("set account_provenance_mode = 'legacy_migrated'");
    });

    it("preserves cutover existence before updating the account mode", () => {
      const fn = sql.match(
        /create or replace function public\.activate_provenance_cutover[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_has_existing_cutover := found");
      expect(fn[0]).toContain("if v_has_existing_cutover then");
    });

    it("is granted to authenticated but revoked from public", () => {
      expect(sql).toContain(
        "grant execute on function public.activate_provenance_cutover(uuid) to authenticated",
      );
      expect(sql).toContain(
        "revoke all on function public.activate_provenance_cutover(uuid)",
      );
    });
  });

  describe("Sprint 2C. Balance Evidence Summary backend contracts", () => {
    const fn = () =>
      sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );

    describe("2C-1. label resolution", () => {
      it("resolves account_label from accounts.name", () => {
        expect(fn()[0]).toContain("v_account_label");
        expect(fn()[0]).toContain("select a.name, a.account_provenance_mode");
      });

      it("resolves property_label from properties.address", () => {
        expect(fn()[0]).toContain("v_property_label");
        expect(fn()[0]).toContain("select p.address into v_property_label");
      });

      it("resolves tenant_label from tenants.name", () => {
        expect(fn()[0]).toContain("v_tenant_label");
        expect(fn()[0]).toContain("select tn.name into v_tenant_label");
      });

      it("resolves lease_label from lease dates", () => {
        expect(fn()[0]).toContain("v_lease_label");
      });

      it("returns all four labels in response payload", () => {
        const returnPayload = fn()[0].match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        for (const key of [
          "'account_label'",
          "'property_label'",
          "'tenant_label'",
          "'lease_label'",
        ]) {
          expect(returnPayload[0]).toContain(key);
        }
      });
    });

    describe("2C-2. event_contribution_total_minor", () => {
      it("accumulates v_event_total from contribution_minor", () => {
        expect(fn()[0]).toContain("v_event_total");
        expect(fn()[0]).toContain("contribution_minor");
      });

      it("returns event_contribution_total_minor in response payload", () => {
        const returnPayload = fn()[0].match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        expect(returnPayload[0]).toContain("'event_contribution_total_minor'");
      });
    });

    describe("2C-3. reconciliation bridge lines", () => {
      it("builds v_bridge_lines array for legacy_compatible display basis", () => {
        expect(fn()[0]).toContain("v_bridge_lines");
        expect(fn()[0]).toContain("legacy_compatible");
      });

      it("returns reconciliation_bridge_lines in response payload", () => {
        const returnPayload = fn()[0].match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        expect(returnPayload[0]).toContain("'reconciliation_bridge_lines'");
      });
    });

    describe("2C-4. head reference in chain_verification", () => {
      it("returns head_sequence in chain_verification object", () => {
        expect(fn()[0]).toContain("'head_sequence'");
      });

      it("returns head_hash in chain_verification object", () => {
        expect(fn()[0]).toContain("'head_hash'");
      });
    });

    describe("2C-5. anchor_hash in anchor_consistency", () => {
      it("returns anchor_hash in anchor_consistency object", () => {
        expect(fn()[0]).toContain("'anchor_hash'");
      });
    });

    describe("2C-6. evidence flags in response", () => {
      it("returns accrued_past_lease_end boolean", () => {
        const returnPayload = fn()[0].match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        expect(returnPayload[0]).toContain("'accrued_past_lease_end'");
      });

      it("returns has_reconstructed boolean", () => {
        const returnPayload = fn()[0].match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        expect(returnPayload[0]).toContain("'has_reconstructed'");
      });

      it("sets v_has_reconstructed when event is reconstructed", () => {
        expect(fn()[0]).toContain("v_has_reconstructed := true");
      });

      it("sets v_accrued_past_lease_end when event has lease-end flag", () => {
        expect(fn()[0]).toContain("v_accrued_past_lease_end := true");
      });
    });

    describe("2C-7. export gating prevents export on bad states", () => {
      it("sets export_allowed to false for issue badge state", () => {
        const body = fn()[0];
        const issueBlock = body.match(/v_badge_state := 'issue'[\s\S]*?v_export_allowed := false/);
        expect(issueBlock).not.toBeNull();
      });

      it("sets export_allowed to false for reconciliation_warning badge state", () => {
        const body = fn()[0];
        const warningBlock = body.match(
          /v_badge_state := 'reconciliation_warning'[\s\S]*?v_export_allowed := false/,
        );
        expect(warningBlock).not.toBeNull();
      });
    });

    describe("2C.1 provenance mode and assurance model", () => {
      it("returns the account provenance mode", () => {
        expect(fn()[0]).toContain("'provenance_mode', v_provenance_mode");
      });

      it("runs legacy reconciliation only for migrated accounts", () => {
        expect(fn()[0]).toMatch(
          /if v_is_legacy_migrated then[\s\S]*?provenance_reconciliation_gate/,
        );
      });

      it("returns no legacy reconciliation object for native accounts", () => {
        expect(fn()[0]).toMatch(
          /'legacy_reconciliation', case[\s\S]*?when v_is_legacy_migrated[\s\S]*?else null/,
        );
      });

      it("returns separate ledger, reconciliation, and reliability statuses", () => {
        const body = fn()[0];
        expect(body).toContain("'assurance', jsonb_build_object");
        expect(body).toContain("'ledger_integrity'");
        expect(body).toContain("'internal_reconciliation'");
        expect(body).toContain("'balance_reliability'");
      });

      it("marks native reconciliation as not applicable", () => {
        expect(fn()[0]).toContain(
          "when not v_is_legacy_migrated then 'not_applicable'",
        );
      });

      it("normalizes gate statuses to assurance vocabulary for reconciliation", () => {
        const body = fn()[0];
        expect(body).toContain("= 'matched' then 'passed'");
        expect(body).toContain("= 'explained_divergence' then 'caution_required'");
        expect(body).toContain("= 'unexplained_divergence' then 'failed'");
      });
    });
  });

  describe("Sprint 2C. Balance Evidence Summary frontend contracts", () => {
    const readUI = (path) => readSource(path);
    const pageSrc = readUI("src/pages/provenance/BalanceEvidenceSummaryPage.jsx");
    const drawerSrc = readUI("src/components/provenance/ExplainBalanceDrawer.jsx");
    const routesSrc = readUI("src/routes/ManagerRoutes.jsx");
    const cssSrc = readUI("src/index.css");

    describe("2C-F1. page component exists and uses explain RPC", () => {
      it("imports explainPropertyBalance from service", () => {
        expect(pageSrc).toContain("explainPropertyBalance");
        expect(pageSrc).toContain("provenanceExplainService");
      });

      it("reads propertyId from route params", () => {
        expect(pageSrc).toContain("useParams");
        expect(pageSrc).toContain("propertyId");
      });

      it("renders summary title", () => {
        expect(pageSrc).toContain("Balance Evidence Summary");
        expect(pageSrc).toContain('data-testid="summary-title"');
      });

      it("renders generated-at timestamp", () => {
        expect(pageSrc).toContain('data-testid="generated-at"');
        expect(pageSrc).toContain("generated_at");
      });
    });

    describe("2C-F2. export gating in UI", () => {
      it("gates content on export_allowed", () => {
        expect(pageSrc).toContain("export_allowed");
        expect(pageSrc).toContain('data-testid="export-blocked-notice"');
      });

      it("shows safe_user_message when export blocked", () => {
        expect(pageSrc).toContain("safe_user_message");
      });
    });

    describe("2C-F3. label rendering", () => {
      it("renders account_label", () => {
        expect(pageSrc).toContain("account_label");
      });

      it("renders property_label", () => {
        expect(pageSrc).toContain("property_label");
      });

      it("renders tenant_label", () => {
        expect(pageSrc).toContain("tenant_label");
      });

      it("renders lease_label", () => {
        expect(pageSrc).toContain("lease_label");
      });
    });

    describe("2C-F4. arithmetic reconciliation section", () => {
      it("renders event contribution total", () => {
        expect(pageSrc).toContain('data-testid="event-total"');
        expect(pageSrc).toContain("event_contribution_total_minor");
      });

      it("renders bridge lines", () => {
        expect(pageSrc).toContain('data-testid="bridge-line"');
        expect(pageSrc).toContain("reconciliation_bridge_lines");
      });

      it("renders reconciled display balance", () => {
        expect(pageSrc).toContain('data-testid="reconciled-display-balance"');
      });

      it("has an arithmetic-reconciliation section", () => {
        expect(pageSrc).toContain('data-testid="arithmetic-reconciliation"');
      });
    });

    describe("2C-F5. event timeline", () => {
      it("renders event rows with contributions", () => {
        expect(pageSrc).toContain('data-testid="event-row"');
        expect(pageSrc).toContain('data-testid="event-contribution"');
      });

      it("renders event timeline section", () => {
        expect(pageSrc).toContain('data-testid="event-timeline"');
      });

      it("shows reconstructed badge for reconstructed events", () => {
        expect(pageSrc).toContain("reconstructed");
      });

      it("dims reversed/superseded events", () => {
        expect(pageSrc).toContain("reversed");
        expect(pageSrc).toContain("superseded");
        expect(pageSrc).toContain("opacity-60");
      });
    });

    describe("2C-F6. chain verification and anchor blocks", () => {
      it("renders chain verification block with head reference", () => {
        expect(pageSrc).toContain('data-testid="chain-verification-block"');
        expect(pageSrc).toContain('data-testid="head-sequence"');
        expect(pageSrc).toContain('data-testid="head-hash"');
      });

      it("renders anchor block with anchor hash", () => {
        expect(pageSrc).toContain('data-testid="anchor-block"');
        expect(pageSrc).toContain('data-testid="anchor-hash"');
      });

      it("handles no-anchor state", () => {
        expect(pageSrc).toContain('data-testid="no-anchor"');
      });
    });

    describe("2C-F7. required notices", () => {
      it("renders lease-end accrual notice when flag set", () => {
        expect(pageSrc).toContain('data-testid="lease-end-notice"');
        expect(pageSrc).toContain("accrued_past_lease_end");
      });

      it("renders reconstructed history notice when flag set", () => {
        expect(pageSrc).toContain('data-testid="reconstructed-notice"');
        expect(pageSrc).toContain("has_reconstructed");
      });

      it("renders internal anchoring limitation notice", () => {
        expect(pageSrc).toContain('data-testid="anchoring-limitation-notice"');
        expect(pageSrc).toContain("not external legal certification");
      });

      it("renders export limitations disclaimer", () => {
        expect(pageSrc).toContain('data-testid="export-limitations"');
        expect(pageSrc).toContain("does not constitute independently audited");
      });
    });

    describe("2C-F8. assurance wording", () => {
      it("renders three separate assurance statuses", () => {
        expect(pageSrc).toContain('data-testid="assurance-status"');
        expect(pageSrc).toContain("Ledger integrity");
        expect(pageSrc).toContain("Internal reconciliation");
        expect(pageSrc).toContain("Balance reliability");
      });

      it("renders verification status text", () => {
        expect(pageSrc).toContain('data-testid="verification-status"');
      });
    });

    describe("2C.1 native and migrated presentation", () => {
      it("switches presentation using provenance_mode", () => {
        expect(pageSrc).toContain('data.provenance_mode === "legacy_migrated"');
      });

      it("uses Balance Summary for native accounts", () => {
        expect(pageSrc).toContain('"Balance Summary"');
      });

      it("gates migration-only notices and bridge lines", () => {
        expect(pageSrc).toContain("isLegacyMigrated && data.has_reconstructed");
        expect(pageSrc).toContain("isLegacyMigrated && bridgeLines.length > 0");
        expect(pageSrc).toContain("Legacy formula result");
      });
    });

    describe("2C-F9. print support", () => {
      it("has a print button calling window.print()", () => {
        expect(pageSrc).toContain("window.print()");
        expect(pageSrc).toContain("Printer");
      });

      it("uses print: utility classes for layout", () => {
        expect(pageSrc).toContain("print:hidden");
        expect(pageSrc).toContain("print:max-w-none");
      });

      it("adds body class for print mode to hide app shell", () => {
        expect(pageSrc).toContain("balance-evidence-print-mode");
        expect(pageSrc).toContain("document.body.classList.add");
        expect(pageSrc).toContain("document.body.classList.remove");
      });

      it("hides sidebar, topbar, nav, and mobile bottom nav in print", () => {
        expect(pageSrc).toContain("balance-evidence-print-mode aside");
        expect(pageSrc).toContain('MobileBottomNav');
        expect(pageSrc).toContain('Sidebar');
      });

      it("forces light document surface in dark mode", () => {
        expect(pageSrc).toContain("dark:bg-white");
        expect(pageSrc).toContain("dark:text-slate-950");
        expect(pageSrc).toContain(".dark .balance-evidence-summary");
      });
    });

    describe("2C-F10. print CSS", () => {
      it("defines balance-evidence-summary print styles", () => {
        expect(cssSrc).toContain(".balance-evidence-summary");
        expect(cssSrc).toContain("@media print");
      });

      it("sets print-color-adjust for exact colour reproduction", () => {
        expect(cssSrc).toContain("print-color-adjust: exact");
      });

      it("uses break-inside-avoid and break-after-avoid classes", () => {
        expect(cssSrc).toContain(".break-after-avoid");
        expect(cssSrc).toContain(".break-inside-avoid");
      });

      it("defines @page margin and counter", () => {
        expect(cssSrc).toContain("@page");
        expect(cssSrc).toContain("counter(page)");
      });

      it("repeats table headers across pages", () => {
        expect(cssSrc).toContain("table-header-group");
      });
    });

    describe("2C-F11. route registration", () => {
      it("lazy-imports BalanceEvidenceSummaryPage", () => {
        expect(routesSrc).toContain("BalanceEvidenceSummaryPage");
        expect(routesSrc).toContain("pages/provenance/BalanceEvidenceSummaryPage");
      });

      it("registers route at properties/:propertyId/balance-evidence", () => {
        expect(routesSrc).toContain("properties/:propertyId/balance-evidence");
      });
    });

    describe("2C-F12. drawer link to evidence summary", () => {
      it("imports Link from react-router-dom", () => {
        expect(drawerSrc).toContain('import { Link } from "react-router-dom"');
      });

      it("links to /properties/:propertyId/balance-evidence", () => {
        expect(drawerSrc).toContain("/balance-evidence");
      });

      it("only shows link when export_allowed is true", () => {
        expect(drawerSrc).toContain("export_allowed");
      });

      it("imports FileText icon for the evidence summary link", () => {
        expect(drawerSrc).toContain("FileText");
      });
    });

    describe("2C-F13. footer with generated timestamp", () => {
      it("renders summary footer", () => {
        expect(pageSrc).toContain('data-testid="summary-footer"');
      });

      it("repeats generated_at in footer", () => {
        expect(pageSrc).toContain('data-testid="footer-generated-at"');
      });
    });
  });

  describe("overlay registration", () => {
    it("is registered in dbApplyRepoSql.js after cutover and before hardening", () => {
      const applyScript = readSource("scripts/dbApplyRepoSql.js");
      expect(applyScript).toContain(
        '"migrations/20260622000000_provenance_hash_chain_backfill.sql",\n  "provenance_finance_cutover.sql",\n  "provenance_explain_balance.sql",\n  "supabase_linter_security_hardening.sql"',
      );
    });

    it("is registered in dbBootstrap.js", () => {
      const bootstrapScript = readSource("scripts/dbBootstrap.js");
      expect(bootstrapScript).toContain("provenance_explain_balance.sql");
    });
  });
});
