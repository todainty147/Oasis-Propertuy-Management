import Link from "next/link";

import { siteConfig } from "../../content/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <div className="logo">OASIS Rental</div>
          <p className="muted" style={{ marginTop: "0.75rem", maxWidth: 420 }}>
            Built with real landlord workflows in mind for operators who want
            cleaner follow-up, stronger maintenance visibility, and better portfolio control.
          </p>
        </div>
        <div className="footer-links">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/compare/oasis-vs-landlordstudio">Compare</Link>
          <Link href="/blog">Blog</Link>
          <Link href={siteConfig.appUrl}>Early access</Link>
        </div>
      </div>
    </footer>
  );
}
