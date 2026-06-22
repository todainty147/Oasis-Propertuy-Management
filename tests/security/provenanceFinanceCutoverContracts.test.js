import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance finance cutover contracts", () => {
  const sql = readSource("supabase/provenance_finance_cutover.sql");

  describe("account provenance mode", () => {
    it("classifies existing accounts as migrated and new accounts as native", () => {
      expect(sql).toContain("add column if not exists account_provenance_mode text");
      expect(sql).toContain("set account_provenance_mode = 'legacy_migrated'");
      expect(sql).toContain("alter column account_provenance_mode set default 'native'");
    });

    it("constrains provenance mode to migrated or native", () => {
      expect(sql).toContain(
        "check (account_provenance_mode in ('legacy_migrated', 'native'))",
      );
    });
  });

  describe("A. cutover config table", () => {
    it("defines the per-account cutover table with required columns", () => {
      for (const fragment of [
        "provenance_finance_cutover",
        "account_id uuid not null",
        "cutover_at timestamptz not null",
        "cutover_version integer not null default 1",
        "status text not null default 'draft'",
        "created_at timestamptz not null default now()",
        "created_by uuid",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("constrains status to draft/reconciled/active", () => {
      expect(sql).toContain("('draft', 'reconciled', 'active')");
    });

    it("enforces one cutover per account", () => {
      expect(sql).toContain("provenance_finance_cutover_account_unique");
      expect(sql).toContain("unique (account_id)");
    });

    it("enables RLS and restricts to owner/admin", () => {
      expect(sql).toContain(
        "alter table public.provenance_finance_cutover enable row level security",
      );
      expect(sql).toContain("provenance_finance_cutover_select_operators");
      expect(sql).toContain("array['owner', 'admin']");
    });

    it("revokes direct access from API roles", () => {
      expect(sql).toContain(
        "revoke all on table public.provenance_finance_cutover from public, anon, authenticated",
      );
      expect(sql).toContain(
        "grant select on table public.provenance_finance_cutover to authenticated",
      );
    });
  });

  describe("C. shared finance accumulation function", () => {
    it("defines finance_property_accumulation with correct return shape", () => {
      expect(sql).toContain("finance_property_accumulation");
      for (const col of [
        "property_id uuid",
        "months_elapsed integer",
        "rent_minor_used bigint",
        "rent_start_date date",
        "rent_start_source text",
        "total_paid_alltime bigint",
        "currency text",
        "remaining_clamped bigint",
      ]) {
        expect(sql).toContain(col);
      }
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      expect(sql).toContain("security definer");
      expect(sql).toContain("set search_path = public");
    });

    it("uses the same rent-start priority as finance_snapshot", () => {
      expect(sql).toContain("lease_start_date");
      expect(sql).toContain("earliest_payment_due_date");
      expect(sql).toContain("fallback_current_month");
    });

    it("uses the same months_elapsed formula as finance_snapshot", () => {
      expect(sql).toContain(
        "extract(year  from age(date_trunc('month', p_as_of)::date",
      );
      expect(sql).toContain("+ 1");
      expect(sql).toContain(
        "finance_property_accumulation_as_of(p_account_id, current_date)",
      );
    });

    it("converts to minor units (bigint)", () => {
      expect(sql).toContain("* 100)::bigint");
    });

    it("is revoked from API roles", () => {
      expect(sql).toContain(
        "revoke all on function public.finance_property_accumulation(uuid)",
      );
    });
  });

  describe("B. event vocabulary", () => {
    it("validates payment provenance event types", () => {
      for (const eventType of [
        "payment.recorded",
        "payment.marked_paid",
        "payment.reopened",
        "payment.voided",
        "payment.adjusted",
        "payment.deleted",
        "payment.marked_overdue",
        "finance.legacy_obligation_snapshot",
      ]) {
        expect(sql).toContain(`'${eventType}'`);
      }
    });

    it("rejects invalid event types", () => {
      expect(sql).toContain("invalid payment provenance event_type");
    });
  });

  describe("E. live instrumentation", () => {
    it("create_payment emits payment.recorded after cutover", () => {
      expect(sql).toContain("provenance_record_payment_event");
      expect(sql).toContain("'live:payment.recorded:'");
    });

    it("mark_payment_paid emits payment.marked_paid after cutover", () => {
      expect(sql).toContain("'live:payment.marked_paid:'");
    });

    it("mark_payment_unpaid emits payment.reopened after cutover", () => {
      expect(sql).toContain("'live:payment.reopened:'");
    });

    it("void_payment emits payment.voided after cutover", () => {
      expect(sql).toContain("'live:payment.voided:'");
    });

    it("update_payment emits payment.adjusted on amount change after cutover", () => {
      expect(sql).toContain("'live:payment.adjusted:'");
      expect(sql).toContain("old_amount_minor");
      expect(sql).toContain("new_amount_minor");
    });

    it("delete_payment emits payment.deleted after cutover", () => {
      expect(sql).toContain("'live:payment.deleted:'");
    });

    it("uses one shared activation predicate for all live payment events", () => {
      const activationChecks = sql.match(
        /if public\.provenance_finance_tracking_active\(/g,
      );
      expect(activationChecks).not.toBeNull();
      expect(activationChecks.length).toBeGreaterThanOrEqual(7);
    });

    it("activates native accounts immediately and migrated accounts after cutover", () => {
      expect(sql).toContain("a.account_provenance_mode = 'native'");
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("now() >= c.cutover_at");
      expect(sql).toContain(
        "revoke all on function public.provenance_finance_tracking_active(uuid)",
      );
    });
  });

  describe("D. backfill function", () => {
    it("defines provenance_finance_backfill with correct signature", () => {
      expect(sql).toContain("provenance_finance_backfill");
      expect(sql).toContain("p_account_id uuid");
      expect(sql).toContain("p_cutover_at timestamptz");
      expect(sql).toContain("returns jsonb");
    });

    it("classifies any backfilled account as legacy migrated", () => {
      const fn = sql.match(
        /create or replace function public\.provenance_finance_backfill[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("set account_provenance_mode = 'legacy_migrated'");
    });

    it("creates obligation snapshots from shared accumulation function", () => {
      expect(sql).toContain(
        "finance_property_accumulation(p_account_id)",
      );
      expect(sql).toContain("finance.legacy_obligation_snapshot");
    });

    it("stores GROSS expected obligation (pre-clamp) as amount_minor", () => {
      expect(sql).toContain(
        "(v_prop.months_elapsed::bigint * v_prop.rent_minor_used)::bigint",
      );
    });

    it("includes full derivation metadata in obligation snapshot", () => {
      for (const key of [
        "formula_name",
        "formula_version",
        "derivation",
        "months_elapsed",
        "rent_minor_used",
        "rent_source",
        "rent_start_date",
        "rent_start_date_source",
        "total_paid_alltime_at_cutover",
        "legacy_balance_source",
        "legacy_remaining_at_cutover",
        "cutover_at",
        "reconstructed",
        "backfill",
        "warning",
      ]) {
        expect(sql).toContain(`'${key}'`);
      }
    });

    it("includes the non-contemporaneous warning in metadata", () => {
      expect(sql).toContain(
        "This event reconstructs the legacy finance formula and is not a contemporaneous monthly charge record.",
      );
    });

    it("evaluates obligation snapshots at the requested cutover date", () => {
      expect(sql).toContain(
        "finance_property_accumulation_as_of(\n      p_account_id,\n      p_cutover_at::date",
      );
      expect(sql).toContain(
        "date_trunc('month', p_as_of)::date",
      );
    });

    it("creates payment.recorded for each existing payment", () => {
      expect(sql).toContain("'payment.recorded', 1");
      expect(sql).toContain("'backfill:payment.recorded:'");
    });

    it("creates payment.marked_paid for paid payments", () => {
      expect(sql).toContain("'payment.marked_paid', 1");
      expect(sql).toContain("'backfill:payment.marked_paid:'");
    });

    it("creates payment.voided for void payments", () => {
      expect(sql).toContain("'payment.voided', 1");
      expect(sql).toContain("'backfill:payment.voided:'");
    });

    it("marks all backfill events with reconstructed and backfill metadata", () => {
      const reconstructedTrue = sql.match(/'reconstructed', true/g);
      expect(reconstructedTrue).not.toBeNull();
      expect(reconstructedTrue.length).toBeGreaterThanOrEqual(4);

      const backfillTrue = sql.match(/'backfill', true/g);
      expect(backfillTrue).not.toBeNull();
      expect(backfillTrue.length).toBeGreaterThanOrEqual(4);
    });

    it("uses idempotency keys for all backfill events", () => {
      expect(sql).toContain("'backfill:payment.recorded:'");
      expect(sql).toContain("'backfill:payment.marked_paid:'");
      expect(sql).toContain("'backfill:payment.voided:'");
      expect(sql).toContain("'cutover:legacy_obligation:'");
    });

    it("uses actor_type=system for backfill events", () => {
      const systemActor = sql.match(
        /'system', null, 'system'/g,
      );
      expect(systemActor).not.toBeNull();
      expect(systemActor.length).toBeGreaterThanOrEqual(4);
    });

    it("uses source_type=backfill_payment for payment events", () => {
      expect(sql).toContain("'backfill_payment'");
    });

    it("uses source_type=backfill_legacy_formula for obligation snapshots", () => {
      expect(sql).toContain("'backfill_legacy_formula'");
    });

    it("is revoked from API roles", () => {
      expect(sql).toContain(
        "revoke all on function public.provenance_finance_backfill",
      );
    });

    it("returns a summary jsonb with counts", () => {
      expect(sql).toContain("'obligation_snapshots'");
      expect(sql).toContain("'payments_recorded'");
      expect(sql).toContain("'payments_marked_paid'");
      expect(sql).toContain("'payments_voided'");
    });
  });

  describe("G. idempotency", () => {
    it("live helper uses on conflict do nothing for concurrent safety", () => {
      const helper = sql.match(
        /create or replace function public\.provenance_record_payment_event[\s\S]*?\$\$;/,
      );
      expect(helper).not.toBeNull();
      expect(helper[0]).toContain("on conflict (account_id, idempotency_key)");
      expect(helper[0]).toContain("do nothing");
    });

    it("backfill checks idempotency key before allocating sequence numbers", () => {
      const backfill = sql.match(
        /create or replace function public\.provenance_finance_backfill[\s\S]*?\$\$;/,
      );
      expect(backfill).not.toBeNull();
      expect(backfill[0]).toContain("select id into v_existing_event_id");
      expect(backfill[0]).toContain("if v_existing_event_id is null then");
    });
  });

  describe("H. balance projection", () => {
    it("defines provenance_balance_projection with correct signature", () => {
      expect(sql).toContain("provenance_balance_projection");
      expect(sql).toContain("p_account_id uuid");
      expect(sql).toContain("p_property_id uuid default null");
    });

    it("requires authentication and operator role", () => {
      expect(sql).toContain("authentication required");
      expect(sql).toContain("account operator role required");
    });

    it("returns per-property balance, tenancy, currency, and events", () => {
      expect(sql).toContain("property_id uuid");
      expect(sql).toContain("tenancy_id uuid");
      expect(sql).toContain("balance_minor bigint");
      expect(sql).toContain("events jsonb");
    });

    it("payment.recorded contributes exactly 0 to balance", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.recorded' then 0::bigint",
      );
    });

    it("payment.marked_overdue contributes exactly 0 to balance", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.marked_overdue' then 0::bigint",
      );
    });

    it("obligation snapshot contributes positive to balance", () => {
      expect(sql).toContain(
        "when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)",
      );
    });

    it("payment.marked_paid contributes negative to balance", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.marked_paid' then -coalesce(re.amount_minor, 0)",
      );
    });

    it("payment.reopened contributes positive to balance (reverses credit)", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.reopened' then coalesce(re.amount_minor, 0)",
      );
    });

    it("includes treatment for every event", () => {
      for (const treatment of [
        "'reversed'",
        "'superseded'",
        "'informational'",
        "'reconstructed'",
        "'active'",
      ]) {
        expect(sql).toContain(treatment);
      }
    });

    it("selects the latest non-null tenancy without unsupported UUID aggregation", () => {
      expect(sql).toContain(
        "array_agg(e.ev_tenancy_id order by e.sequence_number desc)",
      );
      expect(sql).toContain("filter (where e.ev_tenancy_id is not null)");
      expect(sql).not.toContain("max(e.ev_tenancy_id)");
    });

    it("casts bigint aggregation back to the declared balance return type", () => {
      expect(sql).toContain("pp.balance::bigint as balance_minor");
    });

    it("includes reconstruction marker in event output", () => {
      expect(sql).toContain("'reconstructed'");
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

  describe("I. reconciliation gate", () => {
    it("defines provenance_reconciliation_gate with correct signature", () => {
      expect(sql).toContain("provenance_reconciliation_gate");
      expect(sql).toContain("p_account_id uuid");
    });

    it("requires owner or admin role", () => {
      expect(sql).toContain("account owner or admin role required");
    });

    it("compares legacy finance_snapshot remaining against provenance balance", () => {
      expect(sql).toContain("finance_property_accumulation(p_account_id)");
      expect(sql).toContain("provenance_balance_projection(p_account_id)");
    });

    it("returns per-property gate results with correct columns", () => {
      for (const col of [
        "legacy_balance_minor",
        "provenance_balance_minor",
        "difference_minor",
        "divergence_reason",
        "recommended_action",
      ]) {
        expect(sql).toContain(col);
      }
    });

    it("classifies overpayment as explained_divergence only when legacy is exactly zero", () => {
      expect(sql).toContain("'explained_divergence'");
      expect(sql).toContain("'overpayment_credit_clamp'");
      expect(sql).toContain(
        "when c.leg_balance = 0 and c.prov_bal < 0 then 'explained_divergence'",
      );
      expect(sql).not.toMatch(
        /leg_balance\s*>\s*0.*then\s+'explained_divergence'/,
      );
    });

    it("classifies currency mismatch as cannot_compare", () => {
      expect(sql).toContain("'cannot_compare'");
      expect(sql).toContain("'currency_mismatch'");
    });

    it("classifies matching balances as matched", () => {
      expect(sql).toContain("'matched'");
    });

    it("classifies unrecognized divergence as unexplained", () => {
      expect(sql).toContain("'unexplained_divergence'");
      expect(sql).toContain("'derivation_mismatch'");
    });

    it("includes recommended action for overpayment divergence", () => {
      expect(sql).toContain(
        "provenance shows tenant credit that legacy clamps to zero",
      );
    });

    it("is granted to authenticated but revoked from public", () => {
      expect(sql).toContain(
        "grant execute on function public.provenance_reconciliation_gate(uuid) to authenticated",
      );
    });
  });

  describe("overlay registration", () => {
    it("is registered in dbApplyRepoSql.js after provenance_events and before hardening", () => {
      const applyScript = readSource("scripts/dbApplyRepoSql.js");
      expect(applyScript).toContain(
        '"provenance_events.sql",\n  "migrations/20260622000000_provenance_hash_chain_backfill.sql",\n  "provenance_finance_cutover.sql",\n  "provenance_explain_balance.sql",\n  "supabase_linter_security_hardening.sql"',
      );
    });

    it("is registered in dbBootstrap.js", () => {
      const bootstrapScript = readSource("scripts/dbBootstrap.js");
      expect(bootstrapScript).toContain("provenance_finance_cutover.sql");
    });
  });
});
