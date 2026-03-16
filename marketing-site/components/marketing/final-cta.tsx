import Link from "next/link";

type Cta = { label: string; href: string };

export function FinalCta({
  title,
  body,
  primaryCta,
  secondaryCta,
}: {
  title: string;
  body: string;
  primaryCta: Cta;
  secondaryCta?: Cta;
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card final-cta">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <Link href={primaryCta.href} className="button button-primary">
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link href={secondaryCta.href} className="button button-secondary">
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
