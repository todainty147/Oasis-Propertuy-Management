import type { Metadata } from "next";

import { LegalNoticePage } from "../../components/marketing/legal-notice-page";
import { legalNoticeContentByLocale } from "../../content/legal";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: legalNoticeContentByLocale.en.seo.title,
  description: legalNoticeContentByLocale.en.seo.description,
  canonical: legalNoticeContentByLocale.en.seo.canonicalPath,
  languages: {
    en: "/impressum",
    pl: "/pl/impressum",
    de: "/de/impressum",
    "x-default": "/impressum",
  },
});

export default function ImpressumPage() {
  return <LegalNoticePage locale="en" />;
}
