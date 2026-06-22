import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance explain balance unit tests (Sprint 2B)", () => {
  const sql = readSource("supabase/provenance_explain_balance.sql");

  describe("period breakdown produces correct period enumeration", () => {
    it("period_start = rent_start_date + (idx - 1) months", () => {
      expect(sql).toContain(
        "(fa.rent_start_date + ((gs.idx - 1) || ' months')::interval)::date as period_start",
      );
    });

    it("period_end = rent_start_date + idx months - 1 day", () => {
      expect(sql).toContain(
        "(fa.rent_start_date + (gs.idx || ' months')::interval - interval '1 day')::date as period_end",
      );
    });

    it("period_key = YYYY-MM format from period_start", () => {
      expect(sql).toContain(
        "to_char(fa.rent_start_date + ((gs.idx - 1) || ' months')::interval, 'YYYY-MM')",
      );
    });

    it("period count equals months_elapsed from shared helper (no drift)", () => {
      expect(sql).toContain("generate_series(1, fa.months_elapsed)");
    });

    it("each period carries rent_minor_used from the shared helper", () => {
      expect(sql).toContain("fa.rent_minor_used as rent_minor");
    });

    it("supports optional property_id filter", () => {
      expect(sql).toContain(
        "p_property_id is null or fa.property_id = p_property_id",
      );
    });
  });

  describe("forward accrual cutover seam (B4)", () => {
    it("reads stored months_elapsed from obligation snapshot metadata", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain(
        "(e.metadata ->> 'months_elapsed')::integer",
      );
    });

    it("skips periods 1..N where N = snapshot months_elapsed", () => {
      expect(sql).toContain(
        "if v_period.period_index <= v_snapshot_months then",
      );
    });

    it("skips properties without an obligation snapshot", () => {
      expect(sql).toContain("if v_snapshot_months is null then");
    });

    it("emits rent.charged starting from period N+1", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const skipCheck = body.indexOf("v_period.period_index <= v_snapshot_months");
      const insertCheck = body.indexOf("insert into public.provenance_events", skipCheck);
      expect(skipCheck).toBeGreaterThan(-1);
      expect(insertCheck).toBeGreaterThan(skipCheck);
    });
  });

  describe("forward accrual idempotency", () => {
    it("idempotency key includes account, property, period_key, and cutover_version", () => {
      expect(sql).toContain(
        "'live:rent.charged:' || p_account_id::text || ':' || v_period.property_id::text || ':' || v_period.period_key || ':' || v_cutover.cutover_version::text",
      );
    });

    it("checks for existing event BEFORE allocating sequence number", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_accrue_rent_charges[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];

      const existingCheck = body.indexOf("if v_existing_event_id is not null then");
      const counterAlloc = body.indexOf("insert into public.provenance_event_counters", existingCheck);
      expect(existingCheck).toBeGreaterThan(-1);
      expect(existingCheck).toBeLessThan(counterAlloc);
    });

    it("uses advisory lock for sequence allocation", () => {
      expect(sql).toContain(
        "pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0)",
      );
    });
  });

  describe("rent.charged event metadata completeness", () => {
    it("records charge_period_start and charge_period_end", () => {
      expect(sql).toContain("'charge_period_start', v_period.period_start");
      expect(sql).toContain("'charge_period_end', v_period.period_end");
    });

    it("records accrual_basis as finance_snapshot_compatible", () => {
      expect(sql).toContain("'finance_snapshot_compatible'");
    });

    it("records source as monthly_accrual", () => {
      expect(sql).toContain("'monthly_accrual'");
    });

    it("records lease_id and property_id", () => {
      expect(sql).toContain("'lease_id', v_lease_id");
      expect(sql).toContain("'property_id', v_period.property_id");
    });

    it("records generated_as_of as current_date", () => {
      expect(sql).toContain("'generated_as_of', current_date");
    });
  });

  describe("balance projection rent.charged contribution rules", () => {
    it("rent.charged contributes +amount_minor (debit, like obligation snapshot)", () => {
      expect(sql).toContain(
        "when re.event_type = 'rent.charged' then coalesce(re.amount_minor, 0)",
      );
    });

    it("rent.charged signed_amount_minor is positive", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const signedSection = fn[0].match(
        /case\s[\s\S]*?end as signed_amount_minor/,
      );
      expect(signedSection).not.toBeNull();
      expect(signedSection[0]).toContain("rent.charged");
      expect(signedSection[0]).toContain("coalesce(re.amount_minor, 0)");
    });

    it("obligation snapshot contribution rule is unchanged", () => {
      expect(sql).toContain(
        "when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)",
      );
    });

    it("payment.marked_paid contribution rule is unchanged", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.marked_paid' then -coalesce(re.amount_minor, 0)",
      );
    });
  });

  describe("reconciliation gate post_cutover_rent_change detection", () => {
    it("compares snapshot rent to current legacy rent", () => {
      expect(sql).toContain("snap_rent_minor");
      expect(sql).toContain("legacy_rent_minor");
      expect(sql).toContain("c.snap_rent_minor <> c.legacy_rent_minor");
    });

    it("reads snapshot rent from obligation event metadata", () => {
      expect(sql).toContain("(e.metadata ->> 'rent_minor_used')::bigint as snap_rent_minor");
    });

    it("classifies rent change as explained_divergence, not unexplained", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_reconciliation_gate[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const rentChangeClassification = body.match(
        /snap_rent_minor.*legacy_rent_minor[\s\S]*?then 'explained_divergence'/,
      );
      expect(rentChangeClassification).not.toBeNull();
    });

    it("sets display_basis to legacy_compatible for rent change divergence", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_reconciliation_gate[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const rentChangeDisplay = body.match(
        /snap_rent_minor.*legacy_rent_minor[\s\S]*?then 'legacy_compatible'/,
      );
      expect(rentChangeDisplay).not.toBeNull();
    });
  });

  describe("anchoring hash chain integrity", () => {
    it("anchor hash input is account_id:head_sequence:head_hash:event_count", () => {
      expect(sql).toContain(
        "p_account_id::text || ':' || v_head_sequence::text || ':' || v_head_hash || ':' || v_checked_count::text",
      );
    });

    it("uses extensions.digest for SHA-256 (pgcrypto in extensions schema)", () => {
      expect(sql).toContain("extensions.digest(");
    });

    it("reads head_hash and head_sequence from event_counters", () => {
      const fn = sql.match(
        /create or replace function public\.anchor_provenance_chain[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("provenance_event_counters");
      expect(fn[0]).toContain("c.head_hash");
      expect(fn[0]).toContain("c.next_sequence - 1");
    });

    it("refuses to anchor a chain with zero events", () => {
      expect(sql).toContain("'no events to anchor'");
    });
  });

  describe("verify_provenance_anchor consistency check", () => {
    it("fetches the event at the anchor head_sequence", () => {
      const fn = sql.match(
        /create or replace function public\.verify_provenance_anchor[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("e.sequence_number = v_anchor.head_sequence");
    });

    it("compares event_hash to anchor head_hash", () => {
      const fn = sql.match(
        /create or replace function public\.verify_provenance_anchor[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_event_hash = v_anchor.head_hash");
    });

    it("returns has_anchor=false when no anchor exists", () => {
      expect(sql).toContain("false, null::boolean");
    });

    it("counts events after anchor for staleness reporting", () => {
      expect(sql).toContain("v_current_seq");
      expect(sql).toContain("v_anchor.head_sequence");
    });
  });

  describe("explain_property_balance display basis logic", () => {
    it("uses legacy balance for legacy_compatible display basis", () => {
      expect(sql).toContain(
        "v_display_balance := coalesce(v_gate.legacy_balance_minor, 0)",
      );
    });

    it("uses provenance balance for provenance display basis", () => {
      expect(sql).toContain(
        "v_display_balance := coalesce(v_projection.balance_minor, 0)",
      );
    });

    it("defaults to provenance when display_basis is not set", () => {
      expect(sql).toContain(
        "coalesce(v_gate.display_basis, 'provenance')",
      );
    });
  });

  describe("explain_property_balance security", () => {
    it("requires authentication", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'authentication required'");
    });

    it("requires operator role", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'account operator role required'");
    });

    it("looks up account_id from property, not from parameter", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("select p.account_id into v_account_id");
      expect(fn[0]).toContain("from public.properties p");
    });

    it("raises if property not found", () => {
      expect(sql).toContain("'property not found'");
    });
  });

  describe("anchoring table security", () => {
    it("revokes all from public/anon/authenticated on anchors table", () => {
      expect(sql).toContain(
        "revoke all on table public.provenance_chain_anchors from public, anon, authenticated",
      );
    });

    it("grants only select to authenticated", () => {
      expect(sql).toContain(
        "grant select on table public.provenance_chain_anchors to authenticated",
      );
    });

    it("anchoring RPCs require owner or admin role", () => {
      const anchorFn = sql.match(
        /create or replace function public\.anchor_provenance_chain[\s\S]*?\$\$;/,
      );
      expect(anchorFn).not.toBeNull();
      expect(anchorFn[0]).toContain("account owner or admin role required for anchoring");
    });
  });
});
