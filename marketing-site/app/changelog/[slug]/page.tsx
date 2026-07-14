import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalCta } from "../../../components/marketing/final-cta";
import {
  changelogEntries,
  changelogArticleCta,
  changelogCategoryLabels,
  changelogHubCopy,
  getChangelogEntry,
  type ChangelogSection,
} from "../../../content/changelog";
import { getHelpArticle } from "../../../content/help";
import { siteConfig } from "../../../content/site";
import { buildMetadata } from "../../../lib/metadata";

type ChangelogEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return changelogEntries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: ChangelogEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getChangelogEntry(slug);

  if (!entry) return {};

  return buildMetadata({
    title: `${entry.title} | Tenaqo Changelog`,
    description: entry.summary,
    canonical: `${siteConfig.url}/changelog/${entry.slug}`,
    languages: {
      en: `/changelog/${entry.slug}`,
      "x-default": `/changelog/${entry.slug}`,
    },
  });
}

function RenderSection({ section }: { section: ChangelogSection }) {
  const HeadingTag = section.headingLevel === "h3" ? "h3" : "h2";

  return (
    <section>
      {section.heading ? <HeadingTag>{section.heading}</HeadingTag> : null}

      {section.paragraphs?.map((p) => (
        <p key={p} className="muted">{p}</p>
      ))}

      {section.items && section.items.length > 0 && (
        <ul className="blog-article__list">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {section.boldPairs?.map((pair) => (
        <p key={pair.term} className="blog-article__bold-pair muted">
          <strong>{pair.term}</strong>{" "}{pair.definition}
        </p>
      ))}

      {section.note && (
        <div className="blog-article__note">
          {section.note.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {section.paragraphs2?.map((p) => (
        <p key={p} className="muted">{p}</p>
      ))}

      {section.sectionLinks && section.sectionLinks.length > 0 && (
        <div className="blog-article__section-links">
          {section.sectionLinks.map((link) => (
            <Link key={link.href} href={link.href} className="blog-article__section-link">
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ChangelogEntryPage({ params }: ChangelogEntryPageProps) {
  const { slug } = await params;
  const entry = getChangelogEntry(slug);

  if (!entry) notFound();

  const relatedHelpArticles = entry.relatedHelpSlugs
    ?.map((s) => getHelpArticle(s))
    .filter(Boolean) ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.summary,
    datePublished: entry.publishedAt,
    dateModified: entry.publishedAt,
    author: { "@type": "Organization", name: "Tenaqo", url: siteConfig.url },
    publisher: { "@type": "Organization", name: "Tenaqo", url: siteConfig.url },
    url: `${siteConfig.url}/changelog/${entry.slug}`,
    isPartOf: { "@type": "WebSite", name: "Tenaqo Changelog", url: `${siteConfig.url}/changelog` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="section blog-article">
        <div className="container">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ marginBottom: "1.5rem", fontSize: "0.875rem" }}>
            <Link href="/changelog" className="muted">Changelog</Link>
            <span aria-hidden="true" style={{ margin: "0 0.5rem" }}>›</span>
            <span className="muted">{changelogCategoryLabels[entry.category]}</span>
          </nav>

          <div className="blog-article__header">
            <div className="changelog-entry-card__meta" style={{ marginBottom: "0.75rem" }}>
              <span className={`changelog-badge changelog-badge--${entry.category}`}>
                {changelogCategoryLabels[entry.category]}
              </span>
              <time dateTime={entry.publishedAt} className="muted" style={{ marginLeft: "0.75rem" }}>
                {new Date(entry.publishedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>
            <h1>{entry.title}</h1>
            <p className="muted">{entry.summary}</p>
          </div>

          <div className="card content-block blog-article__body">
            {entry.body.map((section, i) => (
              <RenderSection key={section.heading ?? `section-${i}`} section={section} />
            ))}

            {/* "What this means for you" callout */}
            {entry.customerImpact && (
              <div className="blog-article__note" role="note" aria-label="What this means for you">
                <p><strong>What this means for you</strong></p>
                <p>{entry.customerImpact}</p>
              </div>
            )}

            {/* Related Help Centre articles */}
            {relatedHelpArticles.length > 0 && (
              <div className="blog-article__soft-cta" style={{ background: "none", border: "none", padding: "1.5rem 0 0", boxShadow: "none" }}>
                <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Related Help Centre articles</h2>
                <ul className="blog-article__list">
                  {relatedHelpArticles.map((art) => art && (
                    <li key={art.slug}>
                      <Link href={`/help/${art.slug}`}>{art.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div style={{ marginTop: "2rem" }}>
            <Link href="/changelog" className="muted">← {changelogHubCopy.backToChangelog}</Link>
          </div>
        </div>
      </article>

      <FinalCta {...changelogArticleCta} />
    </>
  );
}
