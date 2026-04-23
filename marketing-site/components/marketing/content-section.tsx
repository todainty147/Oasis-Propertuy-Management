import Link from "next/link";

type SectionItem = {
  title: string;
  body: string;
};

type Cta = {
  label: string;
  href: string;
};

export function ContentSection({
  eyebrow,
  title,
  body,
  items,
  imageSrc,
  imageAlt,
  imageAlign = "right",
  primaryCta,
  secondaryCta,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  items?: SectionItem[];
  imageSrc?: string;
  imageAlt?: string;
  imageAlign?: "left" | "right";
  primaryCta?: Cta;
  secondaryCta?: Cta;
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card content-block content-section">
          <div className={`content-section__layout ${imageSrc ? "" : "content-section__layout--single"} ${imageAlign === "left" ? "content-section__layout--reverse" : ""}`}>
            <div>
              {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
              <h2>{title}</h2>
              {body ? <p className="muted">{body}</p> : null}
              {items?.length ? (
                <div className="grid grid-2 content-section__grid">
                  {items.map((item) => (
                    <article key={item.title} className="content-section__item">
                      <h3>{item.title}</h3>
                      <p className="muted">{item.body}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {primaryCta ? (
                <div className="button-row">
                  <Link href={primaryCta.href} className="button button-primary">
                    {primaryCta.label}
                  </Link>
                  {secondaryCta ? (
                    <Link href={secondaryCta.href} className="button button-secondary">
                      {secondaryCta.label}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            {imageSrc ? (
              <div className="content-section__shot">
                <img src={imageSrc} alt={imageAlt || title} className="content-section__image" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
