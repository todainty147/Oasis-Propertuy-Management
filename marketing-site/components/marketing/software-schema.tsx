"use client";

import { usePathname } from "next/navigation";

import { getLocaleFromPathname, getLocalePath } from "../../lib/i18n";

const descriptions = {
  en: "Reduce landlord admin with OASIS. Track rent, maintenance, tenants, documents, compliance readiness, and AI-assisted action queues from one rental management dashboard.",
  pl: "OASIS pomaga właścicielom mieszkań zarządzać najmem z pełną kontrolą nad zgłoszeniami, wykonawcami, dokumentami, płatnościami i kondycją nieruchomości.",
  de: "OASIS hilft Vermietern, Immobilienabläufe aktiv zu steuern: mit Übersicht über Instandhaltung, Mieteranfragen, Dokumente, Zahlungsübersicht und Immobilienzustand.",
} as const;

export function SoftwareSchema() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const siteUrl = "https://marketing.oasisrentalmgt.app";
  const pageUrl = `${siteUrl}${getLocalePath(locale)}`;

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OASIS Rental Management",
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
    name: "OASIS Rental Management",
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
