import type { Metadata } from "next";
import Link from "next/link";

import { cityPages } from "../../content/locations";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Tenaqo for Landlords Across the UK | Rental operations software that keeps landlords in control",
  description:
    "Tenaqo helps landlords in Bristol, Manchester, London, Birmingham, Leeds and across the UK track rent, manage maintenance, and stay on top of compliance from one dashboard.",
  canonical: "/locations",
});

export default function LocationsIndex() {
  return (
    <main>
      <section className="section">
        <div className="container">
          <span className="eyebrow">Landlords across the UK</span>
          <h1 style={{ margin: "0.75rem 0 1rem", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "var(--brand-strong)" }}>
            Rental operations software that keeps UK landlords in control
          </h1>
          <p className="muted" style={{ maxWidth: 640, lineHeight: 1.75 }}>
            Tenaqo helps landlords reduce manual admin, track rental income, manage maintenance, organise documents, and keep portfolio actions visible — from one rental management dashboard. Available across England and Wales.
          </p>
          <div className="grid grid-3" style={{ marginTop: "3rem", gap: "1.25rem" }}>
            {cityPages.map((city) => (
              <Link
                key={city.slug}
                href={`/locations/${city.slug}`}
                className="card"
                style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.35rem", transition: "box-shadow 160ms ease, transform 160ms ease" }}
              >
                <p style={{ margin: 0, font: "700 1.1rem/1.2 var(--font-sans)", color: "var(--brand-strong)" }}>
                  {city.city}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>{city.region}</p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "var(--accent)", fontWeight: 700 }}>
                  See {city.city} page →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
