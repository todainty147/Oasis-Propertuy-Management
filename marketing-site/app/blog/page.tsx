import type { Metadata } from "next";

import { MarketingBlogIndexPage } from "../../components/marketing/blog-index-page";
import { blogIndexContentByLocale } from "../../content/blog-index";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: blogIndexContentByLocale.en.seo.title,
  description: blogIndexContentByLocale.en.seo.description,
  canonical: blogIndexContentByLocale.en.seo.canonicalPath,
  languages: {
    en: "/blog",
    pl: "/pl/blog",
    de: "/de/blog",
    "x-default": "/blog",
  },
});

export default function BlogPage() {
  return <MarketingBlogIndexPage locale="en" />;
}
