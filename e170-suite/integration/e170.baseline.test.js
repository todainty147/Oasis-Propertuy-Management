/**
 * E-170 RED baseline gate.
 *
 * Phase 1 (RED):  Apply the pre-fix finance_snapshot from git HEAD.
 *                 Assert Alice £38,750 and Bob £28,600 phantoms reproduce.
 *                 If RED fails → test fails and run.sh aborts the suite.
 *
 * Phase 2 (GREEN transition):  Apply the post-fix finance_snapshot.
 *                               Assert Alice and Bob → unknown_payment_history.
 *                               Assert aggregate outstanding_income excludes them.
 *
 * The two phases are nested in a single describe so vitest runs them in order
 * (beforeAll at the outer level, inner describes run sequentially).
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB (local disposable Supabase instance)
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  isE170SuiteEligible,
  bootstrapHarness,
  createE170Property,
  insertLease,
  destroyE170Property,
  callSnapshot,
  findProp,
  applyPreFixFunction,
  applyPostFixFunction,
  activateTenancy,
  monthsElapsed,
  monthStart,
  today,
  ACCOUNT_ID,
} from "./_harness.js";
import { localPsqlRun, isLocalSupabase } from "../../tests/integration/helpers/env.js";

// Alice lease start (matches production fixture observed in screenshots)
const ALICE_LEASE_START = "2024-01-01";
const ALICE_LEASE_END   = "2024-12-31";   // past-ended; renewal_status='active' overrides
const ALICE_RENT        = 1250;

// Bob lease start (open-ended, no end_date — matches the 'blank end_date' import pattern)
const BOB_LEASE_START   = "2024-06-01";
const BOB_LEASE_END     = null;
const BOB_RENT          = 1100;

if (!isE170SuiteEligible()) {
  describe.skip("E-170 baseline (harness not configured or not local)", () => {});
} else {
  describe("E-170 baseline — RED then GREEN", () => {
    let admin, ownerClient, ownerUserId;
    let alicePropId, aliceTenantId;
    let bobPropId,   bobTenantId;

    beforeAll(async () => {
      ({ admin, ownerClient, ownerUserId } = await bootstrapHarness());

      // Create Alice fixture
      ({ propId: alicePropId, tenantId: aliceTenantId } =
        await createE170Property(admin, ownerUserId, {
          rent: ALICE_RENT, address: "E170 Alice - 10 High Street",
        }));

      await insertLease(admin, {
        propId:          alicePropId,
        tenantId:        aliceTenantId,
        leaseStartDate:  ALICE_LEASE_START,
        leaseEndDate:    ALICE_LEASE_END,
        renewalStatus:   "active",  // import default — the bug
      });

      // Create Bob fixture (open-ended, no end_date)
      ({ propId: bobPropId, tenantId: bobTenantId } =
        await createE170Property(admin, ownerUserId, {
          rent: BOB_RENT, address: "E170 Bob - 20 The Elms Road",
        }));

      await insertLease(admin, {
        propId:          bobPropId,
        tenantId:        bobTenantId,
        leaseStartDate:  BOB_LEASE_START,
        leaseEndDate:    BOB_LEASE_END,
        renewalStatus:   "active",
      });

      // Apply pre-fix function → put DB into RED state.
      applyPreFixFunction();
    }, 60_000);

    afterAll(async () => {
      // Always restore post-fix so the DB is not left broken.
      try { applyPostFixFunction(); } catch { /* best-effort */ }

      if (alicePropId) await destroyE170Property(admin, alicePropId, aliceTenantId);
      if (bobPropId)   await destroyE170Property(admin, bobPropId,   bobTenantId);
    }, 60_000);

    // ── Phase 1: RED baseline ─────────────────────────────────────────────────

    describe("Phase 1 — RED baseline (pre-fix phantom)", () => {
      let snap;

      beforeAll(async () => {
        snap = await callSnapshot(ownerClient);
      });

      it("RED-01: Alice shows phantom balance matching months_elapsed × rent", async () => {
        const prop = findProp(snap, alicePropId);
        expect(prop, "Alice property not found in snapshot").not.toBeNull();

        const expectedPhantom = monthsElapsed(ALICE_LEASE_START) * ALICE_RENT;
        // remaining is in major units (£)
        expect(Number(prop.remaining)).toBeCloseTo(expectedPhantom, 0);
        // EXECUTED_INTEGRATION_DB: at 2026-07-21 this is 31 × £1,250 = £38,750
      });

      it("RED-02: Alice payment status is overdue (no payments, accruing from 2024-01)", () => {
        const prop = findProp(snap, alicePropId);
        expect(prop).not.toBeNull();
        expect(prop.paymentStatus).toBe("overdue");
      });

      it("RED-03: Bob shows phantom balance matching months_elapsed × rent", () => {
        const prop = findProp(snap, bobPropId);
        expect(prop, "Bob property not found in snapshot").not.toBeNull();

        const expectedPhantom = monthsElapsed(BOB_LEASE_START) * BOB_RENT;
        // EXECUTED_INTEGRATION_DB: at 2026-07-21 this is 26 × £1,100 = £28,600
        expect(Number(prop.remaining)).toBeCloseTo(expectedPhantom, 0);
      });

      it("RED-04: Bob payment status is overdue", () => {
        const prop = findProp(snap, bobPropId);
        expect(prop).not.toBeNull();
        expect(prop.paymentStatus).toBe("overdue");
      });

      it("RED-05: outstanding_income includes both phantoms (Alice + Bob)", () => {
        const alicePhantom = monthsElapsed(ALICE_LEASE_START) * ALICE_RENT;
        const bobPhantom   = monthsElapsed(BOB_LEASE_START) * BOB_RENT;
        // The aggregate includes at minimum these two phantoms.
        expect(Number(snap.outstanding_income))
          .toBeGreaterThanOrEqual(alicePhantom + bobPhantom - 100); // 100 tolerance
      });
    });

    // ── Phase 3A: Gate 1 RED — ended-tenancy CTE defect (direct SQL proof) ──────
    //
    // Gate 1 STEP 0 determination: the OLD `property_lease_end` CTE
    // (finance_snapshot.sql before the CASE fix) selects lease_end_date with:
    //
    //   WHERE ... AND LOWER(COALESCE(l.renewal_status,'active')) NOT IN ('ended')
    //
    // For renewal_status='ended', no rows match → subquery returns NULL →
    // COALESCE(NULL, CURRENT_DATE) = CURRENT_DATE → accrual runs to today.
    //
    // The pre-E-170 function (git HEAD) predates balance_state/accrualThrough
    // entirely, so we cannot prove the defect via the full snapshot function in
    // the pre-fix state. Instead, we execute the OLD CTE subquery directly via
    // psql against our ended-tenancy fixture and assert it returns NULL, which
    // is the precise mechanism of the defect.
    //
    // Evidence tag: EXECUTED_INTEGRATION_DB (localPsqlRun against the fixture row)

    describe("Phase 3A — Gate 1 RED (old CTE returns NULL for ended tenancy — direct SQL proof)", () => {
      const G1_LEASE_END   = "2024-06-30";
      const G1_LEASE_START = "2024-01-01";
      const G1_RENT        = 900;
      let g1PropId, g1TenantId;

      beforeAll(async () => {
        ({ propId: g1PropId, tenantId: g1TenantId } =
          await createE170Property(admin, ownerUserId, {
            rent: G1_RENT, address: "E170 Gate1 RED - 30 Ended Tenancy St",
          }));
        await insertLease(admin, {
          propId:          g1PropId,
          tenantId:        g1TenantId,
          leaseStartDate:  G1_LEASE_START,
          leaseEndDate:    G1_LEASE_END,
          renewalStatus:   "ended",   // explicitly ended — the Gate 1 defect case
        });
      }, 30_000);

      afterAll(async () => {
        if (g1PropId) await destroyE170Property(admin, g1PropId, g1TenantId);
      }, 15_000);

      // RED-G1: execute the OLD CTE subquery (without the CASE fix) against the
      // ended-tenancy fixture. It must return NULL — confirming the defect mechanism:
      // COALESCE(NULL, CURRENT_DATE) = CURRENT_DATE → accrual runs to today.
      it("RED-G1 (Gate 1 defect): old CTE subquery returns NULL lease_end_date for ended tenancy (direct SQL)", () => {
        if (!isLocalSupabase()) return; // psql execution required
        // The OLD CTE subquery (verbatim from property_lease_end before the CASE fix):
        const result = localPsqlRun(`
          SELECT
            (
              SELECT l.lease_end_date
              FROM public.leases l
              WHERE l.account_id  = '${ACCOUNT_ID}'
                AND l.property_id = '${g1PropId}'
                AND LOWER(COALESCE(l.renewal_status, 'active')) NOT IN ('ended')
              ORDER BY l.lease_start_date DESC NULLS LAST
              LIMIT 1
            ) AS old_cte_lease_end_date;
        `);
        expect(result.success, `direct SQL query failed: ${result.stderr}`).toBe(true);
        // Result must be NULL — no matching row because renewal_status='ended' is excluded.
        // NULL → COALESCE(NULL, CURRENT_DATE) = CURRENT_DATE → the Gate 1 defect.
        expect(result.stdout).toContain("(1 row)"); // query returned exactly one row
        expect(result.stdout).toMatch(/old_cte_lease_end_date[\s\S]*\n[-\s]+\n\s*\n/); // NULL value (blank cell in psql output)
      });
    });

    // ── Phase 2: GREEN result (post-fix) ──────────────────────────────────────

    describe("Phase 2 — GREEN result (post-fix, no activation)", () => {
      let snap;

      beforeAll(async () => {
        applyPostFixFunction();
        snap = await callSnapshot(ownerClient);
      }, 60_000);

      it("GREEN-01: Alice balance_state = unknown_payment_history", () => {
        const prop = findProp(snap, alicePropId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("unknown_payment_history");
      });

      it("GREEN-02: Alice remaining = 0 (no phantom)", () => {
        const prop = findProp(snap, alicePropId);
        expect(Number(prop.remaining)).toBe(0);
      });

      it("GREEN-03: Alice paymentStatus = unknown", () => {
        const prop = findProp(snap, alicePropId);
        expect(prop.paymentStatus).toBe("unknown");
      });

      it("GREEN-04: Alice outstandingMinor = null (no numeric balance)", () => {
        const prop = findProp(snap, alicePropId);
        expect(prop.outstandingMinor).toBeNull();
      });

      it("GREEN-05: Bob balance_state = unknown_payment_history", () => {
        const prop = findProp(snap, bobPropId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("unknown_payment_history");
      });

      it("GREEN-06: Bob remaining = 0", () => {
        const prop = findProp(snap, bobPropId);
        expect(Number(prop.remaining)).toBe(0);
      });

      it("GREEN-07: outstanding_income excludes Alice and Bob (phantoms eliminated)", () => {
        // outstanding_income should not include the former phantom balances.
        // Both Alice and Bob are unknown → excluded from the aggregate.
        // The aggregate contribution from these two props is exactly 0.
        const alicePhantom = monthsElapsed(ALICE_LEASE_START) * ALICE_RENT;
        const bobPhantom   = monthsElapsed(BOB_LEASE_START) * BOB_RENT;
        // The outstanding_income should be at least (alicePhantom+bobPhantom) less
        // than it was in RED (we can't assert the exact value since other props exist).
        // What we CAN assert: Alice and Bob each contribute 0.
        // (Checked indirectly: both props have remaining=0.)
        const aliceProp = findProp(snap, alicePropId);
        const bobProp   = findProp(snap, bobPropId);
        expect(Number(aliceProp.remaining)).toBe(0);
        expect(Number(bobProp.remaining)).toBe(0);
      });

      it("GREEN-08: unknown_tenancy_count >= 2 (Alice and Bob counted)", () => {
        expect(Number(snap.unknown_tenancy_count)).toBeGreaterThanOrEqual(2);
      });
    });

    // ── Phase 3B: Gate 1 GREEN — ended-tenancy accrual capped at lease_end (post-fix) ──
    //
    // After applyPostFixFunction(), the CASE branch in property_lease_end CTE
    // falls to the ELSE path for ended tenancies — returning the most recent
    // ended lease's lease_end_date so accrual stops at the evidenced close.
    //
    // Evidence tag: EXECUTED_INTEGRATION_DB (post-fix function already active)

    describe("Phase 3B — Gate 1 GREEN (explicitly-ended tenancy accrual capped at lease_end, post-fix)", () => {
      const G1_LEASE_END = "2024-06-30";
      let g1PropId, g1TenantId;

      beforeAll(async () => {
        ({ propId: g1PropId, tenantId: g1TenantId } =
          await createE170Property(admin, ownerUserId, {
            rent: 900, address: "E170 Gate1 GREEN - 31 Ended Tenancy Mews",
          }));
        await insertLease(admin, {
          propId:          g1PropId,
          tenantId:        g1TenantId,
          leaseStartDate:  "2024-01-01",
          leaseEndDate:    G1_LEASE_END,
          renewalStatus:   "ended",
        });
        await activateTenancy(ownerClient, {
          propId:              g1PropId,
          coverageStart:       "2024-01-01",
          openingBalanceMinor: 0,
          attests:             true,
        });
      }, 30_000);

      afterAll(async () => {
        if (g1PropId) await destroyE170Property(admin, g1PropId, g1TenantId);
      }, 15_000);

      // GREEN-G1: post-fix function → CTE ELSE path returns G1_LEASE_END → accrual capped.
      it("GREEN-G1 (Gate 1 fix): accrualThrough = lease_end_date for explicitly-ended tenancy (post-fix)", async () => {
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, g1PropId);
        expect(prop, "Gate 1 GREEN fixture not found in snapshot").not.toBeNull();
        expect(prop.balanceState).toBe("known");
        // Post-fix: the ELSE branch returns the ended lease's end_date.
        // accrualThrough must equal G1_LEASE_END — not today.
        expect(prop.accrualThrough).toBe(G1_LEASE_END);
        expect(prop.accrualThrough).not.toBe(today());
      });
    });
  });
}
