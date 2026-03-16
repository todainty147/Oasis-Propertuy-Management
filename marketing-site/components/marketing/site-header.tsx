import Link from "next/link";

import { siteConfig } from "../../content/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="logo">
          {siteConfig.name}
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <Link href={siteConfig.appUrl}>Sign In</Link>
          <Link href={siteConfig.appUrl} className="button button-primary">
            Start Free
          </Link>
        </nav>
      </div>
    </header>
  );
}
