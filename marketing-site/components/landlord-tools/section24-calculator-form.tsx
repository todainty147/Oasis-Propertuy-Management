"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { siteConfig } from "../../content/site";
import {
  calculateSection24Comparison,
  getAvailableSection24TaxYears,
} from "../../lib/landlordTaxTools/section24Calculator";
import { TAX_TOOL_DISCLAIMER, formatCurrency } from "../../lib/landlordTaxTools/shared";
import { trackMarketingEvent } from "./analytics";

const currentTaxYear = "2026/27";
type Section24FormState = {
  employmentIncome: string;
  rentalIncome: string;
  nonFinanceExpenses: string;
  financeCosts: string;
  taxYear: string;
};

export function Section24CalculatorForm() {
  const taxYearOptions = getAvailableSection24TaxYears();
  const [form, setForm] = useState<Section24FormState>({
    employmentIncome: "45000",
    rentalIncome: "18000",
    nonFinanceExpenses: "3000",
    financeCosts: "9000",
    taxYear: currentTaxYear,
  });
  const [calculated, setCalculated] = useState(false);

  const result = useMemo(
    () =>
      calculateSection24Comparison({
        employmentIncome: Number(form.employmentIncome),
        rentalIncome: Number(form.rentalIncome),
        nonFinanceExpenses: Number(form.nonFinanceExpenses),
        financeCosts: Number(form.financeCosts),
        taxYear: form.taxYear,
      }),
    [form],
  );

  function updateField<K extends keyof Section24FormState>(field: K, value: Section24FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCalculated(true);
    trackMarketingEvent("section24_calculator_completed");
  }

  return (
    <section className="section section-tight-top">
      <div className="container tax-tool-grid">
        <form className="tax-tool-panel card" onSubmit={submit}>
          <p className="tax-tool-disclaimer">{TAX_TOOL_DISCLAIMER}</p>
          <div className="tax-form-grid">
            {[
              ["employmentIncome", "Employment / other taxable income"],
              ["rentalIncome", "Annual gross rental income"],
              ["nonFinanceExpenses", "Non-finance allowable property expenses"],
              ["financeCosts", "Residential property finance costs / mortgage interest"],
            ].map(([field, label]) => (
              <label className="tax-field" key={field}>
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={form[field as keyof Section24FormState]}
                  onFocus={() => trackMarketingEvent("section24_calculator_started")}
                  onChange={(event) => updateField(field as keyof Section24FormState, event.target.value)}
                />
              </label>
            ))}
            <label className="tax-field">
              <span>Tax year</span>
              <select value={form.taxYear} onChange={(event) => updateField("taxYear", event.target.value)}>
                {taxYearOptions.years.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{taxYearOptions.note}</p>
          <button className="button button-primary" type="submit">
            Calculate the impact
          </button>
        </form>

        <aside className="tax-tool-result card" aria-live="polite">
          <span className="eyebrow">Section 24 estimate</span>
          <h2>{formatCurrency(result.difference.estimatedExtraTax)}</h2>
          <p className="muted">{result.difference.effectiveImpactMessage}</p>
          <div className="section24-cards">
            <div className="section24-card">
              <h3>Before finance cost restriction</h3>
              <dl>
                <div><dt>Rental income</dt><dd>{formatCurrency(Number(form.rentalIncome))}</dd></div>
                <div><dt>Less non-finance expenses</dt><dd>{formatCurrency(Number(form.nonFinanceExpenses))}</dd></div>
                <div><dt>Less finance costs</dt><dd>{formatCurrency(Number(form.financeCosts))}</dd></div>
                <div><dt>Simplified taxable rental profit</dt><dd>{formatCurrency(result.oldRules.taxableRentalProfit)}</dd></div>
              </dl>
            </div>
            <div className="section24-card">
              <h3>Current finance cost restriction</h3>
              <dl>
                <div><dt>Rental income</dt><dd>{formatCurrency(Number(form.rentalIncome))}</dd></div>
                <div><dt>Less non-finance expenses</dt><dd>{formatCurrency(Number(form.nonFinanceExpenses))}</dd></div>
                <div><dt>Finance costs not deducted from rental profit</dt><dd>{formatCurrency(Number(form.financeCosts))}</dd></div>
                <div><dt>Basic-rate tax credit estimate</dt><dd>{formatCurrency(result.currentRules.basicRateFinanceCostCredit)}</dd></div>
              </dl>
            </div>
          </div>
          {calculated ? (
            <>
              <h3>Why this happens</h3>
              <p className="muted">
                Section 24 is the common name landlords use for the residential finance cost restriction rules. In this simplified view, finance costs are shown as a basic-rate credit rather than a deduction from rental profit.
              </p>
              <h3>What to track inside Tenaqo</h3>
              <ul className="tax-list">
                <li>rental income</li>
                <li>non-finance expenses</li>
                <li>finance costs</li>
                <li>documents and property records</li>
              </ul>
              <div className="tax-soft-cta">
                <h3>Don&apos;t just calculate the shock - track the numbers properly</h3>
                <p>Tenaqo helps landlords organise rental income, expenses, finance costs, documents and property records in one place before MTD deadlines arrive.</p>
                <Link href={siteConfig.appUrl} className="button button-secondary" onClick={() => trackMarketingEvent("section24_calculator_cta_clicked")}>
                  Join the Tenaqo early access list
                </Link>
              </div>
            </>
          ) : null}
          <ul className="tax-list tax-list--warnings">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
