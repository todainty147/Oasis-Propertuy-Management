import type { MetadataRoute } from "next";

import { blogArticles } from "../content/blog";
import { cityPages } from "../content/locations";
import { siteConfig } from "../content/site";

const routes = [
  "",
  "/pl",
  "/de",
  "/pricing",
  "/pl/pricing",
  "/de/pricing",
  "/features",
  "/pl/features",
  "/de/features",
  "/tenant-portal-software",
  "/pl/tenant-portal-software",
  "/de/tenant-portal-software",
  "/impressum",
  "/pl/impressum",
  "/de/impressum",
  "/blog",
  "/pl/blog",
  "/de/blog",
  "/compare/oasis-vs-landlordstudio",
  "/pl/compare/oasis-vs-landlordstudio",
  "/de/compare/oasis-vs-landlordstudio",
  "/features/tenant-management",
  "/features/maintenance-management",
  "/features/rental-accounting",
  "/compare/oasis-vs-buildium",
  "/compare/oasis-vs-tenantcloud",
  ...blogArticles.map((article) => `/blog/${article.slug}`),
  "/locations",
  ...cityPages.map((c) => `/locations/${c.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/pricing" || route === "/features" ? 0.9 : 0.8,
  }));
}
