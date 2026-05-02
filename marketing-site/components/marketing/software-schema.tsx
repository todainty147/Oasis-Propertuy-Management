"use client";

import { usePathname } from "next/navigation";

import { getLocaleFromPathname, getLocalePath } from "../../lib/i18n";

const descriptions = {
  en: "OASIS helps landlords run property operations with one clear view of maintenance, tenant follow-up, documents, payments visibility, property health, and AI-assisted action queues.",
  pl: "OASIS pomaga właścicielom mieszkań zarządzać najmem z pełną kontrolą nad zgłoszeniami, wykonawcami, dokumentami, płatnościami i kondycją nieruchomości.",
  de: "OASIS hilft Vermietern, Immobilienabläufe aktiv zu steuern: mit Übersicht über Instandhaltung, Mieteranfragen, Dokumente, Zahlungsübersicht und Immobilienzustand.",
} as const;

export function SoftwareSchema() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const url = `https://marketing.oasisrentalmgt.app${getLocalePath(locale)}`;

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OASIS Rental",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url,
    description: descriptions[locale],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
