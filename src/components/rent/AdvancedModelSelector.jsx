// src/components/rent/AdvancedModelSelector.jsx
// Model selector for the advanced rent model UI.
// Shows only the fields relevant to the selected model.

import { useState } from "react";
import { runSplitRentCalculation, runRoomRentCalculation, runUtilityCalculation, calculateRentIncreaseSummary, applyRentAdjustment, runStrCalculation, toPence, fromPence } from "../../utils/rentCalculationEngine";

const MODELS = [
  { id: "monthly",       label: "Monthly rent" },
  { id: "split_rent",    label: "Shared tenancy — split rent" },
  { id: "room_rent",     label: "Room-based rent (HMO)" },
  { id: "utilities",     label: "Variable utilities" },
  { id: "rent_increase", label: "Rent increase" },
  { id: "discount",      label: "Discount / promotion" },
  { id: "str_nightly",   label: "Short-term nightly (STR)" },
];

const cls  = "w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
const lbl  = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
const warn = "rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300";

function WarningList({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-1">
      {warnings.map((w, i) => <p key={i} className={warn}>{w.message ?? w}</p>)}
    </div>
  );
}

function PreviewCard({ result, currency = "GBP" }) {
  if (!result) return null;
  const fmt = (v) => `${currency} ${Number(v ?? 0).toFixed(2)}`;
  return (
    <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Preview</p>

      {/* Line items */}
      {result.lineItems?.length > 0 && (
        <div className="space-y-1">
          {result.lineItems.map((li, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">{li.label}</span>
              <span className={`font-medium ${li.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                {fmt(li.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tenant shares */}
      {result.shares?.length > 0 && (
        <div className="space-y-1">
          {result.shares.map((sh, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Tenant {i + 1}</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(sh.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {result.total !== undefined && (
        <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
          <span>Total</span>
          <span>{fmt(result.total)}</span>
        </div>
      )}

      {result.explanation && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">{result.explanation}</p>
      )}

      <WarningList warnings={result.warnings ?? []} />

      <p className="text-[11px] text-slate-400 italic">
        This is a preview only. No payment has been recorded. Generate an expected charge to proceed.
      </p>
    </div>
  );
}

// ── Model panels ─────────────────────────────────────────────────────────────

function SplitRentPanel({ baseRent, currency, onResult }) {
  const [tenants, setTenants]     = useState([{ id: "t1", pct: 50 }, { id: "t2", pct: 50 }]);
  const [splitType, setSplitType] = useState("equal_split");
  const [result, setResult]       = useState(null);

  function calculate() {
    const totalP = toPence(baseRent);
    const splits = tenants.map((t) => ({
      tenantId:    t.id,
      percentage:  t.pct,
      fixedAmount: t.fixed ?? 0,
    }));
    const r = runSplitRentCalculation(totalP, splits, splitType);
    setResult(r);
    onResult?.(r);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>Split method</label>
        <select value={splitType} onChange={(e) => setSplitType(e.target.value)} className={cls}>
          <option value="equal_split">Equal split</option>
          <option value="percentage_split">Percentage split</option>
          <option value="fixed_amount_split">Fixed amount</option>
          <option value="custom_manual_split">Custom / manual</option>
        </select>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Base rent: {currency} {Number(baseRent).toFixed(2)} across {tenants.length} tenants
      </p>
      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview split
      </button>
      <PreviewCard result={result} currency={currency} />
    </div>
  );
}

function RoomRentPanel({ currency }) {
  const [form, setForm] = useState({ roomLabel: "", amount: "", frequency: "monthly", isPartMonth: false, periodStart: "", periodEnd: "" });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function calculate() {
    const assignment = { amount: form.amount, billing_frequency: form.frequency, proration_policy: "actual_days_in_month", tenant_id: "preview-tenant", currency };
    const room = { room_label: form.roomLabel || "Room" };
    const r = runRoomRentCalculation({ assignment, room, periodStart: form.periodStart, periodEnd: form.periodEnd, isPartMonth: form.isPartMonth });
    setResult(r);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Room label</label>
          <input className={cls} value={form.roomLabel} onChange={(e) => set("roomLabel", e.target.value)} placeholder="Room 1" />
        </div>
        <div>
          <label className={lbl}>Room rent ({currency})</label>
          <input type="number" className={cls} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="600.00" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Period start</label>
          <input type="date" className={cls} value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Period end</label>
          <input type="date" className={cls} value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={form.isPartMonth} onChange={(e) => set("isPartMonth", e.target.checked)} />
        Part-month (prorate)
      </label>
      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview room rent
      </button>
      <PreviewCard result={result} currency={currency} />
    </div>
  );
}

function UtilitiesPanel({ currency }) {
  const [form, setForm] = useState({ utilityType: "electricity", method: "meter_usage", unitRate: "", standingCharge: "", prevReading: "", currReading: "", invoiceAmount: "", evidenceNote: "" });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function calculate() {
    const charge = {
      utility_type: form.utilityType,
      calculation_method: form.method,
      unit_rate: form.unitRate,
      standing_charge: form.standingCharge,
      previous_reading: form.prevReading,
      current_reading: form.currReading,
      invoice_amount: form.invoiceAmount,
      evidence_note: form.evidenceNote,
      currency,
    };
    setResult(runUtilityCalculation(charge));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Utility type</label>
          <select value={form.utilityType} onChange={(e) => set("utilityType", e.target.value)} className={cls}>
            {["electricity","gas","water","council_tax","internet","service_charge","other"].map((u) => (
              <option key={u} value={u}>{u.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Calculation method</label>
          <select value={form.method} onChange={(e) => set("method", e.target.value)} className={cls}>
            <option value="fixed">Fixed</option>
            <option value="manual">Manual amount</option>
            <option value="meter_usage">Meter readings</option>
            <option value="invoice_split">Invoice split</option>
          </select>
        </div>
      </div>

      {form.method === "meter_usage" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Previous reading</label><input type="number" className={cls} value={form.prevReading} onChange={(e) => set("prevReading", e.target.value)} /></div>
          <div><label className={lbl}>Current reading</label><input type="number" className={cls} value={form.currReading} onChange={(e) => set("currReading", e.target.value)} /></div>
          <div><label className={lbl}>Unit rate ({currency}/unit)</label><input type="number" step="0.0001" className={cls} value={form.unitRate} onChange={(e) => set("unitRate", e.target.value)} /></div>
          <div><label className={lbl}>Standing charge ({currency})</label><input type="number" className={cls} value={form.standingCharge} onChange={(e) => set("standingCharge", e.target.value)} /></div>
        </div>
      )}

      {(form.method === "fixed" || form.method === "manual" || form.method === "invoice_split") && (
        <div>
          <label className={lbl}>Amount ({currency})</label>
          <input type="number" className={cls} value={form.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
        </div>
      )}

      <div>
        <label className={lbl}>Evidence / source note</label>
        <input className={cls} value={form.evidenceNote} onChange={(e) => set("evidenceNote", e.target.value)} placeholder="Invoice ref, meter photo, etc." />
      </div>

      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview utility charge
      </button>
      <PreviewCard result={result} currency={currency} />
    </div>
  );
}

function RentIncreasePanel({ currentRent, currency }) {
  const [form, setForm] = useState({ newRent: "", effectiveDate: "", changeReason: "" });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function calculate() {
    const r = calculateRentIncreaseSummary(
      toPence(currentRent),
      toPence(form.newRent),
      form.effectiveDate
    );
    setResult(r);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">Current rent: {currency} {Number(currentRent).toFixed(2)}/month</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>New rent ({currency}/month)</label>
          <input type="number" className={cls} value={form.newRent} onChange={(e) => set("newRent", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Effective date</label>
          <input type="date" className={cls} value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={lbl}>Reason for increase</label>
        <input className={cls} value={form.changeReason} onChange={(e) => set("changeReason", e.target.value)} placeholder="e.g. Annual rent review" />
      </div>
      <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
        Check local notice period rules before serving notice. This is not legal advice.
      </p>
      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview rent increase
      </button>
      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Old rent</span><span>{currency} {result.oldMonthly.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">New rent</span><span className="font-semibold text-slate-900 dark:text-slate-100">{currency} {result.newMonthly.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Increase</span><span className={result.diff >= 0 ? "text-rose-600" : "text-emerald-600"}>{currency} {result.diff.toFixed(2)} ({result.percentChange >= 0 ? "+" : ""}{result.percentChange}%)</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Effective</span><span>{result.effectiveDate}</span></div>
          <WarningList warnings={result.warnings} />
        </div>
      )}
    </div>
  );
}

function DiscountPanel({ baseRent, currency }) {
  const [form, setForm] = useState({ type: "fixed_discount", amount: "", percentage: "", reason: "", startDate: "", endDate: "" });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function calculate() {
    const adjustment = { adjustment_type: form.type, amount: form.amount, percentage: form.percentage, reason: form.reason };
    setResult(applyRentAdjustment(toPence(baseRent), adjustment));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Adjustment type</label>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={cls}>
            <option value="fixed_discount">Fixed discount</option>
            <option value="percentage_discount">Percentage discount</option>
            <option value="rent_holiday">Rent holiday</option>
            <option value="introductory_offer">Introductory offer</option>
            <option value="goodwill_credit">Goodwill credit</option>
            <option value="manual_adjustment">Manual adjustment</option>
          </select>
        </div>
        {form.type === "percentage_discount" || form.type === "introductory_offer" ? (
          <div>
            <label className={lbl}>Percentage (%)</label>
            <input type="number" min="0" max="100" className={cls} value={form.percentage} onChange={(e) => set("percentage", e.target.value)} />
          </div>
        ) : form.type !== "rent_holiday" ? (
          <div>
            <label className={lbl}>Amount ({currency})</label>
            <input type="number" min="0" className={cls} value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
        ) : null}
      </div>
      <div>
        <label className={lbl}>Reason *</label>
        <input className={cls} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Required" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Start date</label><input type="date" className={cls} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div><label className={lbl}>End date (optional)</label><input type="date" className={cls} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
      </div>
      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview adjustment
      </button>
      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Original</span><span>{currency} {result.original.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Adjustment</span><span className="text-emerald-600">−{currency} {result.adjustment.toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 border-t border-slate-200 pt-2"><span>Final charge</span><span>{currency} {result.final.toFixed(2)}</span></div>
          <WarningList warnings={result.warnings} />
        </div>
      )}
    </div>
  );
}

function StrNightlyPanel({ currency }) {
  const [form, setForm] = useState({ nightlyRate: "", checkIn: "", checkOut: "", cleaningFee: "", platformFee: "", serviceFee: "", discount: "", tax: "", bookingRef: "", platform: "" });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function calculate() {
    const r = runStrCalculation({
      nightly_rate:     form.nightlyRate,
      check_in_date:    form.checkIn,
      check_out_date:   form.checkOut,
      cleaning_fee:     form.cleaningFee,
      platform_fee:     form.platformFee,
      service_fee:      form.serviceFee,
      discount_amount:  form.discount,
      tax_amount:       form.tax,
      currency,
      booking_reference: form.bookingRef,
      platform:         form.platform,
    });
    setResult(r);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Nightly rate ({currency})</label><input type="number" className={cls} value={form.nightlyRate} onChange={(e) => set("nightlyRate", e.target.value)} /></div>
        <div><label className={lbl}>Cleaning fee ({currency})</label><input type="number" className={cls} value={form.cleaningFee} onChange={(e) => set("cleaningFee", e.target.value)} /></div>
        <div><label className={lbl}>Check-in date</label><input type="date" className={cls} value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} /></div>
        <div><label className={lbl}>Check-out date</label><input type="date" className={cls} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} /></div>
        <div><label className={lbl}>Platform fee ({currency})</label><input type="number" className={cls} value={form.platformFee} onChange={(e) => set("platformFee", e.target.value)} /></div>
        <div><label className={lbl}>Service fee ({currency})</label><input type="number" className={cls} value={form.serviceFee} onChange={(e) => set("serviceFee", e.target.value)} /></div>
        <div><label className={lbl}>Discount ({currency})</label><input type="number" className={cls} value={form.discount} onChange={(e) => set("discount", e.target.value)} /></div>
        <div><label className={lbl}>Tax / tourist tax ({currency})</label><input type="number" className={cls} value={form.tax} onChange={(e) => set("tax", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Booking reference</label><input className={cls} value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="e.g. HM12345" /></div>
        <div><label className={lbl}>Platform</label><input className={cls} value={form.platform} onChange={(e) => set("platform", e.target.value)} placeholder="e.g. Airbnb, direct" /></div>
      </div>
      <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
        STR booking records are for internal use only. Tenaqo does not integrate with Airbnb, Booking.com, or any platform.
      </p>
      <button type="button" onClick={calculate} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Preview booking charge
      </button>
      <PreviewCard result={result} currency={currency} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdvancedModelSelector({ plan, t }) {
  const [model, setModel] = useState("monthly");
  const currency = plan?.currency ?? "GBP";
  const baseRent = plan?.base_rent_amount ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <label className={lbl}>Rent model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} className={cls}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        {model === "monthly"       && <p className="text-sm text-slate-500">Standard monthly rent — use the Calculation Preview above.</p>}
        {model === "split_rent"    && <SplitRentPanel baseRent={baseRent} currency={currency} />}
        {model === "room_rent"     && <RoomRentPanel currency={currency} />}
        {model === "utilities"     && <UtilitiesPanel currency={currency} />}
        {model === "rent_increase" && <RentIncreasePanel currentRent={baseRent} currency={currency} />}
        {model === "discount"      && <DiscountPanel baseRent={baseRent} currency={currency} />}
        {model === "str_nightly"   && <StrNightlyPanel currency={currency} />}
      </div>
    </div>
  );
}
