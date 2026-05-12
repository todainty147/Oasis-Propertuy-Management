import Link from "next/link";

import { siteConfig } from "../../content/site";

type FeatureItem = { title: string; body: string };

type SeoFeatureSectionProps = {
  title: string;
  body: string;
  features: FeatureItem[];
  // Optional yield and passive sections rendered inline when provided
  rentalYield?: { title: string; body: string; bullets: string[] };
  passiveLandlord?: { title: string; body: string; cta: { label: string; href: string } };
};

export function SeoFeatureSection({
  title,
  body,
  features,
  rentalYield,
  passiveLandlord,
}: SeoFeatureSectionProps) {
  return (
    <>
      <section className="section seo-feature-section">
        <div className="container">
          <div className="section-title" style={{ maxWidth: 720, marginBottom: "2.5rem" }}>
            <h2>{title}</h2>
            <p className="muted" style={{ marginTop: "0.75rem" }}>{body}</p>
          </div>
          <div className="seo-feature-section__grid">
            {features.map((f) => (
              <div key={f.title} className="card seo-feature-card">
                <h3 className="seo-feature-card__title">{f.title}</h3>
                <p className="muted seo-feature-card__body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {rentalYield && (
        <section className="section yield-section">
          <div className="container">
            <div className="yield-section__inner">
              <div className="yield-section__content">
                <h2>{rentalYield.title}</h2>
                <p className="muted" style={{ marginTop: "0.75rem", lineHeight: 1.7 }}>
                  {rentalYield.body}
                </p>
                <ul className="yield-section__bullets">
                  {rentalYield.bullets.map((b) => (
                    <li key={b} className="yield-section__bullet">
                      <span className="yield-section__check" aria-hidden="true">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {passiveLandlord && (
        <section className="section passive-section">
          <div className="container">
            <div className="passive-section__inner">
              <h2>{passiveLandlord.title}</h2>
              <p className="muted" style={{ marginTop: "0.75rem", maxWidth: 720, lineHeight: 1.7 }}>
                {passiveLandlord.body}
              </p>
              <div className="button-row" style={{ marginTop: "2rem" }}>
                <Link href={passiveLandlord.cta.href} className="button button-primary">
                  {passiveLandlord.cta.label}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
