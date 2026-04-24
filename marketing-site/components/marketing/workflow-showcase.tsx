import Image from "next/image";
import Link from "next/link";

type WorkflowItem = {
  title: string;
  body: string;
  href: string;
  points: string[];
  label: string;
  imageSrc: string;
  imageAlt: string;
};

export function WorkflowShowcase({
  title,
  body,
  items,
}: {
  title: string;
  body: string;
  items: WorkflowItem[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
        </div>
        <div className="workflow-list">
          {items.map((item, index) => (
            <article
              key={item.title}
              className={`card workflow-card ${index % 2 === 1 ? "workflow-card--reverse" : ""}`}
            >
              <div className="workflow-copy">
                <span className="eyebrow">{item.label}</span>
                <h3>{item.title}</h3>
                <p className="muted">{item.body}</p>
                <ul className="feature-list">
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <Link href={item.href} className="button button-secondary">
                    Explore this workflow
                  </Link>
                </div>
              </div>
              <div className="workflow-image">
                <div className="workflow-image__window">
                  <div className="workflow-image__toolbar">{item.label}</div>
                  <Image
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    className="workflow-image__img"
                    width={1600}
                    height={1000}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
