import Link from "next/link";

import type { Locale } from "../../lib/i18n";
import { getLocalizedMarketingHref } from "../../lib/i18n";
import { featuresPageContentByLocale } from "../../content/features-page";
import { PageHero } from "./page-hero";
import { FinalCta } from "./final-cta";

export function MarketingFeaturesPage({ locale }: { locale: Locale }) {
  const content = featuresPageContentByLocale[locale];

  return (
    <>
      <PageHero {...content.hero} locale={locale} />
      <section className="section">
        <div className="container">
          <div className="section-title">
            <h2>{content.sectionTitle}</h2>
            <p className="muted">{content.sectionBody}</p>
          </div>
          <div className="grid grid-2">
            {content.outcomeSections.map((section) => (
              <article key={section.title} className="card feature-card">
                <span className="eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p className="muted">{section.why}</p>
                <ul className="muted">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <Link
                    href={getLocalizedMarketingHref(locale, section.href)}
                    className="button button-secondary"
                  >
                    {section.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <FinalCta {...content.finalCta} locale={locale} />
    </>
  );
}
