import Link from "next/link";

import { ExpenseTesterForm } from "../../../components/landlord-tools/expense-tester-form";
import { buildMetadata } from "../../../lib/metadata";

export const metadata = buildMetadata({
  title: "Free HMRC Expense Tester for Landlords | Tenaqo",
  description:
    "Check whether a landlord expense may be repairs, maintenance, capital improvement, insurance, finance cost, professional fee or another rental-property category. General guidance only - no HMRC submission.",
  canonical: "/landlord-tools/hmrc-expense-tester",
});

export default function HmrcExpenseTesterPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Free HMRC Expense Tester for Landlords</span>
          <h1>Check where a landlord expense might belong before MTD arrives</h1>
          <p className="muted" style={{ maxWidth: 820, marginTop: "1.25rem" }}>
            Use Tenaqo&apos;s free HMRC Expense Tester to get general guidance on whether a property cost looks like repairs, maintenance, capital improvement, finance cost, insurance, professional fees or something that needs accountant review.
          </p>
          <div className="button-row">
            <a href="#expense-tester" className="button button-primary">Test an expense</a>
            <Link href="/features/compliance" className="button button-secondary">See how Tenaqo helps landlords stay organised</Link>
          </div>
        </div>
      </section>
      <div id="expense-tester">
        <ExpenseTesterForm />
      </div>
    </>
  );
}
