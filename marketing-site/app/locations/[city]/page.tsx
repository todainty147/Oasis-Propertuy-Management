import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocationPage } from "../../../components/marketing/location-page";
import { cityPages, cityPagesBySlug } from "../../../content/locations";
import { buildMetadata } from "../../../lib/metadata";

type Props = { params: Promise<{ city: string }> };

export async function generateStaticParams() {
  return cityPages.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const city = cityPagesBySlug[slug];
  if (!city) return {};
  return buildMetadata({
    title: city.seo.title,
    description: city.seo.description,
    canonical: city.seo.canonicalPath,
  });
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = cityPagesBySlug[slug];
  if (!city) notFound();
  return <LocationPage city={city} />;
}
