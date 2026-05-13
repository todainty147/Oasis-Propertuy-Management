import type { Metadata } from "next";
import Link from "next/link";

import { notFound } from "next/navigation";

import { FinalCta } from "../../../components/marketing/final-cta";
import { blogArticles, blogCta, getBlogArticle, type BlogSection } from "../../../content/blog";
import { siteConfig } from "../../../content/site";
import { buildMetadata } from "../../../lib/metadata";

type BlogArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blogArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getBlogArticle(slug);

  if (!article) return {};

  // Use pageTitle override when present, otherwise default template
  const title = article.pageTitle ?? `${article.title} | OASIS Rental Blog`;

  return buildMetadata({
    title,
    description: article.metaDescription,
    canonical: `${siteConfig.url}/blog/${article.slug}`,
  });
}

function RenderSection({ section }: { section: BlogSection }) {
  return (
    <section>
      {/* h2 only rendered when heading is non-empty */}
      {section.heading ? <h2>{section.heading}</h2> : null}

      {/* Leading paragraphs */}
      {section.paragraphs?.map((p) => (
        <p key={p} className="muted">{p}</p>
      ))}

      {/* Bullet list */}
      {section.items && section.items.length > 0 && (
        <ul className="blog-article__list">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {/* Bold key: value pairs */}
      {section.boldPairs?.map((pair) => (
        <p key={pair.term} className="blog-article__bold-pair muted">
          <strong>{pair.term}</strong>{" "}{pair.definition}
        </p>
      ))}

      {/* Styled example / flow block */}
      {section.note && (
        <div className="blog-article__note">
          {section.note.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {/* Trailing paragraphs (after list / pairs / note) */}
      {section.paragraphs2?.map((p) => (
        <p key={p} className="muted">{p}</p>
      ))}
    </section>
  );
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const article = getBlogArticle(slug);

  if (!article) notFound();

  const cta = article.ctaOverride;

  return (
    <>
      <article className="section blog-article">
        <div className="container">
          <div className="blog-article__header">
            <span className="eyebrow">{article.category}</span>
            {(article.date || article.readingTime) && (
              <p className="blog-article__meta">
                {article.date && (
                  <time dateTime={article.date}>
                    {new Date(article.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                )}
                {article.date && article.readingTime && (
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

            {/* In-article soft CTA */}
            {cta ? (
              <div className="blog-article__soft-cta">
                <h2>{cta.heading}</h2>
                <p className="muted">{cta.body}</p>
                <div className="button-row">
                  <Link href={cta.primaryCta.href} className="button button-primary">
                    {cta.primaryCta.label}
                  </Link>
                  {cta.secondaryCta && (
                    <Link href={cta.secondaryCta.href} className="button button-secondary">
                      {cta.secondaryCta.label}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="blog-article__soft-cta">
                <h2>{article.cta}</h2>
                <p className="muted">
                  OASIS is being built for landlords managing real portfolios. Get early
                  access, test the workflows, and help shape what comes next.
                </p>
              </div>
            )}
          </div>
        </div>
      </article>
      <FinalCta {...blogCta} />
    </>
  );
}
