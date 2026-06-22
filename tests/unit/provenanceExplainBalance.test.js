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
        "'live:rent.charged:' || p_account_id::text || ':' || v_period.property_id::text || ':' || v_period.period_key || ':' || v_cutover_version::text",
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

  describe("head-based verification freshness in explain RPC", () => {
    it("reads the current head via get_provenance_chain_head before checking status", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const headRead = body.indexOf("get_provenance_chain_head(v_account_id)");
      const statusRead = body.indexOf("from public.provenance_chain_status");
      expect(headRead).toBeGreaterThan(-1);
      expect(statusRead).toBeGreaterThan(headRead);
    });

    it("cache HIT requires head_sequence match AND max_age freshness", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      expect(body).toContain(
        "v_status.head_sequence is not distinct from coalesce(v_current_head.head_sequence, 0)",
      );
      expect(body).toContain(
        "v_status.last_verified_at >= now() - v_max_age",
      );
    });

    it("defines max_age as 15 minutes", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("interval '15 minutes'");
    });

    it("cache MISS calls verify_and_persist_chain_status", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("verify_and_persist_chain_status(v_account_id)");
    });

    it("cache HIT reads verified and event_count from status row", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_chain_is_valid := v_status.verified");
      expect(fn[0]).toContain("v_chain_checked_count := v_status.event_count");
      expect(fn[0]).toContain("v_chain_verified_at := v_status.last_verified_at");
    });

    it("verified_at in response uses v_chain_verified_at (honest timestamp, not now())", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const returnPayload = fn[0].match(/return jsonb_build_object\([\s\S]*?\);/);
      expect(returnPayload).not.toBeNull();
      expect(returnPayload[0]).toContain("v_chain_verified_at");
      expect(returnPayload[0]).not.toMatch(/'verified_at',\s*now\(\)/);
    });

    it("freshness check documents head-equality rationale in a comment", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("Head equality is the primary gate");
    });

    it("freshness check documents max-age tamper-detection backstop in a comment", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("tamper-detection backstop");
    });

    it("accrual comment documents why it MUST run before freshness check", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain(
        "Accrual can append rent.charged events, advancing the chain head",
      );
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

  describe("lease-end accrual notice surfacing", () => {
    it("notice scan runs after projection is computed", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const projectionPos = body.indexOf("provenance_balance_projection");
      const noticePos = body.indexOf("accrual_continues_past_lease_end_date");
      expect(projectionPos).toBeGreaterThan(-1);
      expect(noticePos).toBeGreaterThan(projectionPos);
    });

    it("notice scan runs before the response is built", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      const noticePos = body.indexOf("v_seen_leases");
      const returnPos = body.indexOf("return jsonb_build_object(");
      expect(noticePos).toBeGreaterThan(-1);
      expect(noticePos).toBeLessThan(returnPos);
    });

    it("deduplicates using a v_seen_leases array to produce one notice per lease", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const body = fn[0];
      expect(body).toContain("v_seen_leases := v_seen_leases || v_ev_lease_id");
      expect(body).toContain("v_ev_lease_id = any(v_seen_leases)");
    });

    it("notice type is lease_end_accrual with user-facing message", () => {
      expect(sql).toContain("'lease_end_accrual'");
      expect(sql).toContain(
        "Rent is still being accrued past the lease end date. Review the lease status or record a renewal.",
      );
    });

    it("anomaly alert entity_type is lease", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      const alertSection = fn[0].match(
        /upsert_security_anomaly_alert[\s\S]*?'provenance\.lease_end_accrual'[\s\S]*?'lease'/,
      );
      expect(alertSection).not.toBeNull();
    });

    it("does NOT delete, update, or reverse provenance events (deferred decision)", () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).not.toMatch(/delete\s+from\s+.*provenance_events/i);
      expect(fn[0]).not.toMatch(/update\s+.*provenance_events\s+set/i);
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

  describe("Sprint 2C: Balance Evidence Summary response structure", () => {
    const fnBody = () => {
      const fn = sql.match(
        /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
      );
      return fn ? fn[0] : "";
    };

    describe("label resolution ordering", () => {
      it("resolves labels before reconciliation gate call", () => {
        const body = fnBody();
        const labelPos = body.indexOf("v_account_label");
        const gatePos = body.indexOf("into v_gate");
        expect(labelPos).toBeGreaterThan(-1);
        expect(gatePos).toBeGreaterThan(labelPos);
      });

      it("resolves all four labels from separate tables", () => {
        const body = fnBody();
        expect(body).toContain("from public.accounts a");
        expect(body).toContain("from public.properties p");
        expect(body).toContain("from public.tenants tn");
        expect(body).toContain("from public.leases l");
      });
    });

    describe("event contribution accumulation", () => {
      it("initialises v_event_total to zero", () => {
        const body = fnBody();
        expect(body).toMatch(/v_event_total\s+bigint\s*:=\s*0/);
      });

      it("sums contribution_minor from events via jsonb access", () => {
        const body = fnBody();
        expect(body).toContain("v_event_total := v_event_total + coalesce((v_ev ->> 'contribution_minor')::bigint, 0)");
      });

      it("iterates over v_events from projection", () => {
        const body = fnBody();
        expect(body).toContain("jsonb_array_elements(v_events)");
      });
    });

    describe("bridge line computation", () => {
      it("only builds bridge lines when display_basis is legacy_compatible", () => {
        const body = fnBody();
        expect(body).toContain("v_display_basis = 'legacy_compatible'");
        expect(body).toContain("v_bridge_lines");
      });

      it("bridge line adjusts from event total to display balance", () => {
        const body = fnBody();
        expect(body).toContain("v_display_balance - v_event_total");
      });

      it("bridge lines array is empty when display_basis is provenance", () => {
        const body = fnBody();
        expect(body).toMatch(/v_bridge_lines\s+jsonb\s*:=\s*'\[\]'::jsonb/);
      });
    });

    describe("head reference inclusion", () => {
      it("includes head_sequence in chain_verification object", () => {
        const body = fnBody();
        const chainBlock = body.match(/'chain_verification'[\s\S]*?'head_sequence'/);
        expect(chainBlock).not.toBeNull();
      });

      it("includes head_hash in chain_verification object", () => {
        const body = fnBody();
        const chainBlock = body.match(/'chain_verification'[\s\S]*?'head_hash'/);
        expect(chainBlock).not.toBeNull();
      });
    });

    describe("anchor_hash inclusion", () => {
      it("includes anchor_hash in anchor_consistency object", () => {
        const body = fnBody();
        const anchorBlock = body.match(/'anchor_consistency'[\s\S]*?'anchor_hash'/);
        expect(anchorBlock).not.toBeNull();
      });
    });

    describe("evidence flag variables", () => {
      it("declares v_accrued_past_lease_end as boolean defaulting to false", () => {
        const body = fnBody();
        expect(body).toMatch(/v_accrued_past_lease_end\s+boolean\s*:=\s*false/);
      });

      it("declares v_has_reconstructed as boolean defaulting to false", () => {
        const body = fnBody();
        expect(body).toMatch(/v_has_reconstructed\s+boolean\s*:=\s*false/);
      });

      it("sets v_has_reconstructed during event scan (not outside)", () => {
        const body = fnBody();
        const eventScanStart = body.indexOf("for v_ev in");
        const flagSet = body.indexOf("v_has_reconstructed := true");
        expect(eventScanStart).toBeGreaterThan(-1);
        expect(flagSet).toBeGreaterThan(eventScanStart);
      });

      it("sets v_accrued_past_lease_end during event scan", () => {
        const body = fnBody();
        const eventScanStart = body.indexOf("for v_ev in");
        const flagSet = body.indexOf("v_accrued_past_lease_end := true");
        expect(eventScanStart).toBeGreaterThan(-1);
        expect(flagSet).toBeGreaterThan(eventScanStart);
      });
    });

    describe("response payload completeness", () => {
      it("return payload includes all 2C fields", () => {
        const body = fnBody();
        const returnPayload = body.match(/return jsonb_build_object\([\s\S]*?\);/);
        expect(returnPayload).not.toBeNull();
        for (const key of [
          "'account_label'",
          "'property_label'",
          "'tenant_label'",
          "'lease_label'",
          "'event_contribution_total_minor'",
          "'reconciliation_bridge_lines'",
          "'accrued_past_lease_end'",
          "'has_reconstructed'",
        ]) {
          expect(returnPayload[0]).toContain(key);
        }
      });
    });

    describe("native versus migrated semantics", () => {
      it("uses provenance as the native display basis", () => {
        expect(fnBody()).toMatch(
          /when v_is_legacy_migrated then coalesce\(v_gate\.display_basis, 'provenance'\)[\s\S]*?else 'provenance'/,
        );
      });

      it("suppresses legacy balance for native accounts", () => {
        expect(fnBody()).toMatch(
          /'legacy_balance_minor', case[\s\S]*?when v_is_legacy_migrated[\s\S]*?else null/,
        );
      });

      it("only builds bridge lines for migrated accounts", () => {
        expect(fnBody()).toMatch(
          /if v_is_legacy_migrated[\s\S]*?v_display_basis = 'legacy_compatible'[\s\S]*?v_bridge_lines :=/,
        );
      });

      it("derives balance reliability independently from ledger integrity", () => {
        const body = fnBody();
        expect(body).toContain("v_ledger_integrity_status");
        expect(body).toContain("v_balance_reliability_status");
        expect(body).toContain("'caution_required'");
        expect(body).toContain("'unusable'");
        expect(body).toContain("'usable'");
      });
    });
  });

  describe("Sprint 2C: Balance Evidence Summary page structure", () => {
    const pageSrc = readSource("src/pages/provenance/BalanceEvidenceSummaryPage.jsx");

    describe("assurance status mapping", () => {
      it("maps ledger and reliability states to labels", () => {
        for (const status of [
          "passed",
          "failed",
          "usable",
          "caution_required",
          "unusable",
          "not_applicable",
        ]) {
          expect(pageSrc).toContain(status);
        }
      });

      it("maps assurance states to icons", () => {
        expect(pageSrc).toContain("ASSURANCE_CONFIG");
        expect(pageSrc).toContain("ShieldCheck");
        expect(pageSrc).toContain("AlertTriangle");
        expect(pageSrc).toContain("ShieldAlert");
        expect(pageSrc).toContain("Clock");
      });
    });

    describe("amount formatting", () => {
      it("uses formatCurrencyAmount for minor unit conversion", () => {
        expect(pageSrc).toContain("formatCurrencyAmount");
        expect(pageSrc).toContain("/ 100");
      });

      it("defaults currency to GBP", () => {
        expect(pageSrc).toContain('"GBP"');
      });
    });

    describe("balance display section", () => {
      it("shows display balance with data-testid", () => {
        expect(pageSrc).toContain('data-testid="display-balance"');
      });

      it("shows display_basis label (legacy vs provenance)", () => {
        expect(pageSrc).toContain("legacy_compatible");
        expect(pageSrc).toContain("provenance-derived");
      });

      it("shows provenance balance and legacy balance", () => {
        expect(pageSrc).toContain("provenance_balance_minor");
        expect(pageSrc).toContain("legacy_balance_minor");
      });
    });

    describe("print layout classes", () => {
      it("wraps content in .balance-evidence-summary class", () => {
        expect(pageSrc).toContain("balance-evidence-summary");
      });

      it("uses break-inside-avoid for key sections", () => {
        expect(pageSrc).toContain("break-inside-avoid");
      });

      it("uses break-after-avoid for summary header", () => {
        expect(pageSrc).toContain("break-after-avoid");
      });
    });

    describe("error and loading states", () => {
      it("shows loading skeleton when fetching", () => {
        expect(pageSrc).toContain("Skeleton");
        expect(pageSrc).toContain("loading");
      });

      it("shows error message on failure", () => {
        expect(pageSrc).toContain("Could not load balance data");
      });

      it("shows back link to property", () => {
        expect(pageSrc).toContain("Back to property");
        expect(pageSrc).toContain("tab=financials");
      });
    });
  });

  describe("Sprint 2C runtime integrity fixes", () => {
    const eventsSql = readSource("supabase/provenance_events.sql");

    describe("Fix 1: verify_and_persist race condition + auth", () => {
      const persistFn = () => {
        const m = sql.match(
          /create or replace function public\.verify_and_persist_chain_status\b[\s\S]*?\$\$;/,
        );
        return m ? m[0] : "";
      };

      it("checks auth.uid() and requires operator role", () => {
        const body = persistFn();
        expect(body).toContain("auth.uid()");
        expect(body).toContain("account operator role required");
      });

      it("allows staff in addition to owner/admin", () => {
        const body = persistFn();
        expect(body).toContain("'staff'");
      });

      it("acquires the same advisory lock as ledger writers", () => {
        const body = persistFn();
        expect(body).toContain("hashtext('provenance:' || p_account_id::text), 0");
      });

      it("acquires lock before reading head", () => {
        const body = persistFn();
        const lockPos = body.indexOf("pg_advisory_xact_lock");
        const headReadPos = body.indexOf("into v_head_before");
        expect(lockPos).toBeGreaterThan(-1);
        expect(headReadPos).toBeGreaterThan(lockPos);
      });

      it("reads head before verify and after verify, then compares", () => {
        const body = persistFn();
        const beforePos = body.indexOf("into v_head_before");
        const verifyPos = body.indexOf("_verify_provenance_chain_internal");
        const afterPos = body.indexOf("into v_head_after");
        expect(beforePos).toBeGreaterThan(-1);
        expect(verifyPos).toBeGreaterThan(beforePos);
        expect(afterPos).toBeGreaterThan(verifyPos);
      });

      it("persists head_after (not head_before) to status table", () => {
        const body = persistFn();
        expect(body).toContain("v_head_after.head_sequence");
        expect(body).toContain("v_head_after.head_hash");
      });
    });

    describe("Fix 2: staff verifier access via internal function", () => {
      it("internal verifier has no auth.uid() check", () => {
        const fn = eventsSql.match(
          /create or replace function public\._verify_provenance_chain_internal[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).not.toContain("auth.uid()");
        expect(fn[0]).not.toContain("authentication required");
      });

      it("internal verifier still validates chain hashes", () => {
        const fn = eventsSql.match(
          /create or replace function public\._verify_provenance_chain_internal[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("provenance_canonical_payload_v0");
        expect(fn[0]).toContain("extensions.digest");
      });

      it("public verify_provenance_chain still enforces owner/admin", () => {
        const fn = eventsSql.match(
          /create or replace function public\.verify_provenance_chain[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("account owner or admin role required");
        expect(fn[0]).toContain("auth.uid()");
      });
    });

    describe("Fix 4: metadata in projected events", () => {
      it("includes metadata field in jsonb_build_object for events", () => {
        const fn = sql.match(
          /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("'metadata', e.metadata");
      });

      it("metadata appears after reconstructed field in event object", () => {
        const fn = sql.match(
          /create or replace function public\.provenance_balance_projection[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        const body = fn[0];
        const reconstructedPos = body.indexOf("'reconstructed'");
        const metadataPos = body.indexOf("'metadata', e.metadata");
        expect(reconstructedPos).toBeGreaterThan(-1);
        expect(metadataPos).toBeGreaterThan(reconstructedPos);
      });
    });

    describe("Fix 5: cache freshness includes head_hash", () => {
      it("cache hit requires head_hash match in addition to head_sequence", () => {
        const fn = sql.match(
          /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        const body = fn[0];
        expect(body).toContain("v_status.head_hash is not distinct from v_current_head.head_hash");
      });

      it("head_hash check appears between head_sequence check and time check", () => {
        const fn = sql.match(
          /create or replace function public\.explain_property_balance[\s\S]*?\$\$;/,
        );
        expect(fn).not.toBeNull();
        const body = fn[0];
        const seqPos = body.indexOf("v_status.head_sequence is not distinct from");
        const hashPos = body.indexOf("v_status.head_hash is not distinct from");
        const timePos = body.indexOf("v_status.last_verified_at >= now()");
        expect(seqPos).toBeGreaterThan(-1);
        expect(hashPos).toBeGreaterThan(seqPos);
        expect(timePos).toBeGreaterThan(hashPos);
      });
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
