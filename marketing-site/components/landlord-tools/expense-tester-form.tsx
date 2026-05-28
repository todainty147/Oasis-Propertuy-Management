"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import {
  EXPENSE_TESTER_CATEGORIES,
  SAMPLE_EXPENSES,
  classifyExpense,
  type ExpenseTesterInput,
} from "../../lib/landlordTaxTools/expenseTester";
import { siteConfig } from "../../content/site";
import { TAX_TOOL_DISCLAIMER } from "../../lib/landlordTaxTools/shared";
import { trackMarketingEvent } from "./analytics";

const UNKNOWN = "";
type NullableBooleanString = "yes" | "no" | "";
type ExpenseTesterFormState = Required<Record<"description" | "categoryHint" | "propertyContext", string>> &
  Record<
    | "restoresSameStandard"
    | "improvesOrAddsSomething"
    | "propertyWasRunDownWhenPurchased"
    | "partlyPersonalUse"
    | "connectedToFinanceInsuranceLegalOrAgentFees",
    NullableBooleanString
  >;
type ExpenseQuestionField = Exclude<keyof ExpenseTesterFormState, "description" | "categoryHint" | "propertyContext">;

const expenseQuestions: Array<[ExpenseQuestionField, string]> = [
  ["restoresSameStandard", "Does this restore something to broadly the same standard?"],
  ["improvesOrAddsSomething", "Does this improve, upgrade or add something new?"],
  ["propertyWasRunDownWhenPurchased", "Was the property run-down or unlettable when purchased?"],
  ["partlyPersonalUse", "Is this partly personal use?"],
  ["connectedToFinanceInsuranceLegalOrAgentFees", "Is this connected to finance, mortgage, insurance, legal or agent fees?"],
];

function parseNullableBoolean(value: NullableBooleanString) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export function ExpenseTesterForm() {
  const [form, setForm] = useState<ExpenseTesterFormState>({
    description: "",
    categoryHint: "",
    propertyContext: "",
    restoresSameStandard: UNKNOWN,
    improvesOrAddsSomething: UNKNOWN,
    propertyWasRunDownWhenPurchased: UNKNOWN,
    partlyPersonalUse: UNKNOWN,
    connectedToFinanceInsuranceLegalOrAgentFees: UNKNOWN,
  });
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!hasSubmitted) return null;
    const input: ExpenseTesterInput = {
      ...form,
      restoresSameStandard: parseNullableBoolean(form.restoresSameStandard),
      improvesOrAddsSomething: parseNullableBoolean(form.improvesOrAddsSomething),
      propertyWasRunDownWhenPurchased: parseNullableBoolean(form.propertyWasRunDownWhenPurchased),
      partlyPersonalUse: parseNullableBoolean(form.partlyPersonalUse),
      connectedToFinanceInsuranceLegalOrAgentFees: parseNullableBoolean(form.connectedToFinanceInsuranceLegalOrAgentFees),
    };
    return classifyExpense(input);
  }, [form, hasSubmitted]);

  function updateField<K extends keyof ExpenseTesterFormState>(field: K, value: ExpenseTesterFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitted(true);
    trackMarketingEvent("expense_tester_completed");
  }

  function applySample(sample: string) {
    setForm((current) => ({ ...current, description: sample }));
    setHasSubmitted(true);
    trackMarketingEvent("expense_tester_started");
  }

  return (
    <section className="section section-tight-top">
      <div className="container tax-tool-grid">
        <form className="tax-tool-panel card" onSubmit={submit}>
          <p className="tax-tool-disclaimer">{TAX_TOOL_DISCLAIMER}</p>
          <label className="tax-field">
            <span>Expense description</span>
            <input
              value={form.description}
              onFocus={() => trackMarketingEvent("expense_tester_started")}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="e.g. Replacing a broken boiler"
            />
          </label>
          <div className="tax-form-grid">
            <label className="tax-field">
              <span>Optional category hint</span>
              <select value={form.categoryHint} onChange={(event) => updateField("categoryHint", event.target.value)}>
                <option value="">No hint</option>
                {Object.entries(EXPENSE_TESTER_CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tax-field">
              <span>Optional property context</span>
              <select value={form.propertyContext} onChange={(event) => updateField("propertyContext", event.target.value)}>
                <option value="">No context</option>
                <option value="between tenants">Between tenants</option>
                <option value="during tenancy">During tenancy</option>
                <option value="before first letting">Before first letting</option>
                <option value="major renovation before first letting">Major renovation before first letting</option>
              </select>
            </label>
          </div>
          <div className="tax-question-list">
            {expenseQuestions.map(([field, label]) => (
              <label className="tax-field" key={field}>
                <span>{label}</span>
                <select
                  value={form[field]}
                  onChange={(event) => updateField(field, event.target.value as NullableBooleanString)}
                >
                  <option value="">Not sure</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
          </div>
          <button className="button button-primary" type="submit">
            Test an expense
          </button>
          <div className="sample-chip-list" aria-label="Sample expenses">
            {SAMPLE_EXPENSES.map((sample) => (
              <button key={sample} type="button" className="sample-chip" onClick={() => applySample(sample)}>
                {sample}
              </button>
            ))}
          </div>
        </form>

        <aside className="tax-tool-result card" aria-live="polite">
          {result ? (
            <>
              <div className="tax-badge-row">
                <span className="tax-badge">{result.label}</span>
                <span className="tax-badge tax-badge--confidence">{result.confidence} confidence</span>
              </div>
              <h2>{result.summary}</h2>
              <p className="muted">{result.explanation}</p>
              <h3>Why this result?</h3>
              <ul className="tax-list">
                {result.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <h3>What to keep in your records</h3>
              <ul className="tax-list">
                {result.recordKeepingChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="tax-soft-cta">
                <p>{result.tenaqoCta}</p>
                <Link
                  href={siteConfig.appUrl}
                  className="button button-secondary"
                  onClick={() => trackMarketingEvent("expense_tester_cta_clicked")}
                >
                  Join the Tenaqo early access list
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">Result</span>
              <h2>Your expense guidance will appear here</h2>
              <p className="muted">
                Add a description and answer what you know. Not sure is fine; unclear cases should stay marked for review.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
