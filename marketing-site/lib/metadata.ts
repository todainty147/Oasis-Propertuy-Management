import type { Metadata } from "next";

import { siteConfig } from "../content/site";

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
      languages,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: "OASIS Rental",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
