import { MtdReadinessForm } from "../../../components/landlord-tools/mtd-readiness-form";
import { buildMetadata } from "../../../lib/metadata";

export const metadata = buildMetadata({
  title: "MTD Readiness Check for Landlords | Tenaqo",
  description:
    "Check whether your rental income may fall into Making Tax Digital for Income Tax thresholds and what records landlords should start organising.",
  canonical: "/landlord-tools/mtd-readiness-check",
});

export default function MtdReadinessCheckPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">MTD Readiness Check for Landlords</span>
          <h1>Check your Making Tax Digital readiness before deadlines arrive</h1>
          <p className="muted" style={{ maxWidth: 820, marginTop: "1.25rem" }}>
            Estimate whether your property and self-employment income may cross the Making Tax Digital thresholds, then see which digital record habits to improve next.
          </p>
        </div>
      </section>
      <MtdReadinessForm />
    </>
  );
}
