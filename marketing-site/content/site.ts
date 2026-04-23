const isProduction = process.env.NODE_ENV === "production";

export const siteConfig = {
  name: "OASIS Rental",
  url: "https://oasisrental.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://oasisrentalmgt.app" : "http://localhost:5173"),
  nav: [
    { label: "Features", href: "/features" },
    { label: "Tenant Portal", href: "/features/tenant-portal" },
    { label: "Pricing", href: "/pricing" },
    { label: "Compare", href: "/compare/oasis-vs-landlordstudio" },
    { label: "Blog", href: "/blog" },
  ],
};
