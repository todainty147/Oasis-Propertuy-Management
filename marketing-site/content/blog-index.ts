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
      title: "OASIS Rental Blog | Landlord operating guides",
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
      "These first guides set the editorial direction for OASIS: practical, landlord-focused, and close to the weekly work of rent calculation, repairs, records, compliance, and follow-up. Topics include: why rent calculation should be a rules engine, expected charges vs payments, how to reduce maintenance drag, Najem Okazjonalny for Polish landlords, property health vs dashboards, and how AI should support landlords without making decisions for them.",
    readMoreLabel: "Read more",
    publishingTitle: "What OASIS publishes",
    publishingBody:
      "We write for small and growing landlords who are trying to replace reactive admin with a better operating rhythm. Fewer generic tips and more practical guidance on rent rules, expected charges, maintenance movement, compliance readiness (Renters' Rights Act, tax deadlines, Lease Auditor, Poland), AI assistance that keeps the landlord in control, property health scoring, and when a portfolio needs more structure. Categories: Rent & Finance, Maintenance Operations, Compliance Readiness, AI for Landlords, Poland Market, Property Health, Security & Audit.",
    finalCta: {
      title: "Try OASIS before we launch publicly",
      body:
        "Get early access, test the product with real rental work, and help shape how OASIS evolves for landlords.",
      primaryCta: { label: "Get early access", href: siteConfig.appUrl },
      secondaryCta: { label: "Compare plans", href: "/pricing" },
    },
  },
  pl: {
    seo: {
      title: "Blog OASIS Rental | Praktyczne materiały dla właścicieli mieszkań",
      description:
        "Praktyczne materiały o najmie: płatnościach, zgłoszeniach, dokumentach, follow-upie i prowadzeniu nieruchomości z większą kontrolą.",
      canonicalPath: "/pl/blog",
    },
    hero: {
      eyebrow: "Blog",
      title: "Praktyczne materiały dla właścicieli, którzy chcą mieć większą kontrolę",
      body:
        "Bez lania wody. Tylko przydatne wskazówki o płatnościach, zgłoszeniach, dokumentach, presji w portfelu i spokojniejszym rytmie prowadzenia najmu.",
    },
    launchListTitle: "Lista startowych materiałów",
    launchListBody:
      "Te pierwsze artykuły pokazują kierunek redakcyjny OASIS: praktyczny, skupiony na właścicielu i bliski cotygodniowej pracy z najmem, naprawami, dokumentami i follow-upem.",
    readMoreLabel: "Czytaj dalej",
    publishingTitle: "O czym pisze OASIS",
    publishingBody:
      "Piszemy dla małych i rosnących właścicieli mieszkań, którzy chcą zamienić reaktywną administrację na lepszy rytm operacyjny. Mniej ogólników, więcej praktycznych wskazówek: co sprawdzić, czego dopilnować, co udokumentować i kiedy portfel potrzebuje większego porządku.",
    finalCta: {
      title: "Przetestuj OASIS przed publicznym startem",
      body:
        "Uzyskaj wcześniejszy dostęp, sprawdź produkt na realnej pracy najmu i pomóż kształtować rozwój OASIS dla właścicieli mieszkań.",
      primaryCta: { label: "Uzyskaj wcześniejszy dostęp", href: siteConfig.appUrl },
      secondaryCta: { label: "Porównaj plany", href: "/pricing" },
    },
  },
  de: {
    seo: {
      title: "OASIS Rental Blog | Praxisleitfäden für Vermieter",
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
      "Diese ersten Beiträge setzen die redaktionelle Richtung für OASIS: praxisnah, auf Vermieter ausgerichtet und dicht an der wöchentlichen Arbeit rund um Zahlungen, Reparaturen, Unterlagen und Nachverfolgung.",
    readMoreLabel: "Weiterlesen",
    publishingTitle: "Worüber OASIS schreibt",
    publishingBody:
      "Wir schreiben für kleine und wachsende Vermieter, die reaktive Verwaltung durch einen besseren operativen Rhythmus ersetzen wollen. Weniger allgemeine Ratschläge, mehr konkrete Hinweise dazu, was verfolgt, dokumentiert, geprüft und früher strukturiert werden sollte.",
    finalCta: {
      title: "Testen Sie OASIS vor dem öffentlichen Start",
      body:
        "Sichern Sie sich Frühzugang, testen Sie das Produkt mit echter Vermietungsarbeit und helfen Sie mit, wie OASIS für Vermieter weiterwächst.",
      primaryCta: { label: "Frühzugang sichern", href: siteConfig.appUrl },
      secondaryCta: { label: "Preise ansehen", href: "/pricing" },
    },
  },
};
