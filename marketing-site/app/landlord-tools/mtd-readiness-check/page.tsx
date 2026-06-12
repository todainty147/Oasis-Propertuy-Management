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
          <p className="muted" style={{ maxWidth: 820, marginTop: "0.75rem" }}>
            The check is intentionally simple: it looks at broad income signals and turns the result into practical record-keeping prompts. It does not submit anything to HMRC, calculate a final tax position, or replace advice from an accountant.
          </p>
          <p className="muted" style={{ maxWidth: 820, marginTop: "0.75rem" }}>
            Use it to decide whether your rental records, expense categories, invoices, bank references, and property notes are organised enough for a more digital workflow. Tenaqo keeps those operational records close to rent and compliance work so preparation is not left until the deadline.
          </p>
        </div>
      </section>
      <MtdReadinessForm />
    </>
  );
}
