/**
 * E-170 edge-case and DoD tests.
 *
 * EC-01  is_tenancy_ended correctly true for a properly ended lease (renewal_status='ended')
 * EC-02  KNOWN DEFECT E-172: is_tenancy_ended for imported lease (renewal_status='active',
 *        end_date in past). Correct target: true. Current DB value: false (bug).
 *        This test asserts the CORRECT TARGET (true). It FAILS until E-172 ships.
 *        Do not edit to toBe(false) — the failure is the signal.
 * EC-03  reason_code = PAYMENT_HISTORY_INCOMPLETE when payments exist but no activation
 * EC-04  reason_code = FINANCE_COVERAGE_START_UNKNOWN when no payments and no activation
 * EC-05  Over-correction regression: activated property stays 'known' after a batch of
 *        payments — no phantom flip back to unknown
 * EC-06  Accrual capped at lease_end for an ended tenancy (Fix P0-A)
 * EC-07  paymentStatus = 'paid' when outstanding_minor = 0
 * EC-08  paymentStatus = 'overdue' when activated + months elapsed > 1 and underpaid
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB
 *
 * KNOWN DEFECT E-172 (Gate 2): EC-02 asserts the correct target (true). It fails today
 * because the DB column default fires 'active' on import (renewal_status NOT IN ('ended')
 * → NOT EXISTS fires → is_tenancy_ended = false). When E-172-FIX ships, this test will
 * naturally pass without any assertion change needed.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  isE170SuiteEligible,
  bootstrapHarness,
  createE170Property,
  insertLease,
  insertPayments,
  activateTenancy,
  destroyE170Property,
  callSnapshot,
  findProp,
  ACCOUNT_ID,
  today,
  dayOffset,
  monthStart,
} from "./_harness.js";

if (!isE170SuiteEligible()) {
  describe.skip("E-170 edge-case tests (harness not configured or not local)", () => {});
} else {
  describe("E-170 edge-case tests", () => {
    let admin, ownerClient, ownerUserId;

    beforeAll(async () => {
      ({ admin, ownerClient, ownerUserId } = await bootstrapHarness());
    }, 30_000);

    // ── EC-01: is_tenancy_ended correctly true for ended lease ───────────────

    it("EC-01: is_tenancy_ended = true when all lease rows have renewal_status = ended", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 900, address: "E170 EC01 - 1 Ended Lane",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: "2023-01-01",
          leaseEndDate:   "2023-12-31",
          renewalStatus:  "ended",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-02: KNOWN DEFECT E-172 (Gate 2) ────────────────────────────────────
    //
    // Alice has renewal_status='active' (set by DB default on import) despite
    // her lease_end_date being in the past. The snapshot computes is_tenancy_ended
    // as NOT EXISTS (leases WHERE renewal_status NOT IN ('ended')).
    // Since renewal_status='active' is NOT IN ('ended'), EXISTS fires → NOT EXISTS = false.
    //
    // CORRECT behaviour: is_tenancy_ended should be true (lease ended 2024-12-31).
    // ACTUAL behaviour (bug E-172): is_tenancy_ended = false.
    //
    // This test asserts the CORRECT TARGET (true). It FAILS until E-172 ships.
    // Do NOT change to toBe(false) — the failure is the signal that E-172 is open.
    // When E-172-FIX ships, this test naturally passes without any assertion edit.

    it("EC-02 KNOWN DEFECT E-172: is_tenancy_ended should be true for imported lease with past end_date (currently false — fails until E-172 ships)", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1250, address: "E170 EC02 Alice - 10 High Street",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: "2024-01-01",
          leaseEndDate:   "2024-12-31",  // end_date in past
          renewalStatus:  "active",       // DB default on import — the E-172 bug
        });

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();

        // CORRECT TARGET: is_tenancy_ended should be true (lease ended 2024-12-31).
        // This assertion FAILS today because renewal_status='active' (E-172 bug).
        // It will pass when E-172-FIX corrects the DB default on import.
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-03: PAYMENT_HISTORY_INCOMPLETE reason code ─────────────────────────

    it("EC-03: reason_code = PAYMENT_HISTORY_INCOMPLETE when payments exist but no activation", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 700, address: "E170 EC03 - 3 Payments With No Activation Rd",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(3),
          renewalStatus:  "active",
        });
        // Seed a payment — but do NOT activate
        await insertPayments(admin, ownerUserId, [{
          property_id: propId,
          tenant_id:   tenantId,
          amount:      700,
          status:      "paid",
          paid_at:     today(),
          due_date:    monthStart(1),
        }]);

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("unknown_payment_history");
        expect(prop.reasonCode).toBe("PAYMENT_HISTORY_INCOMPLETE");
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-04: FINANCE_COVERAGE_START_UNKNOWN reason code ────────────────────

    it("EC-04: reason_code = FINANCE_COVERAGE_START_UNKNOWN when no payments and no activation", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 600, address: "E170 EC04 - 4 No Payments No Activation St",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(2),
          renewalStatus:  "active",
        });
        // No payments, no activation

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("unknown_payment_history");
        expect(prop.reasonCode).toBe("FINANCE_COVERAGE_START_UNKNOWN");
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-05: Over-correction regression ────────────────────────────────────
    //
    // An activated property that receives additional payments must stay 'known'.
    // E-170 must not introduce an over-correction where many payments cause
    // the balance to flip back to unknown.

    it("EC-05: activated property remains known after multiple payments are added", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1000, address: "E170 EC05 - 5 Over Correction Check Rd",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          renewalStatus:  "active",
        });
        await activateTenancy(ownerClient, {
          propId,
          coverageStart:       monthStart(4),
          openingBalanceMinor: 0,
          attests:             true,
        });
        // Insert 4 months of payments
        for (let i = 1; i <= 4; i++) {
          await insertPayments(admin, ownerUserId, [{
            property_id: propId,
            tenant_id:   tenantId,
            amount:      1000,
            status:      "paid",
            paid_at:     monthStart(i),
            due_date:    monthStart(i),
          }]);
        }

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("known");
        // remaining should be 0 (or close to 0) — fully paid
        expect(Number(prop.remaining)).toBeGreaterThanOrEqual(0);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-06: Accrual capped at lease_end for active lease with past end_date (Fix P0-A) ──
    //
    // The SQL CTE picks up lease_end_date only from non-ended rows
    // (LOWER(renewal_status) NOT IN ('ended')). So for renewal_status='active'
    // with a past lease_end_date (the import-default scenario), the accrual is
    // capped at that past end_date, not today. This is the P0-A cap.

    it("EC-06: accrualThrough = lease_end_date (not today) for an active-labelled lease whose end_date is past", async () => {
      let propId, tenantId;
      try {
        // renewal_status='active' (like an imported lease), lease_end_date 2 months ago.
        const leaseEnd = monthStart(2);   // first of 2 months ago

        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1200, address: "E170 EC06 - 6 Capped Accrual Active Lease",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          leaseEndDate:   leaseEnd,
          renewalStatus:  "active",  // NOT ended → SQL picks up lease_end_date for cap
        });
        // Activate from 4 months ago; lease ended 2 months ago.
        // Accrual must stop at leaseEnd, not continue to today.
        await activateTenancy(ownerClient, {
          propId,
          coverageStart:       monthStart(4),
          openingBalanceMinor: 0,
          attests:             true,
        });

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("known");
        // accrualThrough must equal lease_end_date (P0-A cap), not today.
        expect(prop.accrualThrough).toBe(leaseEnd);
        // outstanding_minor <= 3 months x rent (coverage 4mo, end 2mo ago = max 2mo capped)
        const maxMinor = 3 * 1200 * 100;
        expect(prop.outstandingMinor).toBeLessThanOrEqual(maxMinor);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-07: paymentStatus = 'paid' when fully paid ────────────────────────

    it("EC-07: paymentStatus = paid when outstanding_minor = 0 (fully paid)", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 600, address: "E170 EC07 - 7 Fully Paid Ave",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(2),
          renewalStatus:  "active",
        });
        await activateTenancy(ownerClient, {
          propId,
          coverageStart:       monthStart(1),
          openingBalanceMinor: 0,
          attests:             true,
        });
        // Pay more than enough to cover 1 month
        await insertPayments(admin, ownerUserId, [{
          property_id: propId,
          tenant_id:   tenantId,
          amount:      1200,  // 2× rent — fully paid
          status:      "paid",
          paid_at:     today(),
          due_date:    monthStart(1),
        }]);

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("known");
        expect(prop.outstandingMinor).toBe(0);
        expect(prop.paymentStatus).toBe("paid");
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── EC-08: paymentStatus = 'overdue' when activated and underpaid ─────────

    it("EC-08: paymentStatus = overdue when activated + months elapsed > 1 and underpaid", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 800, address: "E170 EC08 - 8 Overdue Blvd",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(4),
          renewalStatus:  "active",
        });
        // Activate 3 months ago; no payments → 3 months overdue
        await activateTenancy(ownerClient, {
          propId,
          coverageStart:       monthStart(3),
          openingBalanceMinor: 0,
          attests:             true,
        });

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.balanceState).toBe("known");
        expect(prop.paymentStatus).toBe("overdue");
        expect(prop.outstandingMinor).toBeGreaterThan(0);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });
  });
}
