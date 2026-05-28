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
