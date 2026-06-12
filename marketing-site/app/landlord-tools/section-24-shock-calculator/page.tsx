import { Section24CalculatorForm } from "../../../components/landlord-tools/section24-calculator-form";
import { buildMetadata } from "../../../lib/metadata";

export const metadata = buildMetadata({
  title: "Section 24 Shock Calculator for Landlords | Tenaqo",
  description:
    "Estimate how mortgage interest relief restrictions can affect a landlord's tax position. Compare the old-style deduction view with the current basic-rate finance cost credit approach. General guidance only.",
  canonical: "/landlord-tools/section-24-shock-calculator",
});

export default function Section24ShockCalculatorPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Section 24 Shock Calculator for Landlords</span>
          <h1>See why mortgage interest can still leave landlords with a surprise tax bill</h1>
          <p className="muted" style={{ maxWidth: 820, marginTop: "1.25rem" }}>
            Enter a simple salary, rental income, property expenses and finance costs to compare a simplified &quot;before Section 24&quot; view with the current finance-cost restriction approach.
          </p>
          <p className="muted" style={{ maxWidth: 820, marginTop: "0.75rem" }}>
            The calculator is designed to show why taxable profit can feel disconnected from cash flow when finance costs are restricted. It is a planning aid for landlords reviewing records, not a full tax computation.
          </p>
          <p className="muted" style={{ maxWidth: 820, marginTop: "0.75rem" }}>
            Keep the result with your wider rent, expense, and portfolio notes so you can discuss the right figures with a qualified adviser. Tenaqo helps landlords keep those records connected to the properties and decisions they support.
          </p>
          <div className="button-row">
            <a href="#section24-calculator" className="button button-primary">Calculate the impact</a>
          </div>
        </div>
      </section>
      <div id="section24-calculator">
        <Section24CalculatorForm />
      </div>
    </>
  );
}
