import type { Metadata } from "next";
import Link from "next/link";

import { buildMetadata } from "../../../../lib/metadata";
import { siteConfig } from "../../../../content/site";
import { type Locale } from "../../../../lib/i18n";

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

export default async function LocalizedTenaqoVsAppsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  const heading =
    locale === "pl"
      ? "Tenaqo vs aplikacje do zarządzania najmem"
      : "Tenaqo vs landlord management apps";

  const body =
    locale === "pl"
      ? "Pełna strona porównawcza wkrótce. Sprawdź funkcje Tenaqo lub otwórz aplikację."
      : "Full comparison page coming soon. Explore Tenaqo features or open the app.";

  return (
    <main id="main-content">
      <section className="container" style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
        <h1>{heading}</h1>
        <p style={{ marginTop: "2rem", color: "var(--color-text-muted, #6b7280)" }}>
          {body}{" "}
          <Link href={`/${locale}/features`}>
            {locale === "pl" ? "Funkcje Tenaqo" : "Tenaqo features"}
          </Link>{" "}
          ·{" "}
          <a href={siteConfig.appUrl}>
            {locale === "pl" ? "Otwórz aplikację" : "Open the app"}
          </a>
        </p>
      </section>
    </main>
  );
}
