import Link from "next/link";

import type { CityContent } from "../../content/locations";

export function LocationPage({ city }: { city: CityContent }) {
  return (
    <main>
      {/* Hero */}
      <section className="location-hero">
        <div className="container">
          <span className="eyebrow">{city.hero.eyebrow}</span>
          <h1>{city.hero.title}</h1>
          <p>{city.hero.body}</p>
          <div className="button-row">
            <Link href={city.hero.primaryCta.href} className="button button-primary">
              {city.hero.primaryCta.label}
            </Link>
            <Link
              href={city.hero.secondaryCta.href}
              className="button"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
            >
              {city.hero.secondaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="section">
        <div className="container">
          <div className="card content-block" style={{ padding: "2.5rem" }}>
            <h2 style={{ margin: "0 0 1rem", color: "var(--brand-strong)" }}>{city.intro.heading}</h2>
            <p className="muted" style={{ lineHeight: 1.75, maxWidth: 760 }}>{city.intro.body}</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="location-features">
        <div className="container">
          <h2 style={{ margin: "0 0 0.5rem", color: "var(--brand-strong)", fontSize: "clamp(1.3rem, 2.8vw, 1.9rem)" }}>
            What OASIS gives {city.city} landlords
          </h2>
          <p className="muted" style={{ maxWidth: 600 }}>
            Automated Property Management Software that connects rent, maintenance, documents, and compliance in one dashboard.
          </p>
          <div className="location-features__grid">
            {city.features.map((f) => (
              <article key={f.title} className="card location-feature-card">
                <h3>{f.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: "0.93rem", lineHeight: 1.6 }}>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="location-cta">
        <div className="container">
          <h2>{city.cta.heading}</h2>
          <p className="muted" style={{ maxWidth: 600, margin: "0 auto 2rem", lineHeight: 1.7 }}>
            {city.cta.body}
          </p>
          <Link href={city.cta.primaryCta.href} className="button button-primary">
            {city.cta.primaryCta.label}
          </Link>
          <p className="muted" style={{ marginTop: "1.25rem", fontSize: "0.82rem" }}>
            OASIS is rental management software. It does not replace regulated letting, legal, or professional advice where those are required.
          </p>
        </div>
      </section>
    </main>
  );
}
