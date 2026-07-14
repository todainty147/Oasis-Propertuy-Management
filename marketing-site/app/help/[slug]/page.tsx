import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalCta } from "../../../components/marketing/final-cta";
import {
  helpArticles,
  helpArticleCta,
  getHelpArticle,
  getHelpArticlesByCategory,
  type HelpSection,
} from "../../../content/help";
import { siteConfig } from "../../../content/site";
import { buildMetadata } from "../../../lib/metadata";

type HelpArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return helpArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);

  if (!article) return {};

  return buildMetadata({
    title: `${article.title} | Tenaqo Help`,
    description: article.metaDescription,
    canonical: `${siteConfig.url}/help/${article.slug}`,
    languages: {
      en: `/help/${article.slug}`,
      "x-default": `/help/${article.slug}`,
    },
  });
}

function RenderSection({ section }: { section: HelpSection }) {
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

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);

  if (!article) notFound();

  const related = article.relatedSlugs
    ?.map((s) => getHelpArticle(s))
    .filter(Boolean) ?? [];

  const categoryArticles = getHelpArticlesByCategory(article.category).filter(
    (a) => a.slug !== article.slug,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    dateModified: article.lastUpdated,
    author: { "@type": "Organization", name: "Tenaqo", url: siteConfig.url },
    publisher: { "@type": "Organization", name: "Tenaqo", url: siteConfig.url },
    url: `${siteConfig.url}/help/${article.slug}`,
    isPartOf: { "@type": "WebSite", name: "Tenaqo Help", url: `${siteConfig.url}/help` },
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
            <Link href="/help" className="muted">Help Centre</Link>
            <span aria-hidden="true" style={{ margin: "0 0.5rem" }}>›</span>
            <span className="muted">{article.category}</span>
          </nav>

          <div className="blog-article__header">
            <span className="eyebrow">{article.category}</span>
            {(article.lastUpdated || article.readingTime) && (
              <p className="blog-article__meta">
                {article.lastUpdated && (
                  <time dateTime={article.lastUpdated}>
                    {new Date(article.lastUpdated).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                )}
                {article.lastUpdated && article.readingTime && (
                  <span className="blog-article__meta-sep" aria-hidden="true">·</span>
                )}
                {article.readingTime && <span>{article.readingTime}</span>}
              </p>
            )}
            <h1>{article.title}</h1>
            <p className="muted">{article.summary}</p>
          </div>

          <div className="card content-block blog-article__body">
            {article.sections.map((section, i) => (
              <RenderSection key={section.heading ?? `section-${i}`} section={section} />
            ))}

            {/* Related articles */}
            {related.length > 0 && (
              <div className="blog-article__soft-cta" style={{ background: "none", border: "none", padding: "1.5rem 0 0", boxShadow: "none" }}>
                <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Related articles</h2>
                <ul className="blog-article__list">
                  {related.map((rel) => rel && (
                    <li key={rel.slug}>
                      <Link href={`/help/${rel.slug}`}>{rel.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Category nav */}
          {categoryArticles.length > 0 && (
            <div style={{ marginTop: "2.5rem" }}>
              <p className="muted" style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                More in {article.category}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {categoryArticles.map((cat) => (
                  <Link key={cat.slug} href={`/help/${cat.slug}`} className="button button-secondary">
                    {cat.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "2rem" }}>
            <Link href="/help" className="muted">← {helpArticleCta.secondaryCta.label}</Link>
          </div>
        </div>
      </article>

      <FinalCta {...helpArticleCta} />
    </>
  );
}
