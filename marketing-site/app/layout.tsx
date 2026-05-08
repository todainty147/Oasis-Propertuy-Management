import type { ReactNode } from "react";

import "./globals.css";

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
