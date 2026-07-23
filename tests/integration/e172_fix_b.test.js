/**
 * E-172 Fix B — finance_snapshot is_tenancy_ended becomes date-aware.
 *
 * The property_lease_end CTE in finance_snapshot now classifies a lease as ended
 * when EITHER renewal_status='ended' OR lease_end_date < CURRENT_DATE (date-ended),
 * whichever fires first.  Open-ended (null lease_end_date) is always active.
 *
 * Truth table:
 *   B-TT-01  renewal_status='ended', any date           → is_tenancy_ended = true
 *   B-TT-02  renewal_status='active', past end_date      → is_tenancy_ended = true  (E-172 fix)
 *   B-TT-03  renewal_status='active', future end_date    → is_tenancy_ended = false
 *   B-TT-04  renewal_status='active', null end_date      → is_tenancy_ended = false (open-ended)
 *
 * Two-as-at simulation:
 *   B-AS-01  lease_end_date = past  → is_tenancy_ended = true  (simulates "after end")
 *   B-AS-02  lease_end_date = future → is_tenancy_ended = false (simulates "before end")
 *
 * Consumer agreement:
 *   B-CA-01  isTenancyEnded field present in property_finance JSONB
 *   B-CA-02  Finance.jsx activation prompt gated: hidden when isTenancyEnded=true
 *             (CODE_READ_ONLY — verified by source inspection, not browser run)
 *
 * EC-02 flip (no assertion change):
 *   B-EC02   renewal_status='active' + past end_date → isTenancyEnded=true
 *            (exact scenario from e170.edgecases.test.js EC-02 — passes without edit)
 *
 * Regression guards:
 *   B-RG-01  GREEN-G1: explicitly-ended lease accrualThrough = lease_end_date (not today)
 *   B-RG-02  EC-06: active-labelled past-end capped at lease_end_date (Gate-1 CASE unchanged)
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB
 *
 * NOTE: The Gate-1 CASE accrual branches (WHEN/THEN/ELSE for lease_end_date selection)
 * are UNCHANGED by Fix B. Only the is_tenancy_ended derivation was modified.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  isE170SuiteEligible,
  bootstrapHarness,
  createE170Property,
  insertLease,
  activateTenancy,
  destroyE170Property,
  callSnapshot,
  findProp,
  today,
  dayOffset,
  monthStart,
} from "../../e170-suite/integration/_harness.js";

if (!isE170SuiteEligible()) {
  describe.skip("E-172 Fix B — date-aware is_tenancy_ended (harness not configured or not local)", () => {});
} else {
  describe("E-172 Fix B — date-aware is_tenancy_ended", () => {
    let admin, ownerClient, ownerUserId;

    beforeAll(async () => {
      ({ admin, ownerClient, ownerUserId } = await bootstrapHarness());
    }, 30_000);

    // ── B-TT-01: renewal_status='ended' (any date) → is_tenancy_ended=true ──────
    //
    // Existing behaviour — unchanged by Fix B. Still passes. Proves the status-path
    // is undamaged.

    it("B-TT-01: renewal_status=ended (any date) → is_tenancy_ended=true", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 900, address: "E172B TT01 - 1 Ended Status Rd",
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

    // ── B-TT-02: renewal_status='active', past end_date → is_tenancy_ended=true ─
    //
    // This is the core E-172 defect case. Before Fix B, is_tenancy_ended was false
    // because the NOT EXISTS only checked renewal_status (ignoring lease_end_date).
    // After Fix B the additional date condition fires, making NOT EXISTS return true.
    // This is also exactly EC-02 from e170.edgecases.test.js — it now passes without
    // any assertion edit.
    //
    // RED evidence (pre-fix): is_tenancy_ended = false  (bug)
    // GREEN evidence (post-fix): is_tenancy_ended = true (fix)

    it("B-TT-02 / EC-02: renewal_status=active + past end_date → is_tenancy_ended=true (E-172 fix)", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1250, address: "E172B TT02 Alice - 10 High Street",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: "2024-01-01",
          leaseEndDate:   "2024-12-31",  // well in the past
          renewalStatus:  "active",       // the import-default (E-172 bug condition)
        });

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();

        // CORRECT TARGET (is_tenancy_ended = true).
        // Before Fix B this was false — the signal EC-02 was tracking.
        // After Fix B it is true — EC-02 flips green without any assertion change.
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-TT-03: renewal_status='active', future end_date → is_tenancy_ended=false

    it("B-TT-03: renewal_status=active + future end_date → is_tenancy_ended=false (still active)", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1100, address: "E172B TT03 - 3 Future End Lane",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: today(),
          leaseEndDate:   dayOffset(90),  // 90 days in the future
          renewalStatus:  "active",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.isTenancyEnded).toBe(false);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-TT-04: open-ended (null lease_end_date) → is_tenancy_ended=false ──────
    //
    // Open-ended is a positive active state. null lease_end_date must NEVER produce
    // is_tenancy_ended=true. Confirmed: the new condition includes IS NULL on the
    // "still active" side, preserving open-ended as active.

    it("B-TT-04: renewal_status=active + null end_date (open-ended) → is_tenancy_ended=false", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 800, address: "E172B TT04 - 4 Open Ended Blvd",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          leaseEndDate:   null,           // open-ended
          renewalStatus:  "active",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(prop.isTenancyEnded).toBe(false);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-AS-01: Two-as-at simulation: past lease_end_date → ended ────────────

    it("B-AS-01: simulated past as-at (lease_end_date in past) → is_tenancy_ended=true", async () => {
      let propId, tenantId;
      try {
        // lease_end_date = 7 days ago; CURRENT_DATE is today → date condition fires
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 700, address: "E172B AS01 - 5 Past End Way",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          leaseEndDate:   dayOffset(-7), // 7 days in the past
          renewalStatus:  "active",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        // As-at = CURRENT_DATE; lease ended 7 days ago → is_tenancy_ended = true
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-AS-02: Two-as-at simulation: future lease_end_date → still active ──

    it("B-AS-02: simulated future as-at (lease_end_date in future) → is_tenancy_ended=false", async () => {
      let propId, tenantId;
      try {
        // lease_end_date = 14 days from now; CURRENT_DATE is today → still active
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 700, address: "E172B AS02 - 6 Future End Way",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          leaseEndDate:   dayOffset(14), // 14 days in the future
          renewalStatus:  "active",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        // As-at = CURRENT_DATE; lease ends in 14 days → still active
        expect(prop.isTenancyEnded).toBe(false);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-CA-01: Consumer agreement: isTenancyEnded present in snapshot JSONB ─

    it("B-CA-01: isTenancyEnded field is present in property_finance JSONB for all properties", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 600, address: "E172B CA01 - 7 Contract Check Close",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(2),
          renewalStatus:  "active",
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        // Field must exist and be a boolean (not undefined)
        expect(typeof prop.isTenancyEnded).toBe("boolean");
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-RG-01: Regression guard — GREEN-G1 still passes ────────────────────
    //
    // An explicitly-ended lease (renewal_status='ended') must have:
    //   accrualThrough = lease_end_date (committed Gate-1 fix 534d171)
    // The CASE block in property_lease_end is UNCHANGED by Fix B.

    it("B-RG-01 GREEN-G1: explicitly-ended lease accrualThrough = lease_end_date (Gate-1 unchanged)", async () => {
      let propId, tenantId;
      try {
        const leaseEnd = "2024-06-30"; // fixed past date
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1000, address: "E172B RG01 - 8 Gate1 Regression Rd",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: "2024-01-01",
          leaseEndDate:   leaseEnd,
          renewalStatus:  "ended",
        });
        await activateTenancy(ownerClient, {
          propId,
          coverageStart:       "2024-01-01",
          openingBalanceMinor: 0,
          attests:             true,
        });
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        // GREEN-G1: accrualThrough must cap at lease_end_date, not CURRENT_DATE
        expect(prop.accrualThrough).toBe(leaseEnd);
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-RG-02: Regression guard — EC-06 still passes ───────────────────────
    //
    // An active-labelled lease (renewal_status='active') with a past end_date must
    // still cap accrualThrough at lease_end_date (Gate-1 P0-A fix).
    // Fix B does NOT change the Gate-1 CASE block; only is_tenancy_ended changes.
    //
    // Before Fix B: is_tenancy_ended=false (bug), accrualThrough=leaseEnd (correct)
    // After Fix B:  is_tenancy_ended=true  (fix), accrualThrough=leaseEnd (still correct)

    it("B-RG-02 EC-06: active-labelled lease with past end_date → accrualThrough=lease_end_date (Gate-1 P0-A cap unchanged)", async () => {
      let propId, tenantId;
      try {
        const leaseEnd = monthStart(2); // first of 2 months ago
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 1200, address: "E172B RG02 EC06 - 9 Capped Accrual Active",
        }));
        await insertLease(admin, {
          propId,
          tenantId,
          leaseStartDate: monthStart(6),
          leaseEndDate:   leaseEnd,
          renewalStatus:  "active",  // active-labelled — the import-default scenario
        });
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
        // Gate-1 P0-A cap: accrualThrough must equal lease_end_date (not today)
        expect(prop.accrualThrough).toBe(leaseEnd);
        // Fix B new assertion: is_tenancy_ended is now true (was false pre-fix)
        expect(prop.isTenancyEnded).toBe(true);
        // Accrual capped; outstanding not inflated
        const maxMinor = 3 * 1200 * 100;
        expect(prop.outstandingMinor).toBeLessThanOrEqual(maxMinor);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });

    // ── B-ALREADY-IMPORTED: bad rows heal on read, no mutation needed ─────────
    //
    // Simulates an already-imported row (renewal_status='active', past end_date).
    // Fix B makes the read path correctly classify it as ended — no UPDATE needed.

    it("B-ALREADY-IMPORTED: pre-existing row with renewal_status=active + past end_date reads is_tenancy_ended=true with no data mutation", async () => {
      let propId, tenantId;
      try {
        ({ propId, tenantId } = await createE170Property(admin, ownerUserId, {
          rent: 900, address: "E172B IMPORT - 10 Already Imported Ave",
        }));
        // Directly insert a row simulating an already-imported bad row
        await admin.from("leases").insert({
          account_id:       "11111111-1111-1111-1111-111111111111",
          property_id:      propId,
          tenant_id:        tenantId,
          lease_start_date: "2024-01-01",
          lease_end_date:   "2024-06-30", // past
          renewal_status:   "active",      // old bad-import default
        });

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        // Read path heals: is_tenancy_ended=true despite renewal_status='active'
        expect(prop.isTenancyEnded).toBe(true);
      } finally {
        if (propId) await destroyE170Property(admin, propId, tenantId);
      }
    });
  });
}
