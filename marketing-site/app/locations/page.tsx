import type { Metadata } from "next";
import Link from "next/link";

import { cityPages } from "../../content/locations";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Tenaqo for UK Landlords | Rental Operations Software",
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
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.75, marginTop: "1rem" }}>
            The local pages below explain how the same landlord workflow applies in different operating contexts: student-heavy cities, larger commuter markets, higher-rent portfolios, and growing regional rental businesses. Each page keeps the focus on practical work landlords repeat every week: checking rent status, keeping repairs moving, storing evidence, and spotting properties that need attention.
          </p>
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.75, marginTop: "1rem" }}>
            Tenaqo does not replace local legal, tax, or letting advice. It gives landlords a clearer operating layer for the records, requests, and follow-up that sit around those decisions.
          </p>
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.75, marginTop: "1rem" }}>
            Start with the city closest to your portfolio, then compare the workflow with your own rental process. The same tools apply whether you manage one flat, several houses, or a growing portfolio spread across multiple neighbourhoods.
          </p>
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.75, marginTop: "1rem" }}>
            If your city is not listed yet, use these pages as examples of the operating model: rent visibility, maintenance workflow, tenant records, compliance evidence, and portfolio health stay connected instead of being managed as separate admin jobs.
          </p>
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.75, marginTop: "1rem" }}>
            More city pages can be added as the product footprint grows, but the core landlord workflow stays the same: fewer disconnected records, clearer next actions, and a calmer weekly review rhythm.
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
