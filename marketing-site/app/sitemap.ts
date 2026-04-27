import type { MetadataRoute } from "next";

import { blogArticles } from "../content/blog";
import { siteConfig } from "../content/site";

const routes = [
  "",
  "/pl",
  "/de",
  "/pricing",
  "/features",
  "/features/tenant-management",
  "/features/maintenance-management",
  "/features/rental-accounting",
  "/compare/oasis-vs-landlordstudio",
  "/compare/oasis-vs-buildium",
  "/compare/oasis-vs-tenantcloud",
  "/blog",
  ...blogArticles.map((article) => `/blog/${article.slug}`),
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
