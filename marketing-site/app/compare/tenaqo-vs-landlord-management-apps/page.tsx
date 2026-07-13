import type { Metadata } from "next";
import Link from "next/link";

import { buildMetadata } from "../../../lib/metadata";
import { siteConfig } from "../../../content/site";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Tenaqo vs Landlord Management Apps | Rental Operations with Evidence Continuity",
    description:
      "How Tenaqo compares to general landlord management apps. See compliance records, maintenance follow-through, evidence continuity and verification boundaries.",
    canonical: `${siteConfig.url}/compare/tenaqo-vs-landlord-management-apps`,
    languages: {
      en: "/compare/tenaqo-vs-landlord-management-apps",
      pl: "/pl/compare/tenaqo-vs-landlord-management-apps",
      "x-default": "/compare/tenaqo-vs-landlord-management-apps",
    },
  }),
  // WP4 will build the real page; keep out of search index until then
  robots: { index: false, follow: true },
};

export default function TenaqoVsLandlordManagementAppsPage() {
  return (
    <main id="main-content">
      <section className="container" style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
        <h1>Tenaqo vs landlord management apps</h1>
        <p className="lead" style={{ maxWidth: "640px", marginTop: "1rem" }}>
          Rental operations with evidence continuity and explicit verification boundaries—compared
          to general landlord management tools.
        </p>
        <p style={{ marginTop: "2rem", color: "var(--color-text-muted, #6b7280)" }}>
          Full comparison page coming soon. In the meantime, explore{" "}
          <Link href="/features">Tenaqo features</Link> or{" "}
          <a href={siteConfig.appUrl}>open the Tenaqo app</a>.
        </p>
      </section>
    </main>
  );
}
