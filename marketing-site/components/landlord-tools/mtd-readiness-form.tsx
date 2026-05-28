"use client";

import { useMemo, useState } from "react";

import { calculateMtdReadiness } from "../../lib/landlordTaxTools/mtdReadiness";
import { TAX_TOOL_DISCLAIMER, formatCurrency } from "../../lib/landlordTaxTools/shared";
import { trackMarketingEvent } from "./analytics";

type MtdFormState = {
  propertyIncome: string;
  selfEmploymentIncome: string;
  usesSpreadsheets: boolean;
  keepsReceiptsDigitally: boolean;
  tracksExpensesByProperty: boolean;
  usesAccountant: boolean;
  ownsMoreThanOneRentalProperty: boolean;
};

export function MtdReadinessForm() {
  const [form, setForm] = useState<MtdFormState>({
    propertyIncome: "36000",
    selfEmploymentIncome: "0",
    usesSpreadsheets: true,
    keepsReceiptsDigitally: false,
    tracksExpensesByProperty: true,
    usesAccountant: false,
    ownsMoreThanOneRentalProperty: true,
  });
  const [hasTrackedCompletion, setHasTrackedCompletion] = useState(false);

  const result = useMemo(
    () =>
      calculateMtdReadiness({
        ...form,
        propertyIncome: Number(form.propertyIncome),
        selfEmploymentIncome: Number(form.selfEmploymentIncome),
      }),
    [form],
  );

  function updateField<K extends keyof MtdFormState>(field: K, value: MtdFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function trackCompletionOnce() {
    if (hasTrackedCompletion) return;
    setHasTrackedCompletion(true);
    trackMarketingEvent("mtd_readiness_completed");
  }

  return (
    <section className="section section-tight-top">
      <div className="container tax-tool-grid">
        <div className="tax-tool-panel card">
          <p className="tax-tool-disclaimer">{TAX_TOOL_DISCLAIMER}</p>
          <div className="tax-form-grid">
            <label className="tax-field">
              <span>Annual property income</span>
              <input type="number" min="0" step="100" value={form.propertyIncome} onChange={(event) => {
                updateField("propertyIncome", event.target.value);
                trackCompletionOnce();
              }} />
            </label>
            <label className="tax-field">
              <span>Annual self-employment income</span>
              <input type="number" min="0" step="100" value={form.selfEmploymentIncome} onChange={(event) => {
                updateField("selfEmploymentIncome", event.target.value);
                trackCompletionOnce();
              }} />
            </label>
          </div>
          {[
            ["usesSpreadsheets", "Do you currently use spreadsheets?"],
            ["keepsReceiptsDigitally", "Do you keep receipts digitally?"],
            ["tracksExpensesByProperty", "Do you track expenses by property?"],
            ["usesAccountant", "Do you use an accountant?"],
            ["ownsMoreThanOneRentalProperty", "Do you own more than one rental property?"],
          ].map(([field, label]) => (
            <label className="tax-check" key={field}>
              <input
                type="checkbox"
                checked={form[field as keyof MtdFormState] as boolean}
                onChange={(event) => {
                  updateField(field as keyof MtdFormState, event.target.checked as MtdFormState[keyof MtdFormState]);
                  trackCompletionOnce();
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <aside className="tax-tool-result card" aria-live="polite">
          <span className="eyebrow">MTD readiness</span>
          <h2>{result.thresholdStatus}</h2>
          <p className="muted">Qualifying income entered: {formatCurrency(result.qualifyingIncome)}</p>
          <div className="readiness-meter" aria-label={`Digital record readiness score ${result.readinessScore}%`}>
            <span style={{ width: `${result.readinessScore}%` }} />
          </div>
          <h3>{result.readinessScore}% - {result.readinessLabel}</h3>
          <h3>Suggested next steps</h3>
          <ul className="tax-list">
            {result.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <div className="tax-soft-cta">
            <p>Start organising your landlord records before the deadline.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
