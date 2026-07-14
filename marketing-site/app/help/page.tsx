import type { Metadata } from "next";
import Link from "next/link";

import { helpHubCopy, helpArticles, getHelpArticlesByCategory, type HelpCategory } from "../../content/help";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: helpHubCopy.seo.title,
  description: helpHubCopy.seo.description,
  canonical: helpHubCopy.seo.canonicalPath,
  languages: {
    en: "/help",
    "x-default": "/help",
  },
});

export default function HelpPage() {
  return (
    <section className="section">
      <div className="container">
          <div className="blog-article__header" style={{ marginBottom: "3rem" }}>
            <span className="eyebrow">{helpHubCopy.hero.eyebrow}</span>
            <h1>{helpHubCopy.hero.title}</h1>
            <p className="muted" style={{ maxWidth: 560 }}>{helpHubCopy.hero.body}</p>
          </div>

          {/* Polish language note */}
          <div className="blog-article__note" style={{ marginBottom: "3rem" }} role="note">
            <p>{helpHubCopy.polishNote}</p>
          </div>

          {/* Category sections */}
          {helpHubCopy.categories.map((category) => {
            const articles = getHelpArticlesByCategory(category.name as HelpCategory);
            return (
              <div key={category.name} style={{ marginBottom: "3rem" }}>
                <h2 style={{ marginBottom: "0.5rem" }}>{category.name}</h2>
                <p className="muted" style={{ marginBottom: "1.5rem" }}>{category.description}</p>
                <div className="help-hub__articles">
                  {articles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/help/${article.slug}`}
                      className="card help-hub__article-card"
                    >
                      <h3 className="help-hub__article-title">{article.title}</h3>
                      <p className="muted help-hub__article-summary">{article.summary}</p>
                      <span className="help-hub__read-more">{helpHubCopy.readMoreLabel} →</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Contact CTA */}
          <div className="card blog-article__soft-cta" style={{ marginTop: "4rem" }}>
            <h2>{helpHubCopy.contactCta.heading}</h2>
            <p className="muted">{helpHubCopy.contactCta.body}</p>
            <div className="button-row">
              <Link href={helpHubCopy.contactCta.primaryCta.href} className="button button-primary">
                {helpHubCopy.contactCta.primaryCta.label}
              </Link>
              <Link href={helpHubCopy.contactCta.secondaryCta.href} className="button button-secondary">
                {helpHubCopy.contactCta.secondaryCta.label}
              </Link>
            </div>
          </div>
      </div>
    </section>
  );
}
