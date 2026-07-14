import type { Metadata } from "next";
import Link from "next/link";

import {
  changelogEntries,
  changelogHubCopy,
  changelogCategoryLabels,
} from "../../content/changelog";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: changelogHubCopy.seo.title,
  description: changelogHubCopy.seo.description,
  canonical: changelogHubCopy.seo.canonicalPath,
  languages: {
    en: "/changelog",
    "x-default": "/changelog",
  },
});

export default function ChangelogPage() {
  // Entries are stored newest-first; render in that order.
  const entries = changelogEntries;

  return (
    <section className="section">
      <div className="container">
        <div className="blog-article__header" style={{ marginBottom: "3rem" }}>
          <span className="eyebrow">{changelogHubCopy.hero.eyebrow}</span>
          <h1>{changelogHubCopy.hero.title}</h1>
          <p className="muted" style={{ maxWidth: 560 }}>{changelogHubCopy.hero.body}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {entries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/changelog/${entry.slug}`}
              className="card changelog-entry-card"
              style={{ display: "block", textDecoration: "none" }}
            >
              <div className="changelog-entry-card__meta">
                <span className={`changelog-badge changelog-badge--${entry.category}`}>
                  {changelogCategoryLabels[entry.category]}
                </span>
                <time
                  dateTime={entry.publishedAt}
                  className="muted changelog-entry-card__date"
                >
                  {new Date(entry.publishedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
              <h2 className="changelog-entry-card__title">{entry.title}</h2>
              <p className="muted changelog-entry-card__summary">{entry.summary}</p>
              <span className="help-hub__read-more">{changelogHubCopy.readMoreLabel} →</span>
            </Link>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="card blog-article__soft-cta" style={{ marginTop: "4rem" }}>
          <h2>{changelogHubCopy.contactCta.heading}</h2>
          <p className="muted">{changelogHubCopy.contactCta.body}</p>
          <div className="button-row">
            <Link href={changelogHubCopy.contactCta.primaryCta.href} className="button button-primary">
              {changelogHubCopy.contactCta.primaryCta.label}
            </Link>
            <Link href={changelogHubCopy.contactCta.secondaryCta.href} className="button button-secondary">
              {changelogHubCopy.contactCta.secondaryCta.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
