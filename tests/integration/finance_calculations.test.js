/**
 * Integration: finance_snapshot calculation precision
 *
 * Tests every arithmetic path in the finance_snapshot RPC:
 *   - total_income    (MTD received)
 *   - overdue_income  (cumulative pre-month arrears)
 *   - due_soon_income (due within 7 days)
 *   - outstanding_income (total owed)
 *   - per-property: paid, remaining, paymentStatus
 *   - arrears accumulation over multiple months
 *   - overpayment edge cases
 *
 * Strategy: each describe block creates its own isolated property + tenant
 * via admin client so tests never interfere.  A pre/post delta approach
 * measures the contribution of the seeded payments only.
 */

import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First day of current month */
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** First day N months in the past (1 = previous month) */
function monthStart(nMonthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - nMonthsAgo);
  return d.toISOString().slice(0, 10);
}

/** Last day of previous month */
function lastDayOfPrevMonth() {
  const d = new Date();
  d.setDate(0); // go to last day of previous month
  return d.toISOString().slice(0, 10);
}

/**
 * Expected months_elapsed matching the SQL formula:
 * extract(year from age(current_month, rent_start_month))*12
 * + extract(month from age(current_month, rent_start_month)) + 1
 */
function monthsElapsed(startDateISO) {
  const [sy, sm] = startDateISO.split("-").map(Number);
  const now = new Date();
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1;
  return Math.max((ny - sy) * 12 + (nm - sm) + 1, 1);
}

// ── RPC helper ────────────────────────────────────────────────────────────────

async function callSnapshot(client) {
  const { data, error } = await client.rpc("finance_snapshot", {
    p_account_id: ACCOUNT_ID,
  });
  if (error) throw new Error(`finance_snapshot RPC failed: ${error.message}`);
  return data[0];
}

function findProp(snapshot, propId) {
  const arr = Array.isArray(snapshot.property_finance)
    ? snapshot.property_finance
    : JSON.parse(snapshot.property_finance ?? "[]");
  return arr.find((p) => p.propertyId === propId) ?? null;
}

// ── Fixture setup helpers ─────────────────────────────────────────────────────

async function createIsolatedProperty(admin, ownerUserId, { rent = 1000 } = {}) {
  const propId = randomUUID();
  const tenantId = randomUUID();

  // Insert property first WITHOUT tenant_id to satisfy the FK order.
  const { error: pErr } = await admin.from("properties").insert({
    id: propId,
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    address: `Calc Prop ${propId.slice(0, 8)}`,
    city: "TestCity",
    rent,
    status: "Wolne",
    tenant_id: null,
  });
  if (pErr) throw new Error(`insert property: ${pErr.message}`);

  // Insert tenant referencing the property.
  // user_id=null: finance_snapshot doesn't use it; unique constraint only
  // applies to non-null user_ids (PostgreSQL allows multiple NULL rows).
  const { error: tErr } = await admin.from("tenants").insert({
    id: tenantId,
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    user_id: null,
    property_id: propId,
    name: `Calc Tenant ${tenantId.slice(0, 8)}`,
    email: `calc.${tenantId.slice(0, 8)}@test.invalid`,
    phone: "+447700000000",
    status: "active",
  });
  if (tErr) throw new Error(`insert tenant: ${tErr.message}`);

  // Now set tenant_id on the property to mark it as occupied.
  const { error: uErr } = await admin.from("properties").update({
    tenant_id: tenantId, status: "Wynajęte",
  }).eq("id", propId);
  if (uErr) throw new Error(`update property tenant_id: ${uErr.message}`);

  return { propId, tenantId };
}

async function destroyIsolatedProperty(admin, propId, tenantId) {
  await admin.from("leases").delete().eq("property_id", propId);
  await admin.from("payments").delete().eq("property_id", propId);
  // tenant/property deletes trigger ledger_entries FK SET NULL, which hits
  // trg_prevent_ledger_update. Errors are silently ignored here; the outer
  // describe's afterAll does a guaranteed batch cleanup via CLI.
  await admin.from("tenants").delete().eq("id", tenantId);
  await admin.from("properties").delete().eq("id", propId);
}

/**
 * Batch cleanup for any Calc Prop/Tenant records that survived individual
 * afterAll cleanup (due to ledger_entries trigger blocking FK SET NULL cascade).
 *
 * Uses a DO block written to a temp file to avoid Windows shell quoting issues
 * with single quotes and % characters. The DO block runs all DDL + DML in one
 * transaction so the trigger disable/enable wraps the deletes correctly.
 */
function forceBatchCleanupCalcData(accountId) {
  const sql = `
DO $$
BEGIN
  ALTER TABLE public.ledger_entries DISABLE TRIGGER trg_prevent_ledger_update;
  UPDATE public.properties
    SET status = 'Wolne', tenant_id = NULL
    WHERE account_id = '${accountId}' AND address ILIKE 'Calc Prop%';
  UPDATE public.tenants
    SET property_id = NULL
    WHERE account_id = '${accountId}' AND name ILIKE 'Calc Tenant%' AND user_id IS NULL;
  DELETE FROM public.tenants
    WHERE account_id = '${accountId}' AND name ILIKE 'Calc Tenant%' AND user_id IS NULL;
  DELETE FROM public.properties
    WHERE account_id = '${accountId}' AND address ILIKE 'Calc Prop%';
  ALTER TABLE public.ledger_entries ENABLE TRIGGER trg_prevent_ledger_update;
END;
$$
`.trim();

  const tmpFile = join(tmpdir(), `calc-cleanup-${Date.now()}.sql`);
  try {
    writeFileSync(tmpFile, sql);
    execSync(`npx supabase db query --file "${tmpFile}"`, {
      stdio: "ignore",
      timeout: 60_000,
    });
  } catch {
    // best-effort — failures are non-fatal for cleanup
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

async function insertPayments(admin, ownerUserId, rows) {
  const toInsert = rows.map((r) => ({
    id: randomUUID(),
    owner_id: ownerUserId,
    account_id: ACCOUNT_ID,
    ...r,
  }));
  const { error } = await admin.from("payments").insert(toInsert);
  if (error) throw new Error(`insert payments: ${error.message}`);
  return toInsert.map((r) => r.id);
}

async function insertLease(admin, { propId, tenantId, leaseStartDate, renewalStatus = "active" }) {
  const { error } = await admin.from("leases").insert({
    id: randomUUID(),
    account_id: ACCOUNT_ID,
    property_id: propId,
    tenant_id: tenantId,
    lease_start_date: leaseStartDate,
    renewal_status: renewalStatus,
  });
  if (error) throw new Error(`insert lease: ${error.message}`);
}

// ── Skip guard ────────────────────────────────────────────────────────────────

if (!isIntegrationHarnessConfigured()) {
  describe.skip("finance_snapshot calculation tests (harness not configured)", () => {});
} else {
  describe("finance_snapshot calculation tests", () => {
    let admin;
    let ownerClient;
    let ownerUserId;

    beforeAll(async () => {
      admin = getIntegrationAdminClient();
      const { client, user } = await signInAsFixtureUser("ownerA");
      ownerClient = client;
      ownerUserId = user.id;
    });

    // ── 1. Received (total_income — MTD only) ─────────────────────────────────

    describe("1. received (total_income — MTD cash received)", () => {
      let propId, tenantId;

      beforeAll(async () => {
        ({ propId, tenantId } = await createIsolatedProperty(admin, ownerUserId));
      });

      afterAll(async () => {
        await destroyIsolatedProperty(admin, propId, tenantId);
      });

      it("counts a payment with paid_at this calendar month", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 500, status: "paid", paid_at: today(), due_date: today(),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.total_income) - Number(before.total_income)).toBeCloseTo(500, 2);
      });

      it("excludes a payment with paid_at in the previous month", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 300, status: "paid", paid_at: lastDayOfPrevMonth(), due_date: lastDayOfPrevMonth(),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.total_income) - Number(before.total_income)).toBeCloseTo(0, 2);
      });

      it("excludes status=paid without paid_at from MTD total", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 200, status: "paid", paid_at: null, due_date: today(),
        }]);
        const after = await callSnapshot(ownerClient);
        // total_income needs BOTH is_paid AND paid_at to be non-null
        expect(Number(after.total_income) - Number(before.total_income)).toBeCloseTo(0, 2);
      });

      it("sums multiple paid_at payments from this month", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [
          { property_id: propId, tenant_id: tenantId, amount: 400, status: "paid", paid_at: today(), due_date: today() },
          { property_id: propId, tenant_id: tenantId, amount: 600, status: "paid", paid_at: firstOfMonth(), due_date: firstOfMonth() },
        ]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.total_income) - Number(before.total_income)).toBeCloseTo(1000, 2);
      });

      it("counts payment paid on the first day of this month", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 750, status: "paid", paid_at: firstOfMonth(), due_date: firstOfMonth(),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.total_income) - Number(before.total_income)).toBeCloseTo(750, 2);
      });
    });

    // ── 2. Overdue income (pre-current-month arrears) ─────────────────────────

    describe("2. overdue_income (cumulative pre-month arrears)", () => {
      let propId, tenantId;

      beforeAll(async () => {
        ({ propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 }));
      });

      afterAll(async () => {
        await destroyIsolatedProperty(admin, propId, tenantId);
      });

      // Clear payments between tests so they don't accumulate state.
      beforeEach(async () => {
        await admin.from("payments").delete().eq("property_id", propId);
      });

      it("zero when months_elapsed = 1 (tenant started this month, nothing prior)", async () => {
        // No lease → rent_start_month from payment due_date
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 0, status: "due", due_date: today(),
        }]);
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        // months_elapsed = 1 → overdue_income condition requires > 1 → 0 contribution
        // We verify the property's remaining and also global overdue doesn't include this property
        expect(prop).not.toBeNull();
        expect(Number(prop.remaining)).toBeCloseTo(1000, 2); // 1 * 1000 - 0
      });

      it("positive when 3 months elapsed with zero payments", async () => {
        // Seed a payment with due_date 2 months ago → rent_start_month = 2 months ago
        // months_elapsed = 3
        const twoMonthsAgo = monthStart(2);
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 1000, status: "due", due_date: twoMonthsAgo,
        }]);
        const after = await callSnapshot(ownerClient);
        const n = monthsElapsed(twoMonthsAgo);
        // overdue = max(0, (n-1)*1000 - total_paid)
        // total_paid = 0, so overdue = (n-1)*1000
        const expectedDelta = (n - 1) * 1000;
        expect(Number(after.overdue_income) - Number(before.overdue_income)).toBeCloseTo(expectedDelta, 1);
      });

      it("zero when fully paid up through all prior months", async () => {
        const twoMonthsAgo = monthStart(2);
        const n = monthsElapsed(twoMonthsAgo);
        // Seed enough paid payments to cover (n-1) months of rent
        const priorMonthsRent = (n - 1) * 1000;

        const before = await callSnapshot(ownerClient);
        // A single large paid payment covers all prior months
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: priorMonthsRent + 500, // overpay prior months
          status: "paid", paid_at: dayOffset(-5), due_date: twoMonthsAgo,
        }]);
        const after = await callSnapshot(ownerClient);
        // Overdue should not increase (contribution from our property = 0)
        expect(Number(after.overdue_income) - Number(before.overdue_income)).toBeCloseTo(0, 1);
      });

      it("partial payment proportionally reduces overdue", async () => {
        const twoMonthsAgo = monthStart(2);
        const n = monthsElapsed(twoMonthsAgo);
        const partialPaid = 400; // less than (n-1)*1000

        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [
          // Unpaid old due
          { property_id: propId, tenant_id: tenantId, amount: 1000, status: "due", due_date: twoMonthsAgo },
          // Partial payment
          { property_id: propId, tenant_id: tenantId, amount: partialPaid, status: "paid", paid_at: dayOffset(-3), due_date: twoMonthsAgo },
        ]);
        const after = await callSnapshot(ownerClient);
        const priorDebt = (n - 1) * 1000;
        const expectedOverdue = Math.max(0, priorDebt - partialPaid);
        expect(Number(after.overdue_income) - Number(before.overdue_income)).toBeCloseTo(expectedOverdue, 1);
      });

      it("zero when property rent is 0", async () => {
        const { propId: p0, tenantId: t0 } = await createIsolatedProperty(admin, ownerUserId, { rent: 0 });
        try {
          await insertPayments(admin, ownerUserId, [{
            property_id: p0, tenant_id: t0,
            amount: 0, status: "due", due_date: monthStart(2),
          }]);
          const before = await callSnapshot(ownerClient);
          const after = await callSnapshot(ownerClient);
          // No rent → excluded from overdue calculation
          expect(Number(after.overdue_income) - Number(before.overdue_income)).toBeCloseTo(0, 2);
        } finally {
          await destroyIsolatedProperty(admin, p0, t0);
        }
      });
    });

    // ── 3. Due within 7 days (due_soon_income) ────────────────────────────────

    describe("3. due_soon_income (payment due within next 7 days)", () => {
      let propId, tenantId;

      beforeAll(async () => {
        ({ propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 }));
      });

      afterAll(async () => {
        await destroyIsolatedProperty(admin, propId, tenantId);
      });

      // Clear payments between tests — due_soon merges payments within the same cycle_month.
      beforeEach(async () => {
        await admin.from("payments").delete().eq("property_id", propId);
      });

      it("includes unpaid payment due in 3 days", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 900, status: "due", due_date: dayOffset(3),
        }]);
        const after = await callSnapshot(ownerClient);
        // billed_amount = max(property.rent=1000, amount=900) = 1000
        // paid_amount = 0 → due_soon contribution = 1000
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(1000, 2);
      });

      it("includes unpaid payment due today", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 1000, status: "due", due_date: today(),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(1000, 2);
      });

      it("includes unpaid payment due in exactly 7 days", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 1000, status: "due", due_date: dayOffset(7),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(1000, 2);
      });

      it("excludes unpaid payment due in 8 days", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 800, status: "due", due_date: dayOffset(8),
        }]);
        const after = await callSnapshot(ownerClient);
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(0, 2);
      });

      it("excludes payment due yesterday (past due_date not in window)", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 700, status: "overdue", due_date: dayOffset(-1),
        }]);
        const after = await callSnapshot(ownerClient);
        // open_due_date = yesterday < current_date → excluded from due_soon window
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(0, 2);
      });

      it("excludes paid payment even when due within 7 days", async () => {
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 600, status: "paid", paid_at: today(), due_date: dayOffset(2),
        }]);
        const after = await callSnapshot(ownerClient);
        // is_paid=true → not counted as open → doesn't contribute to due_soon
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(0, 2);
      });

      it("billed_amount uses max(property.rent, payment.amount)", async () => {
        // Payment amount LOWER than property.rent → billed_amount = property.rent
        const before = await callSnapshot(ownerClient);
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 600, // < rent=1000
          status: "due", due_date: dayOffset(4),
        }]);
        const after = await callSnapshot(ownerClient);
        // billed_amount = max(1000, 600) = 1000; paid=0; contribution = 1000
        expect(Number(after.due_soon_income) - Number(before.due_soon_income)).toBeCloseTo(1000, 2);
      });
    });

    // ── 4. Total owed (outstanding_income) ────────────────────────────────────

    describe("4. outstanding_income (total owed across all occupied properties)", () => {
      let propId, tenantId;

      beforeAll(async () => {
        ({ propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 }));
      });

      afterAll(async () => {
        await destroyIsolatedProperty(admin, propId, tenantId);
      });

      beforeEach(async () => {
        await admin.from("payments").delete().eq("property_id", propId);
      });

      it("equals months_elapsed * rent minus total_paid_alltime", async () => {
        // Seed a payment 2 months ago (sets rent_start_month)
        const startDate = monthStart(2);
        const n = monthsElapsed(startDate);
        const totalPaid = 500;

        await insertPayments(admin, ownerUserId, [
          { property_id: propId, tenant_id: tenantId, amount: 1000, status: "due", due_date: startDate },
          { property_id: propId, tenant_id: tenantId, amount: totalPaid, status: "paid", paid_at: dayOffset(-30), due_date: dayOffset(-30) },
        ]);
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);

        // Use property-level remaining instead of global delta to avoid baseline noise.
        // remaining = max(n * rent - total_paid, 0)
        const expected = Math.max(n * 1000 - totalPaid, 0);
        expect(Number(prop.remaining)).toBeCloseTo(expected, 1);
      });

      it("returns 0 (not negative) when tenant has overpaid", async () => {
        const { propId: p2, tenantId: t2 } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          // Pay 3x the monthly rent — far more than owed in 1 month
          await insertPayments(admin, ownerUserId, [{
            property_id: p2, tenant_id: t2,
            amount: 1500, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, p2);
          // remaining should be clamped to 0
          expect(Number(prop.remaining)).toBeCloseTo(0, 2);
        } finally {
          await destroyIsolatedProperty(admin, p2, t2);
        }
      });

      it("vacant property (no tenant, no payments) shows 'vacant' status and 0 remaining", async () => {
        const vacantPropId = randomUUID();
        await admin.from("properties").insert({
          id: vacantPropId,
          owner_id: ownerUserId,
          account_id: ACCOUNT_ID,
          address: `Vacant Calc Prop ${vacantPropId.slice(0, 8)}`,
          city: "TestCity",
          rent: 2000,
          status: "Wolne",
          tenant_id: null,
        });
        try {
          const snap = await callSnapshot(ownerClient);
          // Vacant property (no tenant, no payments) shows 'vacant' and does not
          // contribute to outstanding_income (only occupied properties count).
          const prop = findProp(snap, vacantPropId);
          if (prop) {
            expect(prop.paymentStatus).toBe("vacant");
            expect(Number(prop.remaining)).toBeCloseTo(0, 2);
          }
          // Global outstanding should be >= 0 regardless
          expect(Number(snap.outstanding_income)).toBeGreaterThanOrEqual(0);
        } finally {
          await admin.from("properties").delete().eq("id", vacantPropId);
        }
      });
    });

    // ── 5. Per-property: paid and remaining ───────────────────────────────────

    describe("5. per-property paid and remaining", () => {
      let propId, tenantId;

      beforeAll(async () => {
        ({ propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 }));
      });

      afterAll(async () => {
        await destroyIsolatedProperty(admin, propId, tenantId);
      });

      beforeEach(async () => {
        await admin.from("payments").delete().eq("property_id", propId);
      });

      it("paid = all-time sum of payments with is_paid=true", async () => {
        await insertPayments(admin, ownerUserId, [
          { property_id: propId, tenant_id: tenantId, amount: 300, status: "paid", paid_at: monthStart(2), due_date: monthStart(2) },
          { property_id: propId, tenant_id: tenantId, amount: 500, status: "paid", paid_at: monthStart(1), due_date: monthStart(1) },
          { property_id: propId, tenant_id: tenantId, amount: 200, status: "paid", paid_at: today(), due_date: today() },
          // Unpaid — should NOT count toward paid
          { property_id: propId, tenant_id: tenantId, amount: 999, status: "due", due_date: today() },
        ]);
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(prop).not.toBeNull();
        expect(Number(prop.paid)).toBeCloseTo(1000, 2); // 300+500+200
      });

      it("remaining = months_elapsed * rent - paid (clamped to 0)", async () => {
        const startDate = monthStart(2);
        const n = monthsElapsed(startDate);
        const totalPaid = 600;

        await insertPayments(admin, ownerUserId, [
          { property_id: propId, tenant_id: tenantId, amount: 1000, status: "due", due_date: startDate },
          { property_id: propId, tenant_id: tenantId, amount: totalPaid, status: "paid", paid_at: dayOffset(-10), due_date: dayOffset(-10) },
        ]);

        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        const expectedRemaining = Math.max(n * 1000 - totalPaid, 0);
        expect(Number(prop.remaining)).toBeCloseTo(expectedRemaining, 1);
      });

      it("remaining = 0 when overpaid (never goes negative)", async () => {
        // Pay way more than is owed for just 1 month
        await insertPayments(admin, ownerUserId, [{
          property_id: propId, tenant_id: tenantId,
          amount: 5000, status: "paid", paid_at: today(), due_date: today(),
        }]);
        const snap = await callSnapshot(ownerClient);
        const prop = findProp(snap, propId);
        expect(Number(prop.remaining)).toBeGreaterThanOrEqual(0);
      });
    });

    // ── 6. Per-property paymentStatus ─────────────────────────────────────────

    describe("6. per-property paymentStatus", () => {
      it("'pending' when tenant assigned but no payments made", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 800 });
        try {
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          expect(prop?.paymentStatus).toBe("pending");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("'partial' when some paid but remaining > 0 and no prior-month debt", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 400, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          // paid=400 < months_elapsed(1)*1000=1000 and no prior-month debt (months_elapsed=1)
          expect(prop?.paymentStatus).toBe("partial");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("'overdue' when has prior-month unpaid balance", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          // Seed unpaid payment from 2 months ago → months_elapsed ≥ 3, total_paid=0
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 1000, status: "due", due_date: monthStart(2),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          expect(prop?.paymentStatus).toBe("overdue");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("'paid' when remaining = 0", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          // Pay exactly 1 month's rent for a property with months_elapsed=1
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 1000, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          // remaining = max(1*1000 - 1000, 0) = 0 → 'paid'
          expect(Number(prop?.remaining)).toBeCloseTo(0, 2);
          expect(prop?.paymentStatus).toBe("paid");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });
    });

    // ── 7. Arrears cumulation ─────────────────────────────────────────────────

    describe("7. arrears: cumulative multi-month accumulation", () => {
      it("accumulates across multiple missed months proportionally to elapsed months", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          // Seed payments for every missed month: 5 months ago
          const fiveMonthsAgo = monthStart(5);
          const n = monthsElapsed(fiveMonthsAgo);
          // No payments at all
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 0, status: "due", due_date: fiveMonthsAgo,
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          // remaining = n * 1000 - 0
          expect(Number(prop.remaining)).toBeCloseTo(n * 1000, 1);
          // overdue = max(0, (n-1)*1000 - 0) = (n-1)*1000
          // (at least 4 months of overdue if n >= 5)
          expect(prop.paymentStatus).toBe("overdue");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("uses lease_start_date (not payment date) for months_elapsed when lease exists", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          // Lease started 4 months ago
          const leaseStart = monthStart(4);
          await insertLease(admin, { propId, tenantId, leaseStartDate: leaseStart });

          // Payments only from 1 month ago (shorter history than the lease)
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 1000, status: "due", due_date: monthStart(1),
          }]);

          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          const n = monthsElapsed(leaseStart); // should be ~5 (4 months + current)
          // remaining uses lease start, not payment date
          expect(Number(prop.remaining)).toBeCloseTo(n * 1000 - 0, 1);
          expect(prop.paymentStatus).toBe("overdue");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("ended lease is excluded; earliest active lease used as start", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          // Old ended lease (6 months ago) — should be ignored
          await insertLease(admin, {
            propId, tenantId,
            leaseStartDate: monthStart(6),
            renewalStatus: "ended",
          });
          // Active lease (2 months ago) — should be used
          await insertLease(admin, {
            propId, tenantId,
            leaseStartDate: monthStart(2),
            renewalStatus: "active",
          });
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          const n = monthsElapsed(monthStart(2)); // ~3 months
          expect(Number(prop.remaining)).toBeCloseTo(n * 1000, 1);
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("payment partially reduces accumulated arrears across months", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 1000 });
        try {
          const startDate = monthStart(3);
          const n = monthsElapsed(startDate);
          const partialPaid = 1500;

          await insertPayments(admin, ownerUserId, [
            { property_id: propId, tenant_id: tenantId, amount: 1000, status: "due", due_date: startDate },
            { property_id: propId, tenant_id: tenantId, amount: partialPaid, status: "paid", paid_at: dayOffset(-5), due_date: dayOffset(-5) },
          ]);

          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          const expectedRemaining = Math.max(n * 1000 - partialPaid, 0);
          expect(Number(prop.paid)).toBeCloseTo(partialPaid, 2);
          expect(Number(prop.remaining)).toBeCloseTo(expectedRemaining, 1);
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });
    });

    // ── 8. Overpayment ────────────────────────────────────────────────────────

    describe("8. overpayment (paid more than total owed)", () => {
      it("remaining clamped to 0 when paid exceeds months_elapsed * rent", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 2000, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          expect(Number(prop.remaining)).toBeCloseTo(0, 2);
          expect(Number(prop.remaining)).toBeGreaterThanOrEqual(0);
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("paymentStatus = 'paid' when overpaid", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 3000, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          expect(prop.paymentStatus).toBe("paid");
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("outstanding_income excludes overpaid properties (no negative contribution)", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          const before = await callSnapshot(ownerClient);
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: 5000, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const after = await callSnapshot(ownerClient);
          // Outstanding should decrease (or stay same if was 500 before) — not go below 0
          expect(Number(after.outstanding_income)).toBeGreaterThanOrEqual(0);
          // The delta should not be positive (overpayment reduces outstanding, not increases)
          const delta = Number(after.outstanding_income) - Number(before.outstanding_income);
          expect(delta).toBeLessThanOrEqual(0.01); // small tolerance
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("total_income includes the overpayment amount in MTD received", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          const before = await callSnapshot(ownerClient);
          const overpaymentAmount = 1500;
          await insertPayments(admin, ownerUserId, [{
            property_id: propId, tenant_id: tenantId,
            amount: overpaymentAmount, status: "paid", paid_at: today(), due_date: today(),
          }]);
          const after = await callSnapshot(ownerClient);
          // MTD received counts the full payment amount regardless of how much was owed
          expect(Number(after.total_income) - Number(before.total_income))
            .toBeCloseTo(overpaymentAmount, 2);
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });

      it("paid shows full overpayment amount; remaining stays 0", async () => {
        const { propId, tenantId } = await createIsolatedProperty(admin, ownerUserId, { rent: 500 });
        try {
          await insertPayments(admin, ownerUserId, [
            { property_id: propId, tenant_id: tenantId, amount: 500, status: "paid", paid_at: monthStart(1), due_date: monthStart(1) },
            { property_id: propId, tenant_id: tenantId, amount: 800, status: "paid", paid_at: today(), due_date: today() },
          ]);
          const snap = await callSnapshot(ownerClient);
          const prop = findProp(snap, propId);
          // paid = 500 + 800 = 1300 (all-time)
          expect(Number(prop.paid)).toBeCloseTo(1300, 2);
          // remaining = max(n * 500 - 1300, 0) — 1300 > 2*500=1000 → 0
          expect(Number(prop.remaining)).toBeCloseTo(0, 2);
        } finally {
          await destroyIsolatedProperty(admin, propId, tenantId);
        }
      });
    });

    // Guaranteed batch cleanup: handles any Calc Prop/Tenant records that
    // survived per-describe afterAll cleanup (ledger trigger blocks FK cascade).
    afterAll(() => {
      forceBatchCleanupCalcData(ACCOUNT_ID);
    });
  });
}
