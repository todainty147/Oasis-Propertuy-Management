import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance finance cutover unit tests", () => {
  const sql = readSource("supabase/provenance_finance_cutover.sql");

  describe("balance projection contribution rules", () => {
    it("payment.recorded contributes credit to balance (is the credit event in the new payment model)", () => {
      // 2475c3b: payment.recorded is now the credit event. recording a payment IS
      // the ledger credit; payment.marked_paid is a zero-contribution status event.
      expect(sql).toContain(
        "when re.event_type = 'payment.recorded' then -coalesce(re.amount_minor, 0)",
      );
      // Guard against regression to the old zero-contribution model.
      expect(sql).not.toContain(
        "when re.event_type = 'payment.recorded' then 0::bigint",
      );
    });

    it("payment.marked_overdue contributes exactly 0", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.marked_overdue' then 0::bigint",
      );
    });

    it("finance.legacy_obligation_snapshot contributes positive (debit)", () => {
      expect(sql).toContain(
        "when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)",
      );
    });

    it("payment.marked_paid contributes zero (status event — credit moved to payment.recorded in new model)", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.marked_paid' then 0::bigint",
      );
    });

    it("payment.reopened contributes positive (reverses a credit)", () => {
      expect(sql).toContain(
        "when re.event_type = 'payment.reopened' then coalesce(re.amount_minor, 0)",
      );
    });

    it("reversed events contribute 0", () => {
      const reversalZero = sql.match(
        /when re\.event_id in \(select event_id from reversed_event_ids\) then 0::bigint/,
      );
      expect(reversalZero).not.toBeNull();
    });

    it("superseded events contribute 0", () => {
      const supersededZero = sql.match(
        /when re\.event_id in \(select event_id from superseded_event_ids\) then 0::bigint/,
      );
      expect(supersededZero).not.toBeNull();
    });
  });

  describe("treatment assignment", () => {
    it("assigns 'informational' to payment.marked_overdue only (payment.recorded is now a credit event, not informational)", () => {
      expect(sql).toContain(
        "when re.event_type in ('payment.marked_overdue') then 'informational'",
      );
    });

    it("assigns 'reversed' to events referenced by reversal_of_event_id", () => {
      expect(sql).toContain("reversed_event_ids");
      expect(sql).toContain("then 'reversed'");
    });

    it("assigns 'superseded' to events referenced by supersedes_event_id", () => {
      expect(sql).toContain("superseded_event_ids");
      expect(sql).toContain("then 'superseded'");
    });

    it("assigns 'reconstructed' to obligation snapshots with reconstructed=true", () => {
      expect(sql).toContain("then 'reconstructed'");
      expect(sql).toContain("reconstructed");
    });
  });

  describe("obligation snapshot stores GROSS expected (pre-clamp)", () => {
    it("computes amount_minor as months_elapsed × rent_minor_used", () => {
      expect(sql).toContain(
        "(v_prop.months_elapsed::bigint * v_prop.rent_minor_used)::bigint",
      );
    });

    it("does NOT store clamped remaining as amount_minor", () => {
      expect(sql).not.toMatch(
        /v_prop\.remaining_clamped[^,]*,\s*v_prop\.currency/,
      );
    });

    it("stores legacy_remaining_at_cutover in metadata for cross-check", () => {
      expect(sql).toContain("'legacy_remaining_at_cutover'");
      expect(sql).toContain("v_prop.remaining_clamped");
    });
  });

  describe("cutover gap/overlap prevention", () => {
    it("live instrumentation only fires when status is active and time >= cutover_at", () => {
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("now() >= c.cutover_at");
    });

    it("backfill uses cutover timestamp as obligation occurred_at", () => {
      expect(sql).toContain("p_cutover_at, now()");
    });

    it("derives snapshot months_elapsed as of the cutover date", () => {
      expect(sql).toContain(
        "finance_property_accumulation_as_of(\n      p_account_id,\n      p_cutover_at::date",
      );
      expect(sql).toContain(
        "date_trunc('month', p_as_of)::date",
      );
    });
  });

  describe("backfill idempotency keys follow documented convention", () => {
    it("payment.recorded key = backfill:payment.recorded:{payment_id}", () => {
      expect(sql).toContain(
        "'backfill:payment.recorded:' || v_pay.payment_id::text",
      );
    });

    it("payment.marked_paid key = backfill:payment.marked_paid:{payment_id}", () => {
      expect(sql).toContain(
        "'backfill:payment.marked_paid:' || v_pay.payment_id::text",
      );
    });

    it("payment.voided key = backfill:payment.voided:{payment_id}", () => {
      expect(sql).toContain(
        "'backfill:payment.voided:' || v_pay.payment_id::text",
      );
    });

    it("obligation key = cutover:legacy_obligation:{account}:{property}:{version}", () => {
      expect(sql).toContain(
        "'cutover:legacy_obligation:' || p_account_id::text || ':' || v_prop.property_id::text || ':' || v_cutover_version::text",
      );
    });
  });

  describe("backfill idempotency does not waste sequence numbers", () => {
    it("checks for existing idempotency key BEFORE allocating sequence number", () => {
      const backfillFn = sql.match(
        /create or replace function public\.provenance_finance_backfill[\s\S]*?\$\$;/,
      );
      expect(backfillFn).not.toBeNull();
      const body = backfillFn[0];

      const recordedCheck = body.indexOf("'backfill:payment.recorded:'");
      const firstCounterAlloc = body.indexOf(
        "provenance_event_counters",
        body.indexOf("for v_pay in"),
      );
      expect(recordedCheck).toBeLessThan(firstCounterAlloc);
    });

    it("skips sequence allocation when idempotency key already exists", () => {
      const backfillFn = sql.match(
        /create or replace function public\.provenance_finance_backfill[\s\S]*?\$\$;/,
      );
      expect(backfillFn).not.toBeNull();
      const body = backfillFn[0];

      expect(body).toContain("if v_existing_event_id is null then");
      expect(body).toContain("select id into v_existing_event_id");
    });
  });

  describe("live instrumentation idempotency keys", () => {
    it("create_payment uses stable key for payment.recorded", () => {
      expect(sql).toContain("'live:payment.recorded:' || v_row.id::text");
    });

    it("mark_payment_paid emits payment.recorded event with paid-at-time stable key", () => {
      // 2475c3b: mark_payment_paid now emits payment.recorded (not payment.marked_paid).
      // The paid-at timestamp is included in the key so re-marking paid on the same
      // payment at a different time produces a distinct idempotency key.
      expect(sql).toContain(
        "'live:payment.recorded:' || p_payment_id::text || ':' || coalesce(p_paid_at, current_date)::text",
      );
    });

    it("void_payment uses stable key", () => {
      expect(sql).toContain(
        "'live:payment.voided:' || v_pay.id::text",
      );
    });

    it("delete_payment uses stable key", () => {
      expect(sql).toContain(
        "'live:payment.deleted:' || v_pay.id::text",
      );
    });
  });

  describe("actor context", () => {
    it("backfill uses actor_type=system and actor_user_id=null", () => {
      const systemActors = sql.match(/'system', null, 'system'/g);
      expect(systemActors).not.toBeNull();
      expect(systemActors.length).toBeGreaterThanOrEqual(4);
    });

    it("live instrumentation captures auth.uid() for human actors", () => {
      expect(sql).toContain("v_actor_user_id := auth.uid()");
    });

    it("live instrumentation captures effective role for human actors", () => {
      expect(sql).toContain(
        "account_member_effective_role(p_account_id, v_actor_user_id)",
      );
    });
  });

  describe("payment RPC transactional integrity", () => {
    it("provenance event is within the same function (same transaction) as payment mutation", () => {
      const createPaymentFn = sql.match(
        /create or replace function public\.create_payment[\s\S]*?\$\$;/,
      );
      expect(createPaymentFn).not.toBeNull();
      expect(createPaymentFn[0]).toContain("provenance_record_payment_event");
      expect(createPaymentFn[0]).toContain("insert into public.payments");
    });

    it("mark_payment_paid provenance is in same transaction", () => {
      const markPaidFn = sql.match(
        /create or replace function public\.mark_payment_paid[\s\S]*?\$\$;/,
      );
      expect(markPaidFn).not.toBeNull();
      expect(markPaidFn[0]).toContain("provenance_record_payment_event");
      expect(markPaidFn[0]).toContain("update public.payments");
    });

    it("void_payment provenance is in same transaction", () => {
      const voidFn = sql.match(
        /create or replace function public\.void_payment[\s\S]*?\$\$;/,
      );
      expect(voidFn).not.toBeNull();
      expect(voidFn[0]).toContain("provenance_record_payment_event");
      expect(voidFn[0]).toContain("update public.payments");
    });

    it("delete_payment emits provenance BEFORE the delete", () => {
      const deleteFn = sql.match(
        /create or replace function public\.delete_payment[\s\S]*?\$\$;/,
      );
      expect(deleteFn).not.toBeNull();
      const fnBody = deleteFn[0];
      const provenancePos = fnBody.indexOf("provenance_record_payment_event");
      const deletePos = fnBody.indexOf(
        "delete from public.payments",
      );
      expect(provenancePos).toBeLessThan(deletePos);
    });
  });

  describe("reconciliation gate semantics", () => {
    it("compares against finance_snapshot per-property remaining (not overdue_income)", () => {
      expect(sql).toContain("remaining_clamped as legacy_remaining");
      expect(sql).not.toMatch(/overdue_income.*legacy/);
    });

    it("runs per-property (not account-level aggregation)", () => {
      expect(sql).toContain("full outer join provenance p on l.property_id = p.prov_property_id");
    });

    it("classifies explained divergences correctly", () => {
      expect(sql).toContain("'overpayment_credit_clamp'");
      expect(sql).toContain("'currency_mismatch'");
    });

    it("only classifies overpayment_credit_clamp when legacy is exactly zero", () => {
      expect(sql).toContain(
        "when c.leg_balance = 0 and c.prov_bal < 0 then 'explained_divergence'",
      );
      expect(sql).toContain(
        "when c.leg_balance = 0 and c.prov_bal < 0 then 'overpayment_credit_clamp'",
      );
      expect(sql).not.toMatch(
        /leg_balance\s*>=?\s*0\s+and\s+c\.prov_bal\s*<\s*0\s+then\s+'explained_divergence'/,
      );
      expect(sql).not.toMatch(
        /leg_balance\s*>\s*0.*prov_bal\s*<.*then\s+'explained_divergence'/,
      );
    });

    it("flags derivation mismatch as unexplained", () => {
      expect(sql).toContain("'unexplained_divergence'");
      expect(sql).toContain("'derivation_mismatch'");
    });

    it("provides recommended_action for each divergence reason", () => {
      expect(sql).toContain("investigate currency configuration");
      expect(sql).toContain(
        "investigate derivation mismatch",
      );
      expect(sql).toContain(
        "provenance shows tenant credit that legacy clamps to zero",
      );
    });
  });

  describe("cutover seam: no gap between backfill and live", () => {
    it("backfill and live use distinct idempotency key prefixes (no overlap)", () => {
      // Backfill keys: both events exist in the backfill path
      expect(sql).toContain("'backfill:payment.recorded:'");
      expect(sql).toContain("'backfill:payment.marked_paid:'");
      // Live key: mark_payment_paid now emits payment.recorded (2475c3b).
      // No live:payment.marked_paid: key exists — the credit is on recorded.
      expect(sql).toContain("'live:payment.recorded:'");
      expect(sql).not.toContain("'live:payment.marked_paid:'");
    });

    it("live instrumentation only fires after cutover is active", () => {
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("now() >= c.cutover_at");
    });
  });

  describe("transaction rollback contract", () => {
    it("provenance helper uses perform (propagates exceptions to caller)", () => {
      const createFn = sql.match(
        /create or replace function public\.create_payment[\s\S]*?\$\$;/,
      );
      expect(createFn).not.toBeNull();
      expect(createFn[0]).toContain("perform public.provenance_record_payment_event");
    });

    it("provenance_record_payment_event raises on invalid event_type", () => {
      const helper = sql.match(
        /create or replace function public\.provenance_record_payment_event[\s\S]*?\$\$;/,
      );
      expect(helper).not.toBeNull();
      expect(helper[0]).toContain("raise exception 'invalid payment provenance event_type");
    });
  });

  describe("finance_snapshot is the only legacy reconciliation target", () => {
    it("shared function mirrors finance_snapshot accumulation logic", () => {
      expect(sql).toContain("finance_property_accumulation");
      expect(sql).toContain("finance_snapshot_property_accumulated");
    });

    it("does not reference dashboard_snapshot or JS helpers as legacy targets", () => {
      expect(sql).not.toContain("dashboard_snapshot");
      expect(sql).not.toContain("calculatePropertyFinance");
      expect(sql).not.toContain("financeSnapshot.js");
    });
  });

  // Pre-existing test failures (not caused by Sprint 2A, verified by stash test):
  //
  // 1. tests/security/rpcMutationContracts.test.js — 2 tests
  //    "returns parsed payment mutation rows" — supabase.rpc mock returns undefined
  //    "returns parsed document rows from document RPC writes" — same mock issue
  //
  // 2. tests/security/legalSecurityPhase3Contracts.test.js — 1 test
  //    "adds the marketing risk page and avoids launch-blocked legal overclaims"
  //
  // 3. tests/security/pilotBillingModeContracts.test.js — 1 test
  //    "keeps public pricing CTA out of direct Stripe checkout"
});
