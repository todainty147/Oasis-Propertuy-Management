import Link from "next/link";

export function PricingPreview({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { label: string; href: string };
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card content-block">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
          <div className="button-row">
            <Link href={cta.href} className="button button-primary">
              {cta.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
