import { useState, useEffect } from "react";
import { X, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";
import {
  activateTenancyFinanceTracking,
  defaultActivationBoundaryDate,
} from "../../services/financeActivationService";
import { ACTIVATION_COPY, BALANCE_REASON_COPY } from "../../types/finance";
import { useAccount } from "../../context/AccountContext";

// Opening position choice IDs
const OPENING_CHOICE = {
  BALANCED:       "balanced",
  TENANT_OWES:    "tenant_owes",
  TENANT_CREDIT:  "tenant_credit",
  UNKNOWN:        "unknown",
};

/**
 * Fix 7 / P0-E: Activation drawer for "Set up finance tracking."
 *
 * Shown for active tenancies without a finance activation record.
 * NOT shown for ended tenancies (ended → no balance-activation prompt).
 *
 * Collects: coverage start date + opening position + prospective-completeness
 * attestation. Persists all three atomically via activate_tenancy_finance_tracking.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onActivated: () => void,
 *   property: { id: string, address: string, city?: string },
 *   currency?: string
 * }} props
 */
export default function FinanceActivationDrawer({
  isOpen,
  onClose,
  onActivated,
  property,
  currency = "GBP",
}) {
  const { activeAccountId } = useAccount();

  const [openingChoice, setOpeningChoice]     = useState(null);
  const [owesAmount, setOwesAmount]           = useState("");
  const [creditAmount, setCreditAmount]       = useState("");
  const [coverageStart, setCoverageStart]     = useState("");
  const [attestChecked, setAttestChecked]     = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState(null);
  const [done, setDone]                       = useState(false);

  // Fix 6: default boundary = today for existing-record activation.
  useEffect(() => {
    if (isOpen) {
      setCoverageStart(defaultActivationBoundaryDate());
      setOpeningChoice(null);
      setOwesAmount("");
      setCreditAmount("");
      setAttestChecked(false);
      setError(null);
      setDone(false);
      setSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currencySymbol = currency === "PLN" ? "zł" : currency === "EUR" ? "€" : "£";

  function openingBalanceMinorFromChoice() {
    if (openingChoice === OPENING_CHOICE.BALANCED)      return 0;
    if (openingChoice === OPENING_CHOICE.TENANT_OWES)   return Math.round(parseFloat(owesAmount   || 0) * 100);
    if (openingChoice === OPENING_CHOICE.TENANT_CREDIT) return -Math.round(parseFloat(creditAmount || 0) * 100);
    return null; // unknown
  }

  const canConfirm =
    openingChoice !== null &&
    openingChoice !== OPENING_CHOICE.UNKNOWN &&
    coverageStart &&
    attestChecked &&
    !saving;

  async function handleConfirm() {
    if (!canConfirm) return;
    setError(null);
    setSaving(true);
    try {
      await activateTenancyFinanceTracking({
        accountId:                       activeAccountId,
        propertyId:                      property.id,
        coverageStart,
        openingBalanceMinor:             openingBalanceMinorFromChoice(),
        attestsProspectiveCompleteness:  true,
        note: null,
      });
      setDone(true);
      // Give the user a moment to see the success state before the caller
      // refreshes the finance data.
      setTimeout(() => {
        onActivated();
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || "Failed to activate finance tracking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex max-w-md w-full flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900 text-base">
              {ACTIVATION_COPY.setupHeadline}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {property.address}
              {property.city ? `, ${property.city}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle size={40} className="text-emerald-500" />
              <p className="font-medium text-slate-900">Finance tracking activated</p>
              <p className="text-sm text-slate-500">
                {ACTIVATION_COPY.trackingFromTemplate(new Date(coverageStart).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}
              </p>
            </div>
          ) : (
            <>
              {/* Explanation */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
                <p>{ACTIVATION_COPY.setupSubtitle}</p>
              </div>

              {/* Step 1: Coverage start date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Start tracking from
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  This is the date from which Tenaqo will track rent and payments.
                  The opening balance you declare below covers what was owed on this date.
                </p>
                <input
                  type="date"
                  value={coverageStart}
                  max={defaultActivationBoundaryDate()}
                  onChange={(e) => setCoverageStart(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {coverageStart !== defaultActivationBoundaryDate() && (
                  <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    You chose a date earlier than today. Only select an earlier date if you
                    have confirmed all payments between that date and today are recorded in Tenaqo.
                  </p>
                )}
              </div>

              {/* Step 2: Opening balance */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  What was the balance on {coverageStart || "the start date"}?
                </p>
                <div className="space-y-2">
                  {[
                    { id: OPENING_CHOICE.BALANCED,      label: "Balanced — no money owed on either side" },
                    { id: OPENING_CHOICE.TENANT_OWES,   label: "Tenant owed rent" },
                    { id: OPENING_CHOICE.TENANT_CREDIT, label: "Tenant was in credit" },
                    { id: OPENING_CHOICE.UNKNOWN,       label: "I don't know" },
                  ].map(({ id, label }) => (
                    <label
                      key={id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        openingChoice === id
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="opening-choice"
                        value={id}
                        checked={openingChoice === id}
                        onChange={() => setOpeningChoice(id)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Amount inputs */}
                {openingChoice === OPENING_CHOICE.TENANT_OWES && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Amount the tenant owed ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={owesAmount}
                      onChange={(e) => setOwesAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {openingChoice === OPENING_CHOICE.TENANT_CREDIT && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Amount of credit held ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {openingChoice === OPENING_CHOICE.UNKNOWN && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    {ACTIVATION_COPY.unknownOpeningPosition}
                  </div>
                )}
              </div>

              {/* Step 3: Prospective-completeness attestation */}
              {openingChoice && openingChoice !== OPENING_CHOICE.UNKNOWN && (
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attestChecked}
                      onChange={(e) => setAttestChecked(e.target.checked)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span className="text-sm text-slate-600">
                      I confirm that all rent payments from{" "}
                      <strong>{coverageStart || "the start date"}</strong> onward will be
                      recorded in Tenaqo. Tenaqo will use my declared opening balance and
                      payment records to calculate the outstanding balance.
                    </span>
                  </label>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="border-t px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                canConfirm
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {saving ? "Activating…" : "Activate tracking"}
              {!saving && <ChevronRight size={14} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
