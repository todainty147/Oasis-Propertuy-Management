"use client";

import { useMemo, useState } from "react";

import { calculateAgencyFeeExposure } from "../../lib/agencyFeeExposure";

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AgencyFeeCalculator() {
  const [propertyCount, setPropertyCount] = useState(3);
  const [averageMonthlyRent, setAverageMonthlyRent] = useState(1400);
  const [agentFeePercent, setAgentFeePercent] = useState(10);

  const exposure = useMemo(
    () => calculateAgencyFeeExposure({ propertyCount, averageMonthlyRent, agentFeePercent }),
    [propertyCount, averageMonthlyRent, agentFeePercent],
  );

  return (
    <section className="section agency-fee-calculator" data-marketing-section="agency-fee-calculator">
      <div className="container">
        <div className="card agency-fee-calculator__panel">
          <div className="agency-fee-calculator__copy">
            <span className="eyebrow">Agency fee exposure</span>
            <h2>Estimate the monthly fee pressure behind percentage-based management</h2>
            <p className="muted">
              Use this alongside the comparison table. It is based on the values you entered;
              actual fees vary by agent and service level.
            </p>
          </div>

          <div className="agency-fee-calculator__form" aria-label="Estimated agency fee exposure calculator">
            <label>
              <span>Number of properties</span>
              <input
                type="number"
                min="0"
                value={propertyCount}
                onChange={(event) => setPropertyCount(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Average monthly rent</span>
              <input
                type="number"
                min="0"
                step="50"
                value={averageMonthlyRent}
                onChange={(event) => setAverageMonthlyRent(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Agent fee percentage</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={agentFeePercent}
                onChange={(event) => setAgentFeePercent(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="agency-fee-calculator__results" aria-live="polite">
            <article>
              <span>Estimated monthly agency fees</span>
              <strong>{formatGBP(exposure.monthly)}</strong>
            </article>
            <article>
              <span>Estimated annual agency fees</span>
              <strong>{formatGBP(exposure.annual)}</strong>
            </article>
            <p>Estimated agency fee exposure. Actual fees vary by agent and service level.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
