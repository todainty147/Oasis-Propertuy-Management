import type { Metadata } from "next";

export function buildMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
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
