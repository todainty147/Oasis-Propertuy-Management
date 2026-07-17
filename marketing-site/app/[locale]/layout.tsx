import type { Metadata } from "next";
import type { ReactNode } from "react";

import { isLocale } from "../../lib/i18n";

type Params = Promise<{ locale: string }>;

// German marketing routes were withdrawn in WP1. The German locale pages
// continue to render (providing redirect-compatible URLs for old links) but
// must not appear in search indexes. This layout-level metadata applies to
// every /de/* page that does not explicitly override robots.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;

  if (isLocale(locale) && locale === "de") {
    return { robots: { index: false, follow: true } };
  }

  return {};
}

export default function LocaleLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
