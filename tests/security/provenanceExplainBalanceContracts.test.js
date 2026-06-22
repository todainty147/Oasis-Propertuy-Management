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
      expect(sql).toContain("v_cutover.cutover_version::text");
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

    it("skips accounts without active cutover", () => {
      expect(sql).toContain("'no active cutover'");
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

    it("calls verify_provenance_chain for chain verification", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("verify_provenance_chain(v_account_id)");
    });

    it("calls verify_provenance_anchor for anchor consistency", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("verify_provenance_anchor(v_account_id)");
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
      expect(fn[0]).toContain("v_chain.is_valid is not true");
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

  describe("overlay registration", () => {
    it("is registered in dbApplyRepoSql.js after cutover and before hardening", () => {
      const applyScript = readSource("scripts/dbApplyRepoSql.js");
      expect(applyScript).toContain(
        '"provenance_finance_cutover.sql",\n  "provenance_explain_balance.sql",\n  "supabase_linter_security_hardening.sql"',
      );
    });

    it("is registered in dbBootstrap.js", () => {
      const bootstrapScript = readSource("scripts/dbBootstrap.js");
      expect(bootstrapScript).toContain("provenance_explain_balance.sql");
    });
  });
});
