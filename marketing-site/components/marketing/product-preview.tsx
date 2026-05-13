import Image from "next/image";
import Link from "next/link";

type PreviewItem = {
  title: string;
  body: string;
  points: string[];
  label: string;
  imageSrc: string;
  imageAlt: string;
};

export function ProductPreview({
  title,
  body,
  items,
  featuresHref,
}: {
  title: string;
  body: string;
  items: PreviewItem[];
  featuresHref?: string;
}) {
  const gridClass = items.length <= 4 ? "grid grid-2 preview-grid" : "grid grid-3 preview-grid";

  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
        </div>
        <div className={gridClass}>
          {items.map((item) => (
            <article key={item.title} className="card preview-card">
              <div className="preview-shot">
                <div className="preview-shot__header">
                  <span>{item.label}</span>
                </div>
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  className="preview-shot__image"
                  width={1600}
                  height={1000}
                />
              </div>
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
              <ul className="feature-list">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        {featuresHref && (
          <p className="preview-features-link">
            <Link href={featuresHref}>See all platform features →</Link>
          </p>
        )}
      </div>
    </section>
  );
}
