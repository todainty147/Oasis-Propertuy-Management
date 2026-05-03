import type { Locale } from "../lib/i18n";

type LegalNoticeContent = {
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{
    title: string;
    body: string[];
  }>;
};

export const legalNoticeContentByLocale: Record<Locale, LegalNoticeContent> = {
  en: {
    seo: {
      title: "OASIS Legal Notice | Preview marketing site information",
      description:
        "Legal notice and operator information for the OASIS preview marketing site.",
      canonicalPath: "/impressum",
    },
    eyebrow: "Legal notice",
    title: "Operator information for this preview site",
    intro:
      "This marketing site is currently part of the OASIS pre-launch preview. Public-facing legal entity details for commercial rollout are being finalized before broader market promotion.",
    sections: [
      {
        title: "Current status",
        body: [
          "The site is being used to present the current OASIS product surface, screenshots, and launch-direction messaging.",
          "The product and security claims on this site are intended to stay aligned with the checked-in codebase and supporting documentation.",
        ],
      },
      {
        title: "Commercial launch notice",
        body: [
          "Full company registration details, trading address, and formal market-specific legal disclosures will be published before broad commercial promotion in Germany and other regulated launch markets.",
        ],
      },
      {
        title: "Contact route",
        body: [
          "If you need legal or procurement information before general availability, please use the commercial onboarding/contact route provided during direct product conversations.",
        ],
      },
    ],
  },
  pl: {
    seo: {
      title: "OASIS | Informacje prawne dla strony preview",
      description:
        "Informacje prawne i status operatora dla preview marketingowego OASIS.",
      canonicalPath: "/pl/impressum",
    },
    eyebrow: "Informacje prawne",
    title: "Informacje o operatorze tej strony preview",
    intro:
      "Ta strona marketingowa działa obecnie jako preview przed publicznym startem OASIS. Publiczne dane podmiotu i pełne informacje formalne dla komercyjnego uruchomienia są finalizowane przed szerszą promocją.",
    sections: [
      {
        title: "Obecny status",
        body: [
          "Strona służy do prezentacji aktualnych funkcji OASIS, screenshotów produktu i kierunku rozwoju przed pełnym wejściem na rynek.",
          "Opisy produktu i bezpieczeństwa mają pozostawać zgodne z repozytorium, kodem i dokumentacją techniczną.",
        ],
      },
      {
        title: "Informacja o uruchomieniu komercyjnym",
        body: [
          "Pełne dane rejestrowe, adres prowadzenia działalności i wymagane ujawnienia formalne będą opublikowane przed szeroką promocją komercyjną na kolejnych rynkach.",
        ],
      },
      {
        title: "Kontakt",
        body: [
          "Jeśli potrzebujesz informacji prawnych lub zakupowych przed ogólną dostępnością, skorzystaj z kanału kontaktu komercyjnego udostępnianego podczas bezpośrednich rozmów o wdrożeniu.",
        ],
      },
    ],
  },
  de: {
    seo: {
      title: "OASIS Impressum | Hinweise zur Vorschau-Website",
      description:
        "Impressumshinweise und Betreiberstatus für die OASIS Vorschau-Website.",
      canonicalPath: "/de/impressum",
    },
    eyebrow: "Impressum",
    title: "Hinweise zum Betreiber dieser Vorschau-Website",
    intro:
      "Diese Marketing-Website wird derzeit als OASIS Vorschau vor dem breiteren Marktstart betrieben. Die vollständigen Unternehmens- und Registrierungsangaben für die öffentliche Vermarktung werden vor einer breiteren kommerziellen Ansprache veröffentlicht.",
    sections: [
      {
        title: "Aktueller Status",
        body: [
          "Diese Website zeigt den aktuellen Produktstand, Screenshots und die Markteinführungsrichtung von OASIS.",
          "Produkt- und Sicherheitsdarstellungen sollen mit dem eingecheckten Codebestand und der technischen Dokumentation übereinstimmen.",
        ],
      },
      {
        title: "Hinweis zum Marktstart",
        body: [
          "Vollständige Unternehmensangaben, ladungsfähige Anschrift und weitere marktspezifische Pflichtangaben werden vor einer breiteren kommerziellen Ansprache in Deutschland veröffentlicht.",
        ],
      },
      {
        title: "Kontakt für Vorab-Prüfungen",
        body: [
          "Wenn Sie vor der allgemeinen Verfügbarkeit rechtliche oder einkaufsbezogene Informationen benötigen, nutzen Sie bitte den direkten kommerziellen Kontaktweg aus der jeweiligen Produkt- oder Onboarding-Kommunikation.",
        ],
      },
    ],
  },
};
