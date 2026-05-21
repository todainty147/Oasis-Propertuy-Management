import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BenefitGrid } from "../../../../components/marketing/benefit-grid";
import { FinalCta } from "../../../../components/marketing/final-cta";
import { PageHero } from "../../../../components/marketing/page-hero";
import { featuresPageContentByLocale } from "../../../../content/features-page";
import { siteConfig } from "../../../../content/site";
import { isLocale, locales, type Locale } from "../../../../lib/i18n";
import { buildMetadata } from "../../../../lib/metadata";

type Params = Promise<{
  locale: string;
  slug: string;
}>;

const localizedFeatureSlugs = [
  "command-center",
  "compliance",
  "maintenance-management",
  "portfolio-health",
  "rental-accounting",
  "security-audit",
  "tenant-management",
  "tenant-portal",
] as const;

const featureImageBySlug: Record<(typeof localizedFeatureSlugs)[number], { imageSrc: string; imageAlt: string }> = {
  "command-center": {
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "Tenaqo Command Center.",
  },
  compliance: {
    imageSrc: "/screenshots/compliance-suite.png",
    imageAlt: "Tenaqo compliance suite.",
  },
  "maintenance-management": {
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "Tenaqo maintenance workflow.",
  },
  "portfolio-health": {
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo portfolio health dashboard.",
  },
  "rental-accounting": {
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo rental finance and arrears overview.",
  },
  "security-audit": {
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "Tenaqo security audit view.",
  },
  "tenant-management": {
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "Tenaqo tenant management and portal.",
  },
  "tenant-portal": {
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "Tenaqo tenant portal.",
  },
};

type SlugCopy = {
  overviewEyebrow: string;
  overviewTitle: string;
  benefitTitle: string;
  benefitItems: Array<{ title: string; body: string }>;
  finalTitle: string;
  finalBody: string;
  primaryCta: string;
  secondaryCta: string;
};

const detailCopyByLocale: Record<
  Exclude<Locale, "en">,
  Record<(typeof localizedFeatureSlugs)[number], SlugCopy>
> = {
  pl: {
    "command-center": {
      overviewEyebrow: "Jak to porządkuje dzień",
      overviewTitle: "Jeden widok zamiast kilku źródeł do przejrzenia",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Szybszy start dnia pracy",
          body: "Pilna kolejka i briefing AI są gotowe od razu — nie tracisz czasu na odtwarzanie kontekstu z maili i tabel.",
        },
        {
          title: "Mniejsze ryzyko przeoczenia",
          body: "Konto samo podpowiada, co wymaga teraz uwagi, zanim sprawa urośnie do kosztownego problemu.",
        },
        {
          title: "Decyzje oparte na sygnałach z portfela",
          body: "AI-briefing jest zakorzeniony w realnych danych Twojego konta, nie w ogólnych wskazówkach.",
        },
        {
          title: "Więcej czasu na działanie, mniej na szukanie",
          body: "Zamiast przeglądać kilka widoków, zaczynasz od kolejki gotowej do pracy.",
        },
      ],
      finalTitle: "Sprawdź, jak Command Center działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    compliance: {
      overviewEyebrow: "Jak to porządkuje ryzyko",
      overviewTitle: "Ryzyko klauzul, czynszów i terminów widoczne wcześniej",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Luki compliance widoczne w ciągu tygodnia",
          body: "Klauzule oznaczone przez AI i scoring ryzyka czynszowego dają sygnał, zanim problem dotrze do prawnika.",
        },
        {
          title: "Terminy podatkowe pod kontrolą",
          body: "Śledzisz zobowiązania przez cały rok, a nie dopiero kiedy termin jest za rogiem.",
        },
        {
          title: "Compliance jako część tygodnia, nie akcja ratunkowa",
          body: "Dowody i historia są zbierane na bieżąco, więc nie ma sezonowego panikowania przed przeglądem.",
        },
        {
          title: "Gotowość eksportowa w każdej chwili",
          body: "Dokumentacja jest zawsze dostępna — kiedy potrzeba, nie tylko wtedy, gdy ktoś pyta.",
        },
      ],
      finalTitle: "Sprawdź, jak pakiet compliance działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "maintenance-management": {
      overviewEyebrow: "Jak to porządkuje naprawy",
      overviewTitle: "Od zgłoszenia do zakończenia w jednym obiegu operacyjnym",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Żadne zgłoszenie nie ginie",
          body: "Intake jest ustrukturyzowany: każda sprawa ma właściciela, status i następny krok — bez żonglowania mailami.",
        },
        {
          title: "Wykonawcy wiedzą, co mają robić",
          body: "Zlecenia z jasno przypisaną odpowiedzialnością eliminują niedopowiedzenia i powtarzające się pytania.",
        },
        {
          title: "Triage AI tam, gdzie naprawdę pomaga",
          body: "Rekomendacje AI pomagają ustalić kolejność i dobrać wykonawcę bez przeglądania historii od zera.",
        },
        {
          title: "Pełna historia przy każdej naprawie",
          body: "Dokumenty, zdjęcia i wyceny są przypięte do właściwego zlecenia — nie giną w mailach ani folderach.",
        },
      ],
      finalTitle: "Sprawdź, jak obsługa zgłoszeń działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "rental-accounting": {
      overviewEyebrow: "Jak to porządkuje finanse",
      overviewTitle: "Zaległości, stany i priorytety widoczne zanim trzeba gonić",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Czytelny obraz przychodów bez ręcznego scalania",
          body: "Stany opłacone, wymagane i przeterminowane są dostępne od razu — bez przebudowywania tabel i raportów.",
        },
        {
          title: "Lepsze decyzje o follow-upie",
          body: "Widzisz, gdzie zaległości są największe i gdzie działanie jest najpilniejsze, zanim presja rozleje się na cały portfel.",
        },
        {
          title: "Czynsz powiązany z kontekstem nieruchomości",
          body: "Status płatności jest blisko danych najemcy i kondycji nieruchomości — nie oderwany od reszty operacji.",
        },
        {
          title: "Przejrzyste zasady płatności dla najemcy",
          body: "Najemca widzi metody płatności, instrukcje i kontakt do wsparcia — bez ponownego wyjaśniania tych samych rzeczy.",
        },
      ],
      finalTitle: "Sprawdź, jak czynsz i finanse działają w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "portfolio-health": {
      overviewEyebrow: "Jak to porządkuje nadzór",
      overviewTitle: "Które nieruchomości wymagają uwagi teraz — nie za miesiąc",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Problemy widoczne wcześniej",
          body: "Scoring kondycji łączy zaległości, obciążenie zgłoszeniami, luki compliance i presję pustostanów w jeden sygnał.",
        },
        {
          title: "Rozumiesz, dlaczego wynik się zmienia",
          body: "Objaśnienie AI tłumaczy przyczynę — bez ręcznego przeglądania kilku ekranów naraz.",
        },
        {
          title: "Działania powiązane z konkretnym ryzykiem",
          body: "Zamiast ogólnego raportu widzisz, która praca tworzy presję i możesz ją zatrzymać.",
        },
        {
          title: "Lepszy podział uwagi w portfelu",
          body: "Wiesz, gdzie skupić czas teraz, zanim słabe adresy staną się kosztownym problemem.",
        },
      ],
      finalTitle: "Sprawdź, jak kondycja portfela działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "security-audit": {
      overviewEyebrow: "Jak to porządkuje odpowiedzialność",
      overviewTitle: "Działaj szybko i zostaw zaufany ślad działań",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Role oddzielone bez utraty kontekstu",
          body: "Każdy widzi to, do czego ma dostęp — bez ryzyka mieszania uprawnień właściciela, zarządcy i najemcy.",
        },
        {
          title: "Wrażliwe działania zawsze udokumentowane",
          body: "Kiedy decyzja wymaga dowodu, ślad audytowy jest gotowy — nie trzeba go rekonstruować po fakcie.",
        },
        {
          title: "Gotowość na audyt bez dodatkowej pracy",
          body: "Zdarzenia są rejestrowane na bieżąco, nie tylko wtedy, gdy ktoś o nie prosi.",
        },
        {
          title: "Kontrola rośnie razem z portfelem",
          body: "Uprawnienia i przeglądy skalują się bez ręcznego nadzoru przy każdym nowym użytkowniku.",
        },
      ],
      finalTitle: "Sprawdź, jak bezpieczeństwo i audyt działają w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "tenant-management": {
      overviewEyebrow: "Jak to porządkuje relacje z najemcami",
      overviewTitle: "Dane najemcy, dokumenty i portal w jednym operacyjnym widoku",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Mniej ręcznego szukania kontekstu",
          body: "Dane najemcy, historia czynszów, dokumenty i status zgłoszeń są w jednym miejscu — nie rozrzucone po folderach i mailach.",
        },
        {
          title: "Czytelniejsza komunikacja z najemcą",
          body: "Najemca ma jedno miejsce, gdzie sprawdza co jest do zrobienia, co jest dostępne i co czeka na jego działanie.",
        },
        {
          title: "Profesjonalny obieg dokumentów",
          body: "Szablony, prośby o dokumenty, przesłane dowody i pakiety umów działają w strukturze, która trzyma się razem podczas wzrostu portfela.",
        },
        {
          title: "Lepsza kontrola na co dzień",
          body: "Płatności, zgłoszenia, dokumenty i powiązania z nieruchomością — wszystko blisko, bez żonglowania różnymi narzędziami.",
        },
      ],
      finalTitle: "Sprawdź, jak zarządzanie najemcami działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
    "tenant-portal": {
      overviewEyebrow: "Jak to porządkuje relacje",
      overviewTitle: "Najemca ma kontekst, wykonawca ma kierunek, właściciel ma kontrolę",
      benefitTitle: "Co zyskuje właściciel",
      benefitItems: [
        {
          title: "Mniej pytań od najemcy",
          body: "Portal daje najemcy dostęp do dokumentów, statusu zgłoszeń i ważnych informacji — bez angażowania właściciela przy każdej sprawie.",
        },
        {
          title: "Wykonawcy w odpowiednim kontekście",
          body: "Wyceny, aktualizacje i dokumenty są powiązane z właściwym zleceniem — historii nie trzeba przekazywać od zera.",
        },
        {
          title: "Mniejsze ryzyko błędu komunikacyjnego",
          body: "Każda rola widzi swój zakres — bez ryzyka, że najemca zobaczy informacje przeznaczone tylko dla zarządcy.",
        },
        {
          title: "Powtarzający się follow-up znika",
          body: "Najemca sam sprawdza status, wykonawca ma jasne instrukcje — Ty zostajesz z decyzjami, nie z logistyką.",
        },
      ],
      finalTitle: "Sprawdź, jak portal najemcy działa w praktyce",
      finalBody: "Przejdź dalej, aby zobaczyć Tenaqo w akcji, albo wróć do pełnej listy funkcji.",
      primaryCta: "Zobacz Tenaqo",
      secondaryCta: "Wszystkie funkcje",
    },
  },
  de: {
    "command-center": {
      overviewEyebrow: "Wie es den Tag ordnet",
      overviewTitle: "Eine Ansicht statt mehrerer Quellen",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Schnellerer Arbeitsbeginn",
          body: "Dringende Listen und die operative Kurzanalyse liegen sofort bereit — kein Zusammensuchen aus Postfächern und Tabellen.",
        },
        {
          title: "Weniger übersehene Vorgänge",
          body: "Das System zeigt, was jetzt Aufmerksamkeit braucht — bevor eine Kleinigkeit zum Problem wird.",
        },
        {
          title: "Entscheidungen auf Basis echter Kontosignale",
          body: "Der AI-Überblick basiert auf realen Daten Ihres Portfolios, nicht auf allgemeinen Hinweisen.",
        },
        {
          title: "Mehr Zeit zum Handeln, weniger zum Suchen",
          body: "Sie starten aus einer arbeitsbereiten Warteschlange statt aus der Hektik des Posteingangs.",
        },
      ],
      finalTitle: "Sehen Sie, wie Command Center in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    compliance: {
      overviewEyebrow: "Wie es Compliance-Arbeit ordnet",
      overviewTitle: "Klausel-, Miet- und Fristenrisiken früher sichtbar",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Compliance-Lücken früher erkennen",
          body: "AI-markierte Klauseln und Mietrisikobewertung geben das Signal, bevor das Problem den Anwalt braucht.",
        },
        {
          title: "Steuerfristen im Griff",
          body: "Sie behalten Fristen das ganze Jahr im Blick — nicht erst wenn der Termin näher rückt.",
        },
        {
          title: "Compliance als Teil der laufenden Arbeit",
          body: "Nachweise und Verlauf werden laufend erfasst, kein saisonales Aufholen vor dem nächsten Audit.",
        },
        {
          title: "Exportbereitschaft jederzeit",
          body: "Dokumentation ist immer abrufbar — nicht nur wenn jemand danach fragt.",
        },
      ],
      finalTitle: "Sehen Sie, wie die Compliance-Suite in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "maintenance-management": {
      overviewEyebrow: "Wie es Reparaturarbeit ordnet",
      overviewTitle: "Vom ersten Hinweis bis zum Abschluss in einem Ablauf",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Kein Vorgang geht verloren",
          body: "Strukturierte Erfassung gibt jedem Auftrag einen Eigentümer, einen Status und einen klaren nächsten Schritt.",
        },
        {
          title: "Handwerker wissen, was zu tun ist",
          body: "Aufträge mit klarer Zuständigkeit vermeiden Rückfragen und doppelten Klärungsaufwand.",
        },
        {
          title: "AI-Triage dort, wo sie hilft",
          body: "Empfehlungen unterstützen Priorisierung und Handwerkerwahl, ohne dass Sie die Geschichte von vorn erklären müssen.",
        },
        {
          title: "Vollständige Historie bei jedem Auftrag",
          body: "Dokumente, Fotos und Angebote hängen am richtigen Vorgang — nicht verloren im Postfach.",
        },
      ],
      finalTitle: "Sehen Sie, wie Instandhaltung in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "rental-accounting": {
      overviewEyebrow: "Wie es Finanzen ordnet",
      overviewTitle: "Rückstände, Stände und Prioritäten sichtbar — bevor Nachfassen nötig wird",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Klares Einkommensbild ohne manuelles Zusammensetzen",
          body: "Bezahlte, fällige und überfällige Beträge sind direkt abrufbar — ohne Tabellen oder Berichte neu aufzubauen.",
        },
        {
          title: "Bessere Nachfassentscheidungen",
          body: "Sie sehen, wo Rückstände am größten sind und wo Handeln am dringendsten ist, bevor sich Druck auf das Portfolio ausweitet.",
        },
        {
          title: "Miete verknüpft mit Objektkontext",
          body: "Zahlungsstatus liegt nah an Mieterdaten und Immobilienzustand — nicht losgelöst vom Rest des Betriebs.",
        },
        {
          title: "Klare Zahlungsanleitung für Mieter",
          body: "Mieter sehen akzeptierte Zahlungsarten, Anweisungen und Supportkontakt — ohne ständige Wiederholung derselben Informationen.",
        },
      ],
      finalTitle: "Sehen Sie, wie Miete und Finanzen in der Praxis laufen",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "portfolio-health": {
      overviewEyebrow: "Wie es den Überblick ordnet",
      overviewTitle: "Welche Objekte jetzt Aufmerksamkeit brauchen — nicht in einem Monat",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Probleme früher sehen",
          body: "Die Gesundheitsbewertung verbindet Rückstände, Instandhaltungsdruck, Compliance-Lücken und Leerstand in einem Signal.",
        },
        {
          title: "Verstehen, warum sich der Wert verändert",
          body: "Die AI-Erklärung zeigt den Grund dahinter — ohne mehrere Screens manuell zu prüfen.",
        },
        {
          title: "Maßnahmen direkt am Risiko",
          body: "Statt eines allgemeinen Berichts sehen Sie, welche Arbeit konkret den Druck erzeugt und können früh eingreifen.",
        },
        {
          title: "Aufmerksamkeit im Portfolio gezielt verteilen",
          body: "Sie wissen, wo Zeit jetzt gut investiert ist, bevor schwache Adressen teuer werden.",
        },
      ],
      finalTitle: "Sehen Sie, wie Portfolio Health in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "security-audit": {
      overviewEyebrow: "Wie es Verantwortlichkeit ordnet",
      overviewTitle: "Schnell handeln und einen belastbaren Verlauf hinterlassen",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Rollen getrennt ohne Kontextverlust",
          body: "Jeder sieht, worauf er Zugriff hat — keine vermischten Berechtigungen zwischen Eigentümer, Verwalter und Mieter.",
        },
        {
          title: "Sensible Aktionen immer dokumentiert",
          body: "Wenn eine Entscheidung belegt werden muss, liegt der Audit-Trail bereit — ohne Rekonstruktionsaufwand.",
        },
        {
          title: "Auditfähigkeit ohne Zusatzarbeit",
          body: "Ereignisse werden laufend erfasst, nicht erst wenn jemand danach fragt.",
        },
        {
          title: "Kontrolle skaliert mit dem Portfolio",
          body: "Berechtigungen und Prüfansichten wachsen mit, ohne bei jedem neuen Nutzer manuell nachgebessert zu werden.",
        },
      ],
      finalTitle: "Sehen Sie, wie Sicherheit und Audit Trail in der Praxis laufen",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "tenant-management": {
      overviewEyebrow: "Wie es Mieterbeziehungen ordnet",
      overviewTitle: "Mieterdaten, Dokumente und Portal in einer operativen Ansicht",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Weniger manuelles Kontextsuchen",
          body: "Mieterdaten, Zahlungsverlauf, Dokumente und Wartungsstatus liegen an einem Ort — nicht verteilt in Ordnern und Postfächern.",
        },
        {
          title: "Klarere Kommunikation mit Mietern",
          body: "Mieter haben einen Ort, an dem sie sehen, was zu erledigen ist, was verfügbar ist und was noch ihre Aufmerksamkeit braucht.",
        },
        {
          title: "Professioneller Dokumentenablauf",
          body: "Vorlagen, Dokumentenanfragen, Nachweise und Vertragspakete funktionieren mit einer Struktur, die auch beim Portfoliowachstum trägt.",
        },
        {
          title: "Bessere Alltagskontrolle",
          body: "Zahlungen, Instandhaltung, Dokumente und Objektverknüpfungen — alles nah und handhabbar, ohne zwischen verschiedenen Werkzeugen zu wechseln.",
        },
      ],
      finalTitle: "Sehen Sie, wie Mieterverwaltung in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
    "tenant-portal": {
      overviewEyebrow: "Wie es Beziehungen ordnet",
      overviewTitle: "Mieter mit Kontext, Handwerker mit Richtung, Vermieter mit Kontrolle",
      benefitTitle: "Was Vermieter gewinnen",
      benefitItems: [
        {
          title: "Weniger Rückfragen vom Mieter",
          body: "Das Portal gibt Mietern Zugang zu Dokumenten, Wartungsstatus und Informationen — ohne Sie bei jeder Kleinigkeit einzubeziehen.",
        },
        {
          title: "Handwerker im richtigen Kontext",
          body: "Angebote, Updates und Dokumente hängen am richtigen Vorgang — die Geschichte muss nicht neu erklärt werden.",
        },
        {
          title: "Weniger Kommunikationsfehler",
          body: "Jede Rolle sieht ihren Bereich — ohne das Risiko, dass Mieter Verwaltungsdetails zu Gesicht bekommen.",
        },
        {
          title: "Wiederkehrendes Nachfassen entfällt",
          body: "Mieter prüfen selbst den Status, Handwerker haben klare Anweisungen — Sie behalten Entscheidungen, nicht Logistik.",
        },
      ],
      finalTitle: "Sehen Sie, wie das Mieterportal in der Praxis läuft",
      finalBody: "Sehen Sie Tenaqo in Aktion oder kehren Sie zur vollständigen Funktionsübersicht zurück.",
      primaryCta: "Tenaqo ansehen",
      secondaryCta: "Alle Funktionen",
    },
  },
};

function isLocalizedFeatureSlug(slug: string): slug is (typeof localizedFeatureSlugs)[number] {
  return localizedFeatureSlugs.includes(slug as (typeof localizedFeatureSlugs)[number]);
}

function getLocalizedFeatureSection(locale: Exclude<Locale, "en">, slug: string) {
  const content = featuresPageContentByLocale[locale];
  return content.outcomeSections.find((section) => section.href === `/features/${slug}`);
}

export function generateStaticParams() {
  return locales
    .filter((locale) => locale !== "en")
    .flatMap((locale) => localizedFeatureSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isLocale(locale) || locale === "en" || !isLocalizedFeatureSlug(slug)) {
    return {};
  }

  const section = getLocalizedFeatureSection(locale, slug);

  if (!section) {
    return {};
  }

  return buildMetadata({
    title: `${section.eyebrow} | Tenaqo`,
    description: section.why,
    canonical: `/${locale}/features/${slug}`,
    languages: {
      en: `/features/${slug}`,
      pl: `/pl/features/${slug}`,
      de: `/de/features/${slug}`,
      "x-default": `/features/${slug}`,
    },
  });
}

export default async function LocalizedFeatureDetailPage({ params }: { params: Params }) {
  const { locale, slug } = await params;

  if (!isLocale(locale) || locale === "en" || !isLocalizedFeatureSlug(slug)) {
    notFound();
  }

  const localizedLocale = locale as Exclude<Locale, "en">;
  const section = getLocalizedFeatureSection(localizedLocale, slug);

  if (!section) {
    notFound();
  }

  const copy = detailCopyByLocale[localizedLocale][slug];
  const image = featureImageBySlug[slug];

  return (
    <>
      <PageHero
        locale={localizedLocale}
        eyebrow={section.eyebrow}
        title={section.title}
        body={section.why}
        cta={{ label: section.cta, href: siteConfig.appUrl }}
        imageSrc={image.imageSrc}
        imageAlt={image.imageAlt}
      />

      <section className="section">
        <div className="container">
          <div className="card content-block">
            <span className="eyebrow">{copy.overviewEyebrow}</span>
            <h2>{copy.overviewTitle}</h2>
            <ul className="feature-list" style={{ marginTop: "1.5rem" }}>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <BenefitGrid title={copy.benefitTitle} items={copy.benefitItems} />

      <FinalCta
        locale={localizedLocale}
        title={copy.finalTitle}
        body={copy.finalBody}
        primaryCta={{ label: copy.primaryCta, href: siteConfig.appUrl }}
        secondaryCta={{ label: copy.secondaryCta, href: "/features" }}
      />
    </>
  );
}
