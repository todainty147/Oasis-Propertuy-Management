import type { Metadata } from "next";

import { siteConfig } from "../content/site";

// German locale is withdrawn: strip "de" alternates site-wide so no hreflang points to /de pages.
function stripGermanAlternates(
  languages: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!languages) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { de: _de, ...rest } = languages;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function buildMetadata({
  title,
  description,
  canonical,
  languages,
}: {
  title: string;
  description: string;
  canonical: string;
  languages?: Record<string, string>;
}): Metadata {
  return {
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    alternates: {
      canonical,
      languages: stripGermanAlternates(languages),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: "Tenaqo",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
