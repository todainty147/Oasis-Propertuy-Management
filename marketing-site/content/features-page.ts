import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

type FeaturesPageContent = {
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    cta: { label: string; href: string };
    imageSrc: string;
    imageAlt: string;
  };
  sectionTitle: string;
  sectionBody: string;
  outcomeSections: Array<{
    eyebrow: string;
    title: string;
    why: string;
    bullets: string[];
    href: string;
    cta: string;
  }>;
  finalCta: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
};

export const featuresPageContentByLocale: Record<Locale, FeaturesPageContent> = {
  en: {
    seo: {
      title: "Tenaqo Features | Rent, Maintenance, Documents, Compliance and AI",
      description:
        "Every workflow landlords check, chase, and worry about — connected. Rent Plans Engine, maintenance, documents, compliance, AI-assisted action queues, and audit trails in one platform.",
      canonicalPath: "/features",
    },
    hero: {
      eyebrow: "Features",
      title: "Every workflow landlords check, chase, and worry about — connected.",
      body:
        "Tenaqo connects rent, tenants, properties, maintenance, documents, compliance, AI, security, and finance into one landlord operating system for residential rentals. Not a generic module list — a platform built around the outcomes that keep a rental portfolio running.",
      cta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center showing urgent queues, overdue balances, and action items.",
    },
    sectionTitle: "Features grouped by the work they improve",
    sectionBody:
      "Each outcome below maps to real Tenaqo surfaces: Rent Plans Engine, Command Center, maintenance workflows, contractor lanes, documents, property health, compliance evidence, and review trails.",
    outcomeSections: [
      {
        eyebrow: "Rent and finance",
        title: "Rent that calculates properly and posts safely",
        why:
          "Rent is rarely just one number. Tenaqo handles base rent, utilities, deposits, proration, split rent, room rent, rent holidays, rent increases, expected charges, and short-term nightly charges — with calculation previews before anything is posted to Finance. Included on every plan.",
        bullets: [
          "Create rent plans with rules: base rent, utilities, service charges, deposits, adjustments.",
          "Choose from six proration methods — actual days, 30-day month, annual daily, no proration, manual override.",
          "Handle shared tenancies, HMOs, STR nightly, and rent increases with Advanced Rent Models.",
          "Preview every charge before posting. Approval required before the ledger is touched.",
          "See the next 3 billing periods projected and full plan history inline.",
          "Deposit warnings for UK Tenant Fees Act cap and Poland market guidelines — not legal advice.",
        ],
        href: "/features/rental-accounting",
        cta: "Explore rent and finance",
      },
      {
        eyebrow: "Command Center",
        title: "Start with the work that needs action now",
        why:
          "The operational day goes faster when the urgent queue, AI briefing, and next review targets already sit in one place.",
        bullets: [
          "See portfolio-wide pressure before it spreads.",
          "Review AI-assisted briefings grounded in current account signals.",
          "Start from action queues instead of rebuilding the day from inboxes.",
        ],
        href: "/features/command-center",
        cta: "Explore Command Center",
      },
      {
        eyebrow: "Maintenance and work orders",
        title: "Move repairs from first report to completed work",
        why:
          "Tenaqo keeps request intake, triage, work-order execution, and contractor follow-up inside one operational lane.",
        bullets: [
          "Capture maintenance requests in a structured workflow.",
          "Turn requests into work orders with visible ownership.",
          "Use AI triage and contractor recommendations where they genuinely help.",
        ],
        href: "/features/maintenance-management",
        cta: "Explore maintenance",
      },
      {
        eyebrow: "Property health",
        title: "See which properties are building pressure first",
        why:
          "Property health scoring makes arrears, maintenance strain, compliance drag, and vacancy pressure visible before they become expensive surprises.",
        bullets: [
          "Review weak addresses before the damage spreads.",
          "Understand why a score is moving with an AI explainer.",
          "Tie the signal back to the work creating the risk.",
        ],
        href: "/features/portfolio-health",
        cta: "Explore property health",
      },
      {
        eyebrow: "Tenant and contractor workflow",
        title: "Keep tenants informed and contractors aligned",
        why:
          "Tenants need clarity, contractors need direction, and landlords need control. Tenaqo keeps all three connected without collapsing their roles together.",
        bullets: [
          "Give tenants a clear portal for documents and maintenance visibility.",
          "Keep contractor updates and quotes tied to the right request.",
          "Reduce repeated follow-up without losing oversight.",
        ],
        href: "/features/tenant-portal",
        cta: "Explore tenant workflow",
      },
      {
        eyebrow: "Documents and agreements",
        title: "Keep records attached to the work they support",
        why:
          "Templates, requests, agreement packets, and uploaded evidence stay inside the same operational history instead of leaking into folders and threads.",
        bullets: [
          "Manage template libraries for recurring workflows.",
          "Request and review tenant or contractor evidence in one place.",
          "Track agreement review and signature readiness cleanly.",
        ],
        href: "/tenant-portal-software",
        cta: "See the document experience",
      },
      {
        eyebrow: "Compliance suite",
        title: "Surface Renters' Rights gaps, lease risk, rent pressure, and tax obligations before they get expensive",
        why:
          "Tenaqo brings Renters' Rights readiness, lease clause analysis, rent risk scoring, and tax deadline tracking into one landlord operating layer — so compliance evidence stays part of the working week, not a seasonal scramble.",
        bullets: [
          "Review AI-flagged lease clauses before they become legal or financial friction.",
          "Score rent risk across the portfolio and see which properties deserve attention first.",
          "Track tax obligations, Renters' Rights evidence, and stay export-ready throughout the year.",
        ],
        href: "/features/compliance",
        cta: "Explore the compliance suite",
      },
      {
        eyebrow: "Security and audit trail",
        title: "Move fast without losing accountability",
        why:
          "Permissions, audit events, and review surfaces help the team act quickly while keeping a trustworthy trail.",
        bullets: [
          "Keep roles separated without losing context.",
          "Review sensitive actions when decisions need proof.",
          "Stay audit-ready as the portfolio gets busier.",
        ],
        href: "/features/security-audit",
        cta: "Explore security review",
      },
    ],
    finalCta: {
      title: "Choose the part of the operation that needs control first",
      body:
        "Start with maintenance, property pressure, tenant workflow, or portfolio attention. Tenaqo keeps the work close enough to act before the week turns into catch-up.",
      primaryCta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
      secondaryCta: { label: "Compare plans", href: "/pricing" },
    },
  },
  pl: {
    seo: {
      title: "Funkcje Tenaqo | Czynsze, Naprawy, Dokumenty, Compliance i AI",
      description:
        "Każdy proces, którego doglądają, pilnują i o który martwią się właściciele — połączony. Silnik planów czynszowych, naprawy, dokumenty, compliance, wspierane przez AI kolejki zadań i ścieżki audytowe na jednej platformie.",
      canonicalPath: "/pl/features",
    },
    hero: {
      eyebrow: "Funkcje",
      title: "Każdy proces, którego doglądasz, pilnujesz i o który się martwisz — połączony w jednym miejscu.",
      body:
        "Tenaqo łączy czynsze, najemców, nieruchomości, naprawy, dokumenty, zgodność z przepisami, AI, bezpieczeństwo i finanse w jeden system operacyjny dla właścicieli mieszkań na wynajem. To nie jest kolejna lista luźnych modułów — to platforma zbudowana wokół rezultatów, które zapewniają płynne działanie portfela nieruchomości.",
      cta: { label: "Sprawdź, jak działa Tenaqo", href: siteConfig.appUrl },
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Centrum dowodzenia Tenaqo z pilnymi zadaniami, zaległościami w opłatach i listą działań.",
    },
    sectionTitle: "Funkcje pogrupowane według procesów, które usprawniają",
    sectionBody:
      "Każdy z poniższych rezultatów odpowiada rzeczywistym obszarom Tenaqo: silnikowi planów czynszowych, Command Center, obiegom napraw, ścieżkom wykonawców, dokumentom, kondycji nieruchomości, dowodom zgodności i ścieżkom audytowym.",
    outcomeSections: [
      {
        eyebrow: "Czynsze i finanse",
        title: "Czynsz, który nalicza się poprawnie i bezpiecznie się księguje",
        why:
          "Czynsz to rzadko tylko jedna kwota. Tenaqo obsługuje czynsz podstawowy, media, kaucje, proporcje, podział opłat, wynajem na pokoje, wakacje czynszowe, podwyżki, oczekiwane opłaty i stawki dobowe — z możliwością podglądu wyliczeń, zanim cokolwiek trafi do finansów. Dostępne w każdym planie.",
        bullets: [
          "Twórz plany czynszowe oparte na regułach: czynsz podstawowy, media, opłaty eksploatacyjne, kaucje, korekty.",
          "Wybieraj z sześciu metod proporcjonalnego rozliczania: rzeczywiste dni, miesiąc 30-dniowy, roczna dzienna, brak proporcji, ręczne nadpisanie.",
          "Zarządzaj współdzielonym najmem, wynajmem na pokoje, najmem krótkoterminowym (na noce) oraz podwyżkami czynszu dzięki zaawansowanym modelom czynszowym.",
          "Przeglądasz podgląd każdej opłaty przed zaksięgowaniem — wymagane zatwierdzenie przed dotknięciem rejestru.",
          "Widzisz projekcję trzech kolejnych okresów i pełną historię planu czynszowego.",
          "Ostrzeżenia o kaucjach zgodnie z wytycznymi rynku polskiego — bez porady prawnej.",
        ],
        href: "/features/rental-accounting",
        cta: "Poznaj czynsze i finanse",
      },
      {
        eyebrow: "Centrum dowodzenia",
        title: "Zacznij od spraw, które wymagają natychmiastowego działania",
        why:
          "Twój dzień pracy przebiega sprawniej, gdy lista pilnych zadań, odprawa z AI i cele do weryfikacji znajdują się w jednym miejscu.",
        bullets: [
          "Zauważ napięcia w całym portfelu, zanim staną się większym problemem.",
          "Przeglądaj odprawy wspomagane przez AI, oparte na bieżących sygnałach z Twojego konta.",
          "Zaczynaj pracę od list konkretnych zadań zamiast układać sobie dzień, skacząc po skrzynkach odbiorczych.",
          "Śledzisz status umów od szablonu przez wysłanie do gotowości podpisania.",
        ],
        href: "/features/command-center",
        cta: "Odkryj centrum dowodzenia",
      },
      {
        eyebrow: "Konserwacja i zlecenia robocze",
        title: "Przeprowadź naprawę od momentu pierwszego zgłoszenia aż do całkowitego zakończenia prac",
        why:
          "Tenaqo integruje przyjmowanie zgłoszeń, ich priorytetyzację, realizację zleceń roboczych oraz kontrolę podwykonawców w ramach jednej płynnej ścieżki operacyjnej.",
        bullets: [
          "Rejestruj zgłoszenia napraw w ramach uporządkowanego procesu.",
          "Przekształcaj zgłoszenia w zlecenia robocze z jasno określonym osobą odpowiedzialną.",
          "Korzystaj z klasyfikacji zgłoszeń wspieranej przez AI oraz z rekomendacji podwykonawców, gdzie rzeczywiście przynoszą one korzyść.",
        ],
        href: "/features/maintenance-management",
        cta: "Zbadaj obszar konserwacji i napraw",
      },
      {
        eyebrow: "Kondycja nieruchomości",
        title: "Zobacz jako pierwszy, które nieruchomości budują presję",
        why:
          "Ocena kondycji nieruchomości sprawia, że zaległości w opłatach, problemy z utrzymaniem, brak zgodności i presja pustostanów stają się widoczne, zanim przeobrażą się w kosztowne niespodzianki.",
        bullets: [
          "Sprawdzaj słabe lokalizacje zanim szkody nabiorą większego wymiaru.",
          "Dzięki podpowiedziom AI zrozumiesz, skąd wynikają zmiany oceny nieruchomości.",
          "Powiąż odebrany sygnał z wykonywaną pracą, z której wynika bezpośrednie ryzyko.",
        ],
        href: "/features/portfolio-health",
        cta: "Poznaj kondycję nieruchomości",
      },
      {
        eyebrow: "Przepływ pracy najemcy i wykonawcy",
        title: "Utrzymuj najemców poinformowanych i zgranych z wykonawcami",
        why:
          "Najemcy potrzebują jasności, wykonawcy ukierunkowania, a właściciele – kontroli. Tenaqo łączy te trzy role, nie pozwalając na ich zmieszanie ze sobą.",
        bullets: [
          "Udostępnij najemcom przejrzysty portal dla dostępu do dokumentów i monitorowania zgłoszeń konserwacyjnych.",
          "Zadbaj o to, aby aktualizacje od wykonawców i ich wyceny były zawsze przypisane do odpowiedniego zapytania.",
          "Zmniejsz ilość powtarzalnych follow-upów, nie tracąc przy tym pełnego nadzoru.",
        ],
        href: "/features/tenant-portal",
        cta: "Poznaj obieg procesów najemców",
      },
      {
        eyebrow: "Dokumenty i porozumienia",
        title: "Trzymaj dokumentację złączoną z zadaniami, które wspierają",
        why:
          "Szablony, prośby, paczki porozumień oraz przesyłane dowody, nie wyciekają do niezależnych folderów i strumieni informacji, ale podążają w ramach jednej historii operacyjnej.",
        bullets: [
          "Zarządzaj biblioteką szablonów do obsługi powtarzalnych procesów pracy.",
          "Żądaj i weryfikuj dowody na działania najemcy lub wykonawcy zgromadzone w jednym miejscu.",
          "Przejrzyście śledź proces recenzowania i przygotowywania umów do podpisania.",
        ],
        href: "/tenant-portal-software",
        cta: "Odkryj środowisko zarządzania dokumentami",
      },
      {
        eyebrow: "Pakiet compliance",
        title: "Wykrywaj luki w prawach najemców, ryzyko umów, presję czynszową i zobowiązania podatkowe, zanim staną się kosztowne",
        why:
          "Tenaqo łączy gotowość na prawa najemców, analizę klauzul w umowach, ocenę ryzyka czynszowego i śledzenie terminów podatkowych w jedną warstwę operacyjną dla właścicieli — dzięki czemu dowody zgodności są częścią codziennej pracy, a nie sezonowym chaosem.",
        bullets: [
          "Weryfikuj klauzule leasingowe oznaczone przez AI, zanim staną się problemami prawnymi lub finansowymi.",
          "Oceniaj ryzyko niewypłacalności na całym portfelu i odkrywaj, które nieruchomości wymagają w pierwszej kolejności uwagi.",
          "Śledź zobowiązania podatkowe, dowody przestrzegania praw najemców i utrzymuj gotowość do eksportu danych przez cały rok.",
        ],
        href: "/features/compliance",
        cta: "Poznaj pakiet compliance",
      },
      {
        eyebrow: "Bezpieczeństwo i audyt",
        title: "Działaj szybko bez utraty odpowiedzialności",
        why:
          "Uprawnienia, zdarzenia audytowe i ekrany przeglądu pomagają działać sprawnie przy zachowaniu zaufanego śladu działań.",
        bullets: [
          "Oddzielasz role bez utraty kontekstu pracy.",
          "Przeglądasz wrażliwe działania, gdy decyzja wymaga dowodu.",
          "Pozostajesz gotowy na audyt wraz ze wzrostem portfela.",
        ],
        href: "/features/security-audit",
        cta: "Poznaj przegląd bezpieczeństwa",
      },
    ],
    finalCta: {
      title: "Wybierz obszar operacyjny, który w pierwszej kolejności wymaga uporządkowania",
      body:
        "Zacznij od obsługi napraw, monitorowania stanu nieruchomości, procesów z najemcami lub obszarów wymagających uwagi. Tenaqo pozwala trzymać rękę na pulsie i reagować, zanim zaległości z całego tygodnia Cię przytłoczą.",
      primaryCta: { label: "Sprawdź, jak działa Tenaqo", href: siteConfig.appUrl },
      secondaryCta: { label: "Porównaj plany", href: "/pricing" },
    },
  },
  de: {
    seo: {
      title: "Tenaqo Funktionen | Operative Kontrolle für Vermieter",
      description:
        "Sehen Sie, wie Tenaqo Vermietern hilft, Instandhaltung, Dokumente, Zahlungsübersicht, Handwerkerabläufe, Immobilienzustand und Compliance-Risiken unter Kontrolle zu halten.",
      canonicalPath: "/de/features",
    },
    hero: {
      eyebrow: "Funktionen",
      title: "Der Nachweis, dass Tenaqo die echte Vermieterarbeit unterstützt",
      body:
        "Das ist keine weitere Liste generischer Software-Module. Tenaqo ist um die Ergebnisse gebaut, die ein Portfolio operativ ruhig halten: klare Zahlungsübersicht, laufende Instandhaltung, greifbare Dokumente und ein eindeutiger nächster Schritt.",
      cta: { label: "Tenaqo im Einsatz sehen", href: siteConfig.appUrl },
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center mit dringenden Warteschlangen, Rückständen und Aufgaben.",
    },
    sectionTitle: "Funktionen, geordnet nach der Arbeit, die sie verbessern",
    sectionBody:
      "Jeder Bereich unten entspricht konkreten Tenaqo-Oberflächen: Command Center, Instandhaltung, Mieterportal, Dokumente, Immobilienzustand und Audit-Trails.",
    outcomeSections: [
      {
        eyebrow: "Miete und Finanzen",
        title: "Miete, die richtig berechnet und sicher gebucht wird",
        why:
          "Miete ist selten nur eine Zahl. Tenaqo verarbeitet Grundmiete, Nebenkosten, Kautionen, anteilige Abrechnungen, Raummieten, Mietpausen, Mieterhöhungen und kurzfristige Nächtigungsgebühren — mit Berechnungsvorschau, bevor etwas in die Finanzen gebucht wird.",
        bullets: [
          "Sie erstellen Mietpläne mit Regeln: Grundmiete, Nebenkosten, Serviceentgelte, Kautionen, Anpassungen.",
          "Sie wählen aus sechs Methoden für anteilige Zeiträume.",
          "Sie verwalten Wohngemeinschaften, HMOs, Zimmervermietungen und Mieterhöhungen mit erweiterten Mietmodellen.",
          "Sie prüfen jede Buchung per Vorschau — Freigabe erforderlich, bevor das Konto berührt wird.",
          "Sie sehen die nächsten drei Abrechnungsperioden und die gesamte Planhistorie.",
          "Kautions-Warnhinweise nach deutschen und österreichischen Marktrichtwerten — keine Rechtsberatung.",
        ],
        href: "/features/rental-accounting",
        cta: "Miete und Finanzen ansehen",
      },
      {
        eyebrow: "Mieterverwaltung",
        title: "Vermieter und Mieter — ein klarer gemeinsamer Kontext",
        why:
          "Tenaqo hilft Vermietern, Mieterdaten, Objektverknüpfungen, Dokumentenabläufe und Mieterportal-Aktivität nah genug zu halten, um handeln zu können, ohne den Zusammenhang aus verschiedenen Werkzeugen neu zusammenzusetzen.",
        bullets: [
          "Zentrales Mieterprofil verknüpft mit dem richtigen Objekt, Dokumenten und Zahlungen.",
          "Das Mieterportal reduziert Rückfragen — ein klar strukturierter Ort für Dokumente und Wartungsstatus.",
          "Dokumentenanfragen, Nachweise und Vertragspakete werden an einem Ort verwaltet.",
          "Sie verfolgen den Vertragsstatus vom Entwurf bis zur Unterzeichnungsbereitschaft.",
        ],
        href: "/features/tenant-management",
        cta: "Mieterverwaltung ansehen",
      },
      {
        eyebrow: "Command Center",
        title: "Mit dem anfangen, was jetzt Handlungsbedarf hat",
        why:
          "Der operative Tag läuft sauberer, wenn dringende Listen, eine operative Kurzanalyse und die nächsten Prüfpunkte bereits an einem Ort vorliegen.",
        bullets: [
          "Sie sehen portfolioweiten Druck, bevor er eskaliert.",
          "Sie prüfen eine operative Kurzanalyse auf Basis echter Kontosignale.",
          "Sie starten aus Aufgabenlisten statt aus verteilten Postfächern.",
        ],
        href: "/features/command-center",
        cta: "Command Center ansehen",
      },
      {
        eyebrow: "Instandhaltung und Arbeitsaufträge",
        title: "Reparaturen vom ersten Hinweis bis zum Abschluss steuern",
        why:
          "Tenaqo hält Anfrageerfassung, Triage, Arbeitsausführung und Handwerker-Nachverfolgung in einem operativen Ablauf zusammen.",
        bullets: [
          "Sie erfassen Instandhaltungsanfragen strukturiert.",
          "Sie machen daraus Arbeitsaufträge mit klarer Zuständigkeit.",
          "Sie nutzen AI-Triage und Handwerkerempfehlungen dort, wo sie helfen.",
        ],
        href: "/features/maintenance-management",
        cta: "Instandhaltung ansehen",
      },
      {
        eyebrow: "Immobilienzustand",
        title: "Erkennen, welche Objekte zuerst Druck aufbauen",
        why:
          "Der Gesundheitswert macht Rückstände, Instandhaltungsdruck, Compliance-Lücken und Leerstandsrisiko sichtbar, bevor daraus teure Probleme werden.",
        bullets: [
          "Sie sehen zuerst die schwächsten Adressen.",
          "Sie verstehen mit AI-Hilfe, warum sich der Wert verändert.",
          "Sie verbinden das Signal direkt mit der Arbeit hinter dem Risiko.",
        ],
        href: "/features/portfolio-health",
        cta: "Portfolio Health ansehen",
      },
      {
        eyebrow: "Mieter und Handwerker",
        title: "Mieter klar führen und Handwerker sauber ausrichten",
        why:
          "Mieter brauchen Transparenz, Handwerker klare Richtung und Vermieter volle Kontrolle. Tenaqo hält diese Rollen verbunden, ohne sie zu vermischen.",
        bullets: [
          "Sie geben Mietern ein klares Portal für Dokumente und Wartungsstatus.",
          "Sie binden Angebote und Updates an den richtigen Vorgang.",
          "Sie reduzieren Nachfragen, ohne den Überblick zu verlieren.",
        ],
        href: "/features/tenant-portal",
        cta: "Mieterportal ansehen",
      },
      {
        eyebrow: "Dokumente und Verträge",
        title: "Unterlagen dort halten, wo sie operativ gebraucht werden",
        why:
          "Vorlagen, Dokumentenanfragen, Vertragspakete und Uploads bleiben Teil derselben operativen Geschichte statt in Ordnern zu zerfallen.",
        bullets: [
          "Sie verwalten Vorlagen für wiederkehrende Abläufe.",
          "Sie fordern Nachweise an und prüfen sie an einem Ort.",
          "Sie behalten Vertragsprüfung und Signaturbereitschaft sauber im Blick.",
        ],
        href: "/tenant-portal-software",
        cta: "Dokumentenablauf ansehen",
      },
      {
        eyebrow: "Compliance-Suite",
        title: "Vertragsrisiken, Mietexposition und Steuerfristen erkennen, bevor sie teuer werden",
        why:
          "Tenaqo bündelt Mietvertragsanalyse, portfolioweite Mietrisikobewertung und Steuerfristen-Tracking in einer operativen Schicht — damit Compliance zum Alltag gehört und nicht zur saisonalen Hektik wird.",
        bullets: [
          "Sie prüfen AI-markierte Vertragsklauseln, bevor sie zu rechtlichen oder finanziellen Problemen werden.",
          "Sie bewerten das Mietrisiko portfolioweit und sehen, welche Objekte zuerst Aufmerksamkeit brauchen.",
          "Sie behalten Steuerfristen im Blick und bleiben das ganze Jahr exportbereit.",
        ],
        href: "/features/compliance",
        cta: "Compliance-Suite ansehen",
      },
      {
        eyebrow: "Sicherheit und Audit Trail",
        title: "Schnell handeln und trotzdem nachvollziehbar bleiben",
        why:
          "Berechtigungen, Audit-Ereignisse und Prüfansichten helfen Teams, zügig zu arbeiten und trotzdem einen belastbaren Verlauf zu behalten.",
        bullets: [
          "Sie trennen Rollen ohne Kontextverlust.",
          "Sie prüfen sensible Aktionen, wenn Entscheidungen belegt werden müssen.",
          "Sie bleiben auditfähig, wenn das Portfolio anspruchsvoller wird.",
        ],
        href: "/features/security-audit",
        cta: "Sicherheitsprüfung ansehen",
      },
    ],
    finalCta: {
      title: "Wählen Sie zuerst den Bereich, der mehr Kontrolle braucht",
      body:
        "Starten Sie mit Instandhaltung, Immobilienzustand, Mieterportal oder Aufgabenpriorisierung. Tenaqo hält die Arbeit nah genug, damit die Woche nicht im Nacharbeiten endet.",
      primaryCta: { label: "Tenaqo im Einsatz sehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Preise ansehen", href: "/pricing" },
    },
  },
};
