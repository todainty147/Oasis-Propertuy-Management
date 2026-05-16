"use client";

import { usePathname } from "next/navigation";

import { getLocaleFromPathname } from "../../lib/i18n";

const descriptions = {
  en: "Rental operations software for landlords and property managers. Manage rent, repairs, documents, tenants, contractors, compliance readiness, and next actions in one operating layer.",
  pl: "Tenaqo pomaga właścicielom mieszkań zarządzać najmem z pełną kontrolą nad zgłoszeniami, wykonawcami, dokumentami, płatnościami i kondycją nieruchomości.",
  de: "Tenaqo hilft Vermietern, Immobilienabläufe aktiv zu steuern: mit Übersicht über Instandhaltung, Mieteranfragen, Dokumente, Zahlungsübersicht und Immobilienzustand.",
} as const;

export function SoftwareSchema() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const siteUrl = "https://marketing.oasisrentalmgt.app";

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Tenaqo",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description: descriptions[locale],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GBP",
      offerCount: 4,
      lowPrice: "0",
      description: "Starter, Growth, Pro, and Operator/Agency plans available.",
    },
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tenaqo",
    url: siteUrl,
    description: descriptions[locale],
    // sameAs: [] — add verified social profile URLs here once confirmed
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  );
}
