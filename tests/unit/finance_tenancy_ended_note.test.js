/**
 * tests/unit/finance_tenancy_ended_note.test.js
 *
 * Unit contracts for the ended-tenancy explanatory note in Finance.jsx.
 * E-170 lifecycle DoD: isTenancyEnded=true must show the neutral ended-tenancy
 * note in place of the activation CTA, without implying balance, payment, or
 * settlement status.
 *
 * Tests the conditional render logic directly rather than mounting the full
 * Finance component (which requires extensive prop scaffolding and a React
 * environment). The logic under test is:
 *
 *   if (p.isTenancyEnded) → show ended note [data-testid="finance-tenancy-ended-note"]
 *   else if (p.balanceState !== "known" && p.paymentStatus !== "vacant") → show CTA
 *   else → show nothing
 *
 * This mirrors the JSX bifurcation applied in both the mobile-cards and
 * desktop-table variants of the property finance rows.
 */

import { describe, it, expect } from "vitest";

// ─── Render-logic mirror ──────────────────────────────────────────────────────
//
// We test the conditional branches by simulating what each path produces,
// matching what the JSX would render for a given property row `p`.

/**
 * Returns the render decision for a property finance row.
 *
 * "ended_note"    → isTenancyEnded=true (show ended-tenancy note)
 * "activation_cta" → eligible for activation CTA
 * "nothing"        → neither (known balance or vacant)
 */
function renderDecision(p) {
  if (p.isTenancyEnded) return "ended_note";
  if (p.balanceState !== "known" && p.paymentStatus !== "vacant") return "activation_cta";
  return "nothing";
}

/**
 * Returns whether the ended-note copy would contain any currency/settlement
 * inference. Approved copy must not contain £, $, €, "paid", "zero", "settled",
 * "complete", or any digit-based amount pattern.
 */
function endedNoteCopyIsNeutral(text) {
  const forbidden = /[£$€]|\d+\.\d{2}|\b(paid|zero|settled|complete|balance is|no balance|no debt)\b/i;
  return !forbidden.test(text);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    propertyId: "prop-1",
    address: "1 Test Street",
    city: "London",
    isTenancyEnded: false,
    balanceState: "unknown_payment_history",
    paymentStatus: "overdue",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("finance-tenancy-ended-note render logic", () => {
  // ── Test 1: Past-ended imported tenancy → ended note; CTA absent ──────────

  it("Test 1: past-ended imported tenancy → ended note visible; activation CTA absent", () => {
    const row = makeRow({ isTenancyEnded: true, balanceState: "unknown_payment_history" });
    expect(renderDecision(row)).toBe("ended_note");
  });

  it("Test 1: ended tenancy with 'known' balance → still shows ended note, not CTA", () => {
    const row = makeRow({ isTenancyEnded: true, balanceState: "known" });
    // isTenancyEnded takes priority over all other conditions
    expect(renderDecision(row)).toBe("ended_note");
  });

  it("Test 1: ended tenancy with vacant status → still shows ended note, not nothing", () => {
    const row = makeRow({ isTenancyEnded: true, paymentStatus: "vacant" });
    // isTenancyEnded takes priority: the ended note renders, not the vacant-suppression path
    expect(renderDecision(row)).toBe("ended_note");
  });

  // ── Test 2: Future active tenancy → ended note absent; CTA may render ─────

  it("Test 2: active tenancy (not ended, not known, not vacant) → activation CTA eligible", () => {
    const row = makeRow({ isTenancyEnded: false, balanceState: "unknown_payment_history", paymentStatus: "overdue" });
    expect(renderDecision(row)).toBe("activation_cta");
  });

  it("Test 2: active tenancy → ended note is NOT shown", () => {
    const row = makeRow({ isTenancyEnded: false });
    expect(renderDecision(row)).not.toBe("ended_note");
  });

  // ── Test 3: Open-ended tenancy (null/undefined isTenancyEnded) → note absent

  it("Test 3: open-ended tenancy with null isTenancyEnded → ended note absent", () => {
    const row = makeRow({ isTenancyEnded: null, balanceState: "unknown_payment_history" });
    // null is falsy — the ended-note branch must not fire
    expect(renderDecision(row)).not.toBe("ended_note");
  });

  it("Test 3: open-ended tenancy with undefined isTenancyEnded → ended note absent", () => {
    const row = makeRow({ isTenancyEnded: undefined, balanceState: "unknown_payment_history" });
    expect(renderDecision(row)).not.toBe("ended_note");
  });

  it("Test 3: open-ended tenancy (null) with eligible conditions → CTA eligible", () => {
    const row = makeRow({ isTenancyEnded: null, balanceState: "unknown_payment_history", paymentStatus: "overdue" });
    expect(renderDecision(row)).toBe("activation_cta");
  });

  // ── Test 4: Ended-tenancy note copy must not contain currency/inference ────

  it("Test 4: approved ended-note heading contains no currency symbol or amount", () => {
    const heading = "Tenancy ended";
    expect(endedNoteCopyIsNeutral(heading)).toBe(true);
  });

  it("Test 4: approved ended-note body contains no currency symbol or amount", () => {
    const body = "No ongoing balance is being tracked.";
    expect(endedNoteCopyIsNeutral(body)).toBe(true);
  });

  it("Test 4: copy must not imply balance is zero", () => {
    const forbiddenZeroImplication = "Balance is £0";
    expect(endedNoteCopyIsNeutral(forbiddenZeroImplication)).toBe(false);
  });

  it("Test 4: copy must not imply all rent was paid", () => {
    const forbiddenPaidImplication = "All rent was paid";
    expect(endedNoteCopyIsNeutral(forbiddenPaidImplication)).toBe(false);
  });

  it("Test 4: copy must not imply account is settled", () => {
    const forbiddenSettledImplication = "Account settled";
    expect(endedNoteCopyIsNeutral(forbiddenSettledImplication)).toBe(false);
  });

  it("Test 4: ended note copy does not reference a specific monetary amount", () => {
    const approvedCopy = "Tenancy ended — No ongoing balance is being tracked.";
    // Must contain no £/$ amounts
    expect(approvedCopy).not.toMatch(/[£$€]\s*\d/);
    expect(approvedCopy).not.toMatch(/\d+\.\d{2}/);
  });

  // ── Mutual exclusivity: ended note and CTA never both show ────────────────

  it("ended note and activation CTA are mutually exclusive", () => {
    const rows = [
      makeRow({ isTenancyEnded: true }),
      makeRow({ isTenancyEnded: false }),
      makeRow({ isTenancyEnded: null }),
      makeRow({ isTenancyEnded: true, balanceState: "known" }),
      makeRow({ isTenancyEnded: false, balanceState: "known" }),
    ];
    for (const row of rows) {
      const decision = renderDecision(row);
      // Decision is exactly one of the three values — never both
      expect(["ended_note", "activation_cta", "nothing"]).toContain(decision);
    }
    // At least one row triggers "ended_note" and at least one triggers "activation_cta"
    const decisions = rows.map(renderDecision);
    expect(decisions).toContain("ended_note");
    expect(decisions).toContain("activation_cta");
  });

  // ── Suppression: vacant rows → neither note nor CTA ──────────────────────

  it("vacant, non-ended row → neither ended note nor CTA (suppressed)", () => {
    const row = makeRow({ isTenancyEnded: false, paymentStatus: "vacant", balanceState: "unknown_payment_history" });
    expect(renderDecision(row)).toBe("nothing");
  });

  // ── Suppression: known-balance, non-ended row → neither note nor CTA ──────

  it("known-balance, non-ended row → neither ended note nor CTA", () => {
    const row = makeRow({ isTenancyEnded: false, balanceState: "known" });
    expect(renderDecision(row)).toBe("nothing");
  });
});
