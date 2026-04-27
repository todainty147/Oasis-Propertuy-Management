import type { Metadata } from "next";

import { MarketingHomePage } from "../components/marketing/home-page";
import { homepageContentByLocale } from "../content/homepage";
import { buildMetadata } from "../lib/metadata";

const englishHomepage = homepageContentByLocale.en;

export const metadata: Metadata = buildMetadata({
  title: englishHomepage.seo.title,
  description: englishHomepage.seo.description,
  canonical: englishHomepage.seo.canonicalPath,
  languages: {
    en: "/",
    pl: "/pl",
    de: "/de",
    "x-default": "/",
  },
});

export default function HomePage() {
  return <MarketingHomePage locale="en" />;
}
