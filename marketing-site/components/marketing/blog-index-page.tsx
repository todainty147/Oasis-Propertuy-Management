import Link from "next/link";

import type { Locale } from "../../lib/i18n";
import { getLocalizedMarketingHref } from "../../lib/i18n";
import { blogArticles } from "../../content/blog";
import { blogIndexContentByLocale } from "../../content/blog-index";
import { FinalCta } from "./final-cta";
import { PageHero } from "./page-hero";

export function MarketingBlogIndexPage({ locale }: { locale: Locale }) {
  const content = blogIndexContentByLocale[locale];

  return (
    <>
      <PageHero locale={locale} {...content.hero} />
      <section className="section">
        <div className="container">
          <div className="section-title">
            <h2>{content.launchListTitle}</h2>
            <p className="muted">{content.launchListBody}</p>
          </div>
          <div className="grid grid-2">
            {blogArticles.map((article) => (
              <article key={article.title} className="card feature-card">
                <span className="eyebrow">{article.category}</span>
                <h3>{article.title}</h3>
                <p className="muted">{article.summary}</p>
                <div className="button-row">
                  <Link href={`/blog/${article.slug}`} className="button button-secondary">
                    {content.readMoreLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-tight-top">
        <div className="container">
          <div className="card content-block">
            <h2>{content.publishingTitle}</h2>
            <p className="muted">{content.publishingBody}</p>
          </div>
        </div>
      </section>
      <FinalCta
        locale={locale}
        {...{
          ...content.finalCta,
          secondaryCta: {
            ...content.finalCta.secondaryCta,
            href: getLocalizedMarketingHref(locale, content.finalCta.secondaryCta.href),
          },
        }}
      />
    </>
  );
}
