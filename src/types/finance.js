/**
 * @fileoverview P0 finance-epistemology types.
 *
 * Two separate concepts that must never be collapsed:
 *   - BalanceResult  — what a single property's balance calculation resolved to
 *   - FinanceCoverageState — what state of finance tracking the property is in
 *
 * A numeric outstanding balance may be shown ONLY for state: "known".
 * Unknowns are excluded from aggregate totals (never counted as £0).
 */

// ─── BalanceResult ────────────────────────────────────────────────────────────

/**
 * A tenancy has a fully calculable balance.
 * Two precise bases; supported_projection is removed.
 *
 * "reconciled_finance_records":
 *   Authoritative obligation source + complete payment coverage for the same
 *   period + evidenced coverage start + capped at lease end.
 *
 * "attested_opening_position_plus_tracked_events":
 *   Explicit opening-position attestation + coverage boundary + authoritative
 *   charge schedule from boundary onward + payment records from boundary onward.
 *   Nothing is computed before the boundary.
 *
 * @typedef {{
 *   state: "known",
 *   outstandingMinor: number,
 *   paidMinor: number,
 *   expectedMinor: number,
 *   accrualThrough: string,
 *   coverageStart: string,
 *   basis:
 *     | "reconciled_finance_records"
 *     | "attested_opening_position_plus_tracked_events"
 * }} BalanceResultKnown
 */

/**
 * Balance cannot be shown — evidence of payments is absent, partial, or
 * temporally unbounded. Never display £0 for this state.
 *
 * @typedef {{
 *   state: "unknown_payment_history",
 *   outstandingMinor: null,
 *   reasonCode:
 *     | "PAYMENT_HISTORY_NOT_IMPORTED"
 *     | "PAYMENT_HISTORY_INCOMPLETE"
 *     | "FINANCE_COVERAGE_START_UNKNOWN",
 *   accrualThrough: string | null
 * }} BalanceResultUnknown
 */

/**
 * The tenancy has not yet started (lease start date is in the future, or
 * coverage start is in the future). No obligations exist yet.
 *
 * @typedef {{
 *   state: "not_started",
 *   outstandingMinor: 0,
 *   reasonCode: "TENANCY_NOT_STARTED"
 * }} BalanceResultNotStarted
 */

/**
 * @typedef {BalanceResultKnown | BalanceResultUnknown | BalanceResultNotStarted} BalanceResult
 */

// ─── FinanceCoverageState ────────────────────────────────────────────────────

/**
 * No coverage start can be established; no activation record exists and no
 * payment history has been imported.
 *
 * @typedef {{ state: "not_configured", reasonCode: "FINANCE_COVERAGE_START_UNKNOWN" }} CoverageNotConfigured
 */

/**
 * Payment history exists but coverage is incomplete or unterminated.
 *
 * @typedef {{
 *   state: "history_unknown",
 *   reasonCode: "PAYMENT_HISTORY_NOT_IMPORTED" | "PAYMENT_HISTORY_INCOMPLETE"
 * }} CoverageHistoryUnknown
 */

/**
 * The user has proposed a coverage start but has not yet confirmed the
 * opening position and prospective-completeness attestation. UI-only state —
 * never persisted independently; activation is atomic.
 *
 * @typedef {{
 *   state: "activation_pending",
 *   proposedStart: string,
 *   reasonCode: "OPENING_POSITION_REQUIRED"
 * }} CoverageActivationPending
 */

/**
 * Boundary + opening position + prospective-completeness attestation have been
 * persisted atomically. Balance is numeric from this date onward.
 *
 * @typedef {{
 *   state: "prospectively_tracked",
 *   coverageStart: string,
 *   openingPositionBasis: "user_attested_opening_balance",
 *   openingBalanceMinor: number
 * }} CoverageProspectivelyTracked
 */

/**
 * Full historic ledger reconstructed; authoritative obligation source +
 * complete payment coverage for the full tenancy period.
 *
 * @typedef {{ state: "fully_reconciled", coverageStart: string }} CoverageFullyReconciled
 */

/**
 * @typedef {
 *   CoverageNotConfigured |
 *   CoverageHistoryUnknown |
 *   CoverageActivationPending |
 *   CoverageProspectivelyTracked |
 *   CoverageFullyReconciled
 * } FinanceCoverageState
 */

// ─── Reason-code copy (single authoritative source) ──────────────────────────

/**
 * Primary and supporting copy for each BalanceResult reason code.
 * Each surface renders its own representation (NOT identical strings).
 * Shared here so the mapping stays consistent across Finance, PropertyDetails,
 * TenantPayments, and exports.
 *
 * @type {Record<string, { primary: string, supporting: string }>}
 */
export const BALANCE_REASON_COPY = {
  PAYMENT_HISTORY_NOT_IMPORTED: {
    primary:    "Payment history not imported",
    supporting: "Outstanding rent cannot be calculated because no payment history was imported for this tenancy.",
  },
  PAYMENT_HISTORY_INCOMPLETE: {
    primary:    "Payment history incomplete",
    supporting: "Outstanding rent cannot be calculated for the full tenancy period because payment records are incomplete.",
  },
  FINANCE_COVERAGE_START_UNKNOWN: {
    primary:    "Finance history unavailable",
    supporting: "Tenaqo cannot establish the period from which complete rent and payment tracking began.",
  },
  TENANCY_NOT_STARTED: {
    primary:    "Tenancy not yet started",
    supporting: "No rent obligations have accrued because the tenancy period has not begun.",
  },
};

/**
 * Copy for the first-run activation prompt shown when a property is occupied
 * but finance tracking has not been set up.
 */
export const ACTIVATION_COPY = {
  /** Shown as the action card headline before activation. */
  setupHeadline: "Set up finance tracking",
  /** Shown as the subtitle before activation. */
  setupSubtitle:
    "Historic payment history is unavailable. Confirm the tenancy's current balance to start reliable tracking from today.",
  /** Button label options for the opening position. */
  openingPositionOptions: {
    balanced:     "Balanced — £0",
    tenantOwes:   "Tenant owes…",
    tenantCredit: "Tenant is in credit…",
    unknown:      "I don't know",
  },
  /** Copy shown when the landlord selects "I don't know". */
  unknownOpeningPosition:
    "Finance tracking has not been activated because the opening position is unknown.",
  /** Shown below the balance once activated (prospectively_tracked). */
  trackingFromTemplate: (date) =>
    `Tracking from ${date} — Earlier payment history was not imported. Balances cover only activity from this date and begin from a landlord-attested opening position.`,
};
