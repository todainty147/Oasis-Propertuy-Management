import Link from "next/link";

import type { Locale } from "../../lib/i18n";

export function LandlordToolsCta({ locale = "en" }: { locale?: Locale }) {
  if (locale !== "en") return null;

  return (
    <section className="section section-tight-top">
      <div className="container">
        <div className="landlord-tools-cta card">
          <div>
            <span className="eyebrow">Landlord tax tools</span>
            <h2>Not sure how landlord expenses should be tracked?</h2>
            <p className="muted">
              Use Tenaqo&apos;s free landlord tools to test an expense, estimate Section 24 impact and check your MTD readiness.
            </p>
          </div>
          <Link className="button button-primary" href="/landlord-tools">
            Try the free landlord tools
          </Link>
        </div>
      </div>
    </section>
  );
}
