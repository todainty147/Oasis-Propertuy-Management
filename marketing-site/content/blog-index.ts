import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

type BlogIndexContent = {
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
  };
  launchListTitle: string;
  launchListBody: string;
  readMoreLabel: string;
  publishingTitle: string;
  publishingBody: string;
  finalCta: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
};

export const blogIndexContentByLocale: Record<Locale, BlogIndexContent> = {
  en: {
    seo: {
      title: "Tenaqo Blog | Rental Operations, Landlord Compliance and Property Workflows",
      description:
        "Practical landlord guides on rent calculation, expected charges, maintenance workflow, compliance readiness, AI tools for landlords, property health, and operating rentals with more control.",
      canonicalPath: "/blog",
    },
    hero: {
      eyebrow: "Blog",
      title: "Practical reading for landlords who want more control and less drag",
      body:
        "No fluff. Practical guidance on rent rules and expected charges, repairs, documents, compliance readiness, AI for landlords, portfolio health, and the operating rhythm behind calmer rental work.",
    },
    launchListTitle: "Launch reading list",
    launchListBody:
      "These first guides set the editorial direction for Tenaqo: practical, landlord-focused, and close to the weekly work of rent calculation, repairs, records, compliance, and follow-up. Topics include: why rent calculation should be a rules engine, expected charges vs payments, how to reduce maintenance drag, Najem Okazjonalny for Polish landlords, property health vs dashboards, and how AI should support landlords without making decisions for them.",
    readMoreLabel: "Read more",
    publishingTitle: "What Tenaqo publishes",
    publishingBody:
      "We write for small and growing landlords who are trying to replace reactive admin with a better operating rhythm. Fewer generic tips and more practical guidance on rent rules, expected charges, maintenance movement, compliance readiness (Renters' Rights Act, tax deadlines, Lease Auditor, Poland), AI assistance that keeps the landlord in control, property health scoring, and when a portfolio needs more structure. Categories: Rent & Finance, Maintenance Operations, Compliance Readiness, AI for Landlords, Poland Market, Property Health, Security & Audit.",
    finalCta: {
      title: "Try Tenaqo before we launch publicly",
      body:
        "Get early access, test the product with real rental work, and help shape how Tenaqo evolves for landlords.",
      primaryCta: { label: "Get early access", href: siteConfig.appUrl },
      secondaryCta: { label: "Compare plans", href: "/pricing" },
    },
  },
  pl: {
    seo: {
      title: "Blog Tenaqo | Zarządzanie najmem, zgodność z przepisami i procesy operacyjne",
      description:
        "Praktyczne poradniki dla właścicieli na temat naliczania czynszu, oczekiwanych opłat, obsługi zgłoszeń, zgodności z przepisami, narzędzi AI, kondycji nieruchomości i zarządzania najmem z większą kontrolą.",
      canonicalPath: "/pl/blog",
    },
    hero: {
      eyebrow: "Blog",
      title: "Praktyczna lektura dla właścicieli, którzy chcą mieć większą kontrolę i mniej operacyjnych obciążeń.",
      body:
        "Bez lania wody. Praktyczne wskazówki dotyczące naliczania czynszu, oczekiwanych opłat, napraw, dokumentów, zgodności z przepisami, AI dla wynajmujących oraz rytmu pracy, który zapewnia spokojniejsze zarządzanie portfelem.",
    },
    launchListTitle: "Lista artykułów na start",
    launchListBody:
      "Te pierwsze poradniki wyznaczają kierunek redakcyjny Tenaqo: są praktyczne, skoncentrowane na właścicielu i bliskie cotygodniowej pracy związanej z naliczaniem czynszu, naprawami, dokumentacją, zgodnością z przepisami i bieżącymi sprawami. Tematy obejmują m.in.: dlaczego rozliczanie czynszu powinno opierać się na silniku reguł, oczekiwane opłaty a realne wpłaty, jak zmniejszyć obciążenie naprawami, najem okazjonalny dla polskich właścicieli, kondycja nieruchomości a pulpity nawigacyjne oraz jak AI powinna wspierać wynajmujących, nie podejmując decyzji za nich.",
    readMoreLabel: "Czytaj dalej",
    publishingTitle: "O czym pisze Tenaqo",
    publishingBody:
      "Piszemy dla małych i rozwijających się właścicieli nieruchomości, którzy chcą zastąpić reaktywne zarządzanie lepszym rytmem operacyjnym. Mniej ogólników, a więcej praktycznych wskazówek dotyczących reguł czynszowych, oczekiwanych opłat, obsługi napraw, gotowości prawno-podatkowej (terminy podatkowe, Lease Auditor, rynek polski), wsparcia AI zachowującego kontrolę właściciela, oceny kondycji nieruchomości oraz momentu, w którym portfel wymaga struktury. Nasze kategorie: Czynsz i finanse, Utrzymanie i naprawy, Zgodność z przepisami, AI dla właścicieli, Rynek polski, Kondycja nieruchomości, Bezpieczeństwo i audyt.",
    finalCta: {
      title: "Wypróbuj Tenaqo przed oficjalną premierą",
      body:
        "Zyskaj wcześniejszy dostęp, przetestuj produkt w codziennym zarządzaniu najmem i pomóż kształtować rozwój Tenaqo dla właścicieli nieruchomości.",
      primaryCta: { label: "Zyskaj wcześniejszy dostęp", href: siteConfig.appUrl },
      secondaryCta: { label: "Porównaj plany", href: "/pricing" },
    },
  },
  de: {
    seo: {
      title: "Tenaqo Blog | Praxisleitfäden für Vermieter",
      description:
        "Praxisnahe Inhalte zu Zahlungen, Instandhaltung, Dokumenten, Nachverfolgung und mehr Kontrolle im Vermietungsalltag.",
      canonicalPath: "/de/blog",
    },
    hero: {
      eyebrow: "Blog",
      title: "Praxisnahe Inhalte für Vermieter, die mehr Kontrolle wollen",
      body:
        "Ohne Floskeln. Nur hilfreiche Einblicke zu Zahlungen, Instandhaltung, Dokumenten, Portfoliodruck und einem ruhigeren operativen Ablauf im Vermietungsalltag.",
    },
    launchListTitle: "Leseliste zum Start",
    launchListBody:
      "Diese ersten Beiträge setzen die redaktionelle Richtung für Tenaqo: praxisnah, auf Vermieter ausgerichtet und dicht an der wöchentlichen Arbeit rund um Zahlungen, Reparaturen, Unterlagen und Nachverfolgung.",
    readMoreLabel: "Weiterlesen",
    publishingTitle: "Worüber Tenaqo schreibt",
    publishingBody:
      "Wir schreiben für kleine und wachsende Vermieter, die reaktive Verwaltung durch einen besseren operativen Rhythmus ersetzen wollen. Weniger allgemeine Ratschläge, mehr konkrete Hinweise dazu, was verfolgt, dokumentiert, geprüft und früher strukturiert werden sollte.",
    finalCta: {
      title: "Testen Sie Tenaqo vor dem öffentlichen Start",
      body:
        "Sichern Sie sich Frühzugang, testen Sie das Produkt mit echter Vermietungsarbeit und helfen Sie mit, wie Tenaqo für Vermieter weiterwächst.",
      primaryCta: { label: "Frühzugang sichern", href: siteConfig.appUrl },
      secondaryCta: { label: "Preise ansehen", href: "/pricing" },
    },
  },
};
