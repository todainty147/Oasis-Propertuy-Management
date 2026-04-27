import type { Locale } from "../lib/i18n";

const isProduction = process.env.NODE_ENV === "production";

export const siteConfig = {
  name: "OASIS Rental",
  url: "https://marketing.oasisrentalmgt.app",
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ||
    (isProduction ? "https://oasisrentalmgt.app" : "http://localhost:5173"),
  nav: [
    { key: "features", href: "/features" },
    { key: "tenantPortal", href: "/features/tenant-portal" },
    { key: "pricing", href: "/pricing" },
    { key: "compare", href: "/compare/oasis-vs-landlordstudio" },
    { key: "blog", href: "/blog" },
  ] as const,
};

type SiteCopy = {
  nav: Record<(typeof siteConfig.nav)[number]["key"], string>;
  navHrefOverrides?: Partial<Record<(typeof siteConfig.nav)[number]["key"], string>>;
  signIn: string;
  primaryCta: string;
  footerBlurb: string;
  footerLinks: {
    features: string;
    pricing: string;
    compare: string;
    blog: string;
    earlyAccess: string;
  };
  languageSwitcherLabel: string;
  languageNames: Record<Locale, string>;
};

export const siteCopyByLocale: Record<Locale, SiteCopy> = {
  en: {
    nav: {
      features: "Features",
      tenantPortal: "Tenant Portal",
      pricing: "Pricing",
      compare: "Compare",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Sign in",
    primaryCta: "See how OASIS works",
    footerBlurb:
      "OASIS helps landlords run property operations with clearer follow-up, stronger maintenance control, and a tighter audit trail.",
    footerLinks: {
      features: "Features",
      pricing: "Pricing",
      compare: "Compare",
      blog: "Blog",
      earlyAccess: "Early access",
    },
    languageSwitcherLabel: "Language",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
  pl: {
    nav: {
      features: "Funkcje",
      tenantPortal: "Portal najemcy",
      pricing: "Cennik",
      compare: "Porównanie",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Zaloguj się",
    primaryCta: "Zobacz OASIS",
    footerBlurb:
      "OASIS pomaga właścicielom mieszkań prowadzić najem z pełną kontrolą nad zgłoszeniami, płatnościami, dokumentami i historią działań.",
    footerLinks: {
      features: "Funkcje",
      pricing: "Cennik",
      compare: "Porównanie",
      blog: "Blog",
      earlyAccess: "Wczesny dostęp",
    },
    languageSwitcherLabel: "Język",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
  de: {
    nav: {
      features: "Funktionen",
      tenantPortal: "Mieterportal",
      pricing: "Preise",
      compare: "Vergleich",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Anmelden",
    primaryCta: "OASIS ansehen",
    footerBlurb:
      "OASIS hilft Vermietern, Immobilienabläufe mit klareren Zuständigkeiten, besserer Instandhaltungssteuerung und sauberer Nachverfolgung zu führen.",
    footerLinks: {
      features: "Funktionen",
      pricing: "Preise",
      compare: "Vergleich",
      blog: "Blog",
      earlyAccess: "Frühzugang",
    },
    languageSwitcherLabel: "Sprache",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
};
