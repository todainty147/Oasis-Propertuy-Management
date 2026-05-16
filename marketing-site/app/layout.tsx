import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  icons: {
    shortcut: "/brand/tenaqo/favicon.ico",
    icon: [
      { url: "/brand/tenaqo/favicon.ico", type: "image/x-icon" },
      { url: "/brand/tenaqo/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/tenaqo/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/tenaqo/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/brand/tenaqo/app-icon-512.png", sizes: "512x512", type: "image/png" },
  },
};

import { SiteFooter } from "../components/marketing/site-footer";
import { SiteHeader } from "../components/marketing/site-header";
import { SoftwareSchema } from "../components/marketing/software-schema";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SoftwareSchema />
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
