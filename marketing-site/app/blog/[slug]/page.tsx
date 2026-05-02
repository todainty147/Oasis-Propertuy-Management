import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { FinalCta } from "../../../components/marketing/final-cta";
import { blogArticles, blogCta, getBlogArticle } from "../../../content/blog";
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

  if (!article) {
    return {};
  }

  return buildMetadata({
    title: `${article.title} | OASIS Rental Blog`,
    description: article.metaDescription,
    canonical: `${siteConfig.url}/blog/${article.slug}`,
  });
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const article = getBlogArticle(slug);

  if (!article) {
    notFound();
  }

  return (
    <>
      <article className="section blog-article">
        <div className="container">
          <div className="blog-article__header">
            <span className="eyebrow">{article.category}</span>
            <h1>{article.title}</h1>
            <p className="muted">{article.summary}</p>
          </div>
          <div className="card content-block blog-article__body">
            {article.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="muted">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
            <div className="blog-article__soft-cta">
              <h2>{article.cta}</h2>
              <p className="muted">
                OASIS is being built for landlords managing real portfolios. Get early
                access, test the workflows, and help shape what comes next.
              </p>
            </div>
          </div>
        </div>
      </article>
      <FinalCta {...blogCta} />
    </>
  );
}
