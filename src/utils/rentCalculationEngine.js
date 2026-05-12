// src/utils/rentCalculationEngine.js
//
// Pure rent calculation engine — no DB calls, no side effects.
// All currency arithmetic uses integer pence to eliminate floating-point drift.
// Call runRentCalculation() to get a full result; everything else is a helper.
//
// Business rules (confirmed):
//   - Due day: 1st of each month (configurable 1–28 on the plan)
//   - Tenants pay before moving in (first month upfront)
//   - Overpayment rolls forward to next month(s)
//   - Ledger is never mutated here — callers handle posting

// ─────────────────────────────────────────────────────────────────────────────
// Currency helpers (integer pence)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a decimal amount (e.g. 1500.50) to integer pence (150050). */
export function toPence(amount) {
  return Math.round(Number(amount || 0) * 100);
}

/** Convert integer pence back to a 2-decimal numeric. */
export function fromPence(pence) {
  return Math.round(Number(pence || 0)) / 100;
}

/**
 * Apply rounding policy to a pence value.
 * Input and output are both integer pence.
 */
export function applyRounding(pence, policy = "nearest_penny") {
  // All values already in integer pence from toPence(), so rounding is on the
  // sub-penny remainder from intermediate division.
  switch (policy) {
    case "round_up":    return Math.ceil(pence);
    case "round_down":  return Math.floor(pence);
    case "none":        return pence; // caller must accept fractional pence
    case "nearest_penny":
    default:            return Math.round(pence);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Days in a calendar month (year, month are 1-based). */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Days in a calendar year. */
export function daysInYear(year) {
  return new Date(year, 1, 29).getDate() === 29 ? 366 : 365;
}

/** True if the year is a leap year. */
export function isLeapYear(year) {
  return daysInYear(year) === 366;
}

/** ISO date string → Date object at midnight UTC. */
function parseDate(str) {
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
  return d;
}

/** Number of calendar days between two ISO date strings (start inclusive, end inclusive). */
export function daysBetween(startStr, endStr) {
  const start = parseDate(startStr);
  const end   = parseDate(endStr);
  const diff  = end.getTime() - start.getTime();
  return Math.round(diff / 86_400_000) + 1; // inclusive
}

// ─────────────────────────────────────────────────────────────────────────────
// Frequency conversion (monthly base)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a periodic amount to its monthly equivalent (in pence).
 * E.g. weekly £500 → monthly ≈ £2,166.67
 */
export function toMonthlyPence(amount, frequency) {
  const p = toPence(amount);
  switch (frequency) {
    case "weekly":       return Math.round(p * 52 / 12);
    case "fortnightly":  return Math.round(p * 26 / 12);
    case "four_weekly":  return Math.round(p * 13 / 12);
    case "annual":       return Math.round(p / 12);
    case "monthly":
    default:             return p;
  }
}

/** Convert a monthly pence amount to another frequency. */
export function fromMonthlyPence(monthlyPence, targetFrequency) {
  switch (targetFrequency) {
    case "weekly":       return Math.round(monthlyPence * 12 / 52);
    case "fortnightly":  return Math.round(monthlyPence * 12 / 26);
    case "four_weekly":  return Math.round(monthlyPence * 12 / 13);
    case "annual":       return Math.round(monthlyPence * 12);
    case "monthly":
    default:             return monthlyPence;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the prorated amount (in pence) for a part-month period.
 *
 * @param {number} monthlyPence  Full monthly rent in pence
 * @param {string} periodStart   ISO date (start of partial period)
 * @param {string} periodEnd     ISO date (end of partial period, inclusive)
 * @param {string} policy        Proration policy key
 * @param {number} [override]    Manual override amount in pence (policy = manual_override)
 */
export function prorateMonthlyPence(monthlyPence, periodStart, periodEnd, policy = "actual_days_in_month", override) {
  if (policy === "no_proration") return monthlyPence;
  if (policy === "manual_override") return override ?? monthlyPence;

  const startDate  = parseDate(periodStart);
  const endDate    = parseDate(periodEnd);
  const year       = startDate.getUTCFullYear();
  const month      = startDate.getUTCMonth() + 1; // 1-based
  const days       = daysBetween(periodStart, periodEnd);

  switch (policy) {
    case "actual_days_in_month": {
      const total = daysInMonth(year, month);
      return Math.round(monthlyPence * days / total);
    }
    case "thirty_day_month": {
      return Math.round(monthlyPence * days / 30);
    }
    case "annual_daily_365": {
      const annualPence = monthlyPence * 12;
      return Math.round(annualPence * days / 365);
    }
    case "annual_daily_actual_year": {
      const annualPence = monthlyPence * 12;
      const dy = daysInYear(year);
      return Math.round(annualPence * days / dy);
    }
    default:
      return monthlyPence;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposit checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UK deposit cap check (Tenant Fees Act 2019).
 * Returns { withinCap, maxDepositPence, weeklyRentPence, capWeeks, warning }.
 * This is a WARNING only — the engine never auto-adjusts the deposit.
 * Disclaimer: this is a tool aide; always verify against current legislation.
 */
export function checkUkDepositCap(monthlyRentPence, depositPence) {
  const annualRentPence  = monthlyRentPence * 12;
  const weeklyRentPence  = Math.round(annualRentPence / 52);
  const annualRentGbp    = fromPence(annualRentPence);
  const capWeeks         = annualRentGbp < 50_000 ? 5 : 6;
  const maxDepositPence  = weeklyRentPence * capWeeks;
  const withinCap        = depositPence <= maxDepositPence;

  return {
    withinCap,
    capWeeks,
    weeklyRentPence,
    maxDepositPence,
    depositPence,
    warning: withinCap
      ? null
      : `Deposit (${fromPence(depositPence)}) exceeds the ${capWeeks}-week cap ` +
        `(${fromPence(maxDepositPence)}) under the Tenant Fees Act 2019. ` +
        `Please verify with a qualified professional.`,
  };
}

/**
 * Poland deposit check placeholder.
 * Poland does not have a statutory national cap equivalent to the UK TFA.
 * Warn if deposit exceeds a configurable multiple of monthly rent.
 * Default: warn at 3× monthly (common market practice — not legal advice).
 */
export function checkPlDepositWarning(monthlyRentPence, depositPence, warnMultiple = 3) {
  const threshold = monthlyRentPence * warnMultiple;
  const withinGuideline = depositPence <= threshold;

  return {
    withinGuideline,
    warnMultiple,
    threshold,
    depositPence,
    warning: withinGuideline
      ? null
      : `Deposit (${fromPence(depositPence)}) exceeds ${warnMultiple}× monthly rent ` +
        `(${fromPence(threshold)}). This is a market-practice guideline only — ` +
        `not legal advice. Verify with a Polish legal professional.`,
  };
}

/**
 * Route deposit check by market.
 * Returns a warnings array (empty = no issues).
 */
export function checkDepositForMarket(market, monthlyRentPence, depositPence, options = {}) {
  if (!depositPence || depositPence <= 0) return [];

  switch (market) {
    case "uk": {
      const result = checkUkDepositCap(monthlyRentPence, depositPence);
      return result.warning ? [{ code: "deposit_cap_uk", message: result.warning, meta: result }] : [];
    }
    case "pl": {
      const result = checkPlDepositWarning(monthlyRentPence, depositPence, options.plWarnMultiple);
      return result.warning ? [{ code: "deposit_guideline_pl", message: result.warning, meta: result }] : [];
    }
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate utility charge in pence.
 * Returns { pence, policy, included }.
 */
export function calculateUtilities(policy, fixedAmountPence = 0) {
  switch (policy) {
    case "bills_inclusive":
      return { pence: 0, policy, included: true, label: "Utilities included in rent" };
    case "fixed_utility_charge":
      return { pence: fixedAmountPence, policy, included: false, label: "Fixed utility charge" };
    case "variable_utility_charge":
      return { pence: 0, policy, included: false, label: "Variable utility charge (metered — set at invoice)" };
    case "rent_only":
    default:
      return { pence: 0, policy, included: false, label: "Rent only" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Split rent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a total rent (in pence) among tenants.
 * Returns array of { tenantId, amountPence }.
 * Any remainder penny goes to the first tenant.
 */
export function splitRent(totalPence, tenants, policy = "equal", overrides = []) {
  if (!tenants || tenants.length === 0) return [];

  switch (policy) {
    case "equal": {
      const base      = Math.floor(totalPence / tenants.length);
      const remainder = totalPence - base * tenants.length;
      return tenants.map((t, i) => ({
        tenantId: t.id,
        amountPence: base + (i === 0 ? remainder : 0),
      }));
    }
    case "percentage": {
      const total = overrides.reduce((s, o) => s + (o.percentage || 0), 0);
      let allocated = 0;
      return tenants.map((t, i) => {
        const pct = overrides[i]?.percentage ?? (100 / tenants.length);
        const share = i === tenants.length - 1
          ? totalPence - allocated
          : Math.round(totalPence * pct / total);
        allocated += share;
        return { tenantId: t.id, amountPence: share };
      });
    }
    case "fixed": {
      return tenants.map((t, i) => ({
        tenantId: t.id,
        amountPence: toPence(overrides[i]?.amount ?? 0),
      }));
    }
    case "room_based":
    default:
      // Placeholder: treat as equal for now
      return splitRent(totalPence, tenants, "equal", overrides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Charge rules application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a charge rule to a line-item in pence for a given period.
 * Rules with frequency !== plan frequency are converted to monthly equivalent first.
 */
export function applyChargeRule(rule, planFrequency = "monthly", rounding = "nearest_penny") {
  const baseP = toMonthlyPence(rule.amount, rule.frequency);
  const targetP = fromMonthlyPence(baseP, planFrequency);
  const rounded = applyRounding(targetP, rounding);

  return {
    id:             rule.id,
    chargeType:     rule.charge_type,
    label:          rule.label,
    amountPence:    rounded,
    calculationType: rule.calculation_type,
    includedInRent: rule.included_in_rent,
    taxable:        rule.taxable_flag,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main calculation entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a full rent calculation for a period.
 *
 * @param {object} plan          - rent_plan row (or equivalent shape)
 * @param {object[]} chargeRules - rent_charge_rule rows for this plan
 * @param {string} periodStart   - ISO date
 * @param {string} periodEnd     - ISO date
 * @param {object[]} [tenants]   - for split-rent scenarios
 * @param {boolean} isPartMonth  - true if the period is shorter than a full billing cycle
 *
 * @returns {object} Calculation result with line items, totals, warnings, explanation.
 */
export function runRentCalculation({
  plan,
  chargeRules = [],
  periodStart,
  periodEnd,
  tenants = [],
  isPartMonth = false,
}) {
  const warnings = [];
  const lineItems = [];

  const freq     = plan.billing_frequency ?? "monthly";
  const rounding = plan.rounding_policy ?? "nearest_penny";
  const currency = plan.currency ?? "GBP";

  // ── Base rent ──────────────────────────────────────────────────────────────
  const baseMonthlyP = toMonthlyPence(plan.base_rent_amount, freq);
  let rentP = isPartMonth
    ? prorateMonthlyPence(baseMonthlyP, periodStart, periodEnd, plan.proration_policy)
    : fromMonthlyPence(baseMonthlyP, freq);
  rentP = applyRounding(rentP, rounding);

  lineItems.push({
    chargeType:  "rent",
    label:       isPartMonth ? `Rent (prorated — ${plan.proration_policy})` : "Monthly rent",
    amountPence: rentP,
    includedInRent: true,
    taxable:     false,
  });

  // ── Utilities ──────────────────────────────────────────────────────────────
  if (plan.utilities_policy !== "rent_only") {
    const utilRuleP = toPence(
      chargeRules.find((r) => r.charge_type === "utilities")?.amount ?? 0
    );
    const util = calculateUtilities(plan.utilities_policy, utilRuleP);
    if (util.pence > 0) {
      lineItems.push({
        chargeType:  "utilities",
        label:       util.label,
        amountPence: applyRounding(util.pence, rounding),
        includedInRent: false,
        taxable:     false,
      });
    } else if (util.included) {
      lineItems.push({
        chargeType:  "utilities",
        label:       util.label,
        amountPence: 0,
        includedInRent: true,
        taxable:     false,
        note:        "Included in base rent",
      });
    }
  }

  // ── Additional charge rules (excluding rent + utilities already handled) ──
  for (const rule of chargeRules) {
    if (rule.charge_type === "rent" || rule.charge_type === "utilities") continue;
    if (rule.effective_from && periodStart < rule.effective_from) continue;
    if (rule.effective_to   && periodEnd   > rule.effective_to)   continue;

    const item = applyChargeRule(rule, freq, rounding);
    lineItems.push(item);
  }

  // ── Deposit check ──────────────────────────────────────────────────────────
  if (plan.deposit_amount && plan.deposit_amount > 0 && plan.deposit_policy !== "none") {
    const depositWarnings = checkDepositForMarket(
      plan.market,
      baseMonthlyP,
      toPence(plan.deposit_amount)
    );
    warnings.push(...depositWarnings);
  }

  // ── Subtotal / Total ───────────────────────────────────────────────────────
  const subtotalPence = lineItems
    .filter((li) => !li.includedInRent || li.chargeType === "rent")
    .reduce((s, li) => s + li.amountPence, 0);

  const totalPence = lineItems
    .reduce((s, li) => s + (li.includedInRent ? 0 : li.amountPence) + (li.chargeType === "rent" ? li.amountPence : 0), 0);

  // Simpler: total = sum of all non-zero line items (rent + additions)
  const simpleTotalPence = lineItems.reduce((s, li) => s + li.amountPence, 0);

  // ── Split rent ─────────────────────────────────────────────────────────────
  const splits = tenants.length > 1
    ? splitRent(simpleTotalPence, tenants, "equal")
    : [];

  // ── Explanation ────────────────────────────────────────────────────────────
  const explanationParts = [
    `Period: ${periodStart} to ${periodEnd}`,
    `Base rent: ${fromPence(baseMonthlyP)}/month (${freq})`,
    isPartMonth
      ? `Prorated using "${plan.proration_policy}": ${fromPence(rentP)} for ${daysBetween(periodStart, periodEnd)} days`
      : `Full period amount: ${fromPence(rentP)}`,
  ];
  if (lineItems.length > 1) {
    explanationParts.push(
      `Additional charges: ${lineItems.slice(1).map((li) => `${li.label} ${fromPence(li.amountPence)}`).join(", ")}`
    );
  }

  return {
    currency,
    periodStart,
    periodEnd,
    policyUsed: {
      billing_frequency: freq,
      proration_policy:  plan.proration_policy,
      utilities_policy:  plan.utilities_policy,
      rounding_policy:   rounding,
      market:            plan.market,
    },
    lineItems: lineItems.map((li) => ({
      ...li,
      amount: fromPence(li.amountPence),
    })),
    subtotal:        fromPence(subtotalPence),
    total:           fromPence(simpleTotalPence),
    totalPence:      simpleTotalPence,
    splits:          splits.map((s) => ({ ...s, amount: fromPence(s.amountPence) })),
    warnings,
    explanation:     explanationParts.join("\n"),
    calculatedAt:    new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Period helpers for expected charge generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a list of billing periods (ISO date pairs) from a start date to today.
 * Uses the plan's due_day and billing_frequency.
 */
export function generateBillingPeriods(plan, upToDate = new Date()) {
  const periods = [];
  const dueDay  = plan.due_day ?? 1;
  const freq    = plan.billing_frequency ?? "monthly";

  // Only monthly supported for now; other frequencies use monthly as approximation
  const startD = parseDate(plan.start_date);
  let year  = startD.getUTCFullYear();
  let month = startD.getUTCMonth() + 1; // 1-based

  const upToYear  = upToDate.getFullYear();
  const upToMonth = upToDate.getMonth() + 1;

  while (
    year < upToYear ||
    (year === upToYear && month <= upToMonth)
  ) {
    const maxDay = daysInMonth(year, month);
    const day    = Math.min(dueDay, maxDay);
    const start  = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // End = day before next period start
    let ny = year, nm = month + 1;
    if (nm > 12) { ny += 1; nm = 1; }
    const nextMaxDay = daysInMonth(ny, nm);
    const nextDay    = Math.min(dueDay, nextMaxDay);
    const nextStart  = new Date(`${ny}-${String(nm).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`);
    const endDate    = new Date(nextStart.getTime() - 86_400_000);
    const end        = endDate.toISOString().slice(0, 10);

    periods.push({
      periodStart: start,
      periodEnd:   end,
      dueDate:     start, // rent is due on the period start
      year,
      month,
    });

    month += 1;
    if (month > 12) { year += 1; month = 1; }

    if (freq !== "monthly") break; // placeholder: only monthly generates multiple periods
  }

  return periods;
}
