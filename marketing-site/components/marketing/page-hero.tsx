import Link from "next/link";

export function PageHero({
  eyebrow,
  title,
  body,
  cta,
  imageSrc,
  imageAlt,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  imageSrc?: string;
  imageAlt?: string;
}) {
  return (
    <section className="page-hero">
      <div className={`container ${imageSrc ? "page-hero__layout" : ""}`}>
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          <p className="muted" style={{ maxWidth: 760, marginTop: "1.25rem" }}>
            {body}
          </p>
          {cta ? (
            <div className="button-row">
              <Link href={cta.href} className="button button-primary">
                {cta.label}
              </Link>
            </div>
          ) : null}
        </div>
        {imageSrc ? (
          <div className="page-hero__shot card">
            <img src={imageSrc} alt={imageAlt || title} className="page-hero__image" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
