import Link from "next/link";

import type { Locale } from "../../lib/i18n";
import { getLocalizedMarketingHref } from "../../lib/i18n";

type Cta = { label: string; href: string };

export function FinalCta({
  title,
  body,
  primaryCta,
  secondaryCta,
  locale = "en",
}: {
  title: string;
  body: string;
  primaryCta: Cta;
  secondaryCta?: Cta;
  locale?: Locale;
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card final-cta">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
            Early access is for landlord feedback and onboarding conversations while selected workflows continue to mature.
          </p>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <Link
              href={getLocalizedMarketingHref(locale, primaryCta.href)}
              className="button button-primary"
            >
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link
                href={getLocalizedMarketingHref(locale, secondaryCta.href)}
                className="button button-secondary"
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
