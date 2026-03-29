import Link from "next/link";

type HeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  support: string;
  imageSrc: string;
  imageAlt: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
};

export function HeroSection(props: HeroProps) {
  return (
    <section className="hero">
      <div className="container hero__layout">
        <div>
          <span className="eyebrow">{props.eyebrow}</span>
          <h1>{props.title}</h1>
          <p className="muted" style={{ maxWidth: 680, marginTop: "1.25rem" }}>
            {props.body}
          </p>
          <div className="button-row">
            <Link href={props.primaryCta.href} className="button button-primary">
              {props.primaryCta.label}
            </Link>
            <Link href={props.secondaryCta.href} className="button button-secondary">
              {props.secondaryCta.label}
            </Link>
          </div>
          <p className="muted" style={{ marginTop: "1rem", maxWidth: 620 }}>
            {props.support}
          </p>
        </div>
        <div className="hero__panel">
          <div className="hero__shot card">
            <img src={props.imageSrc} alt={props.imageAlt} className="hero__shot-image" />
          </div>
        </div>
      </div>
    </section>
  );
}
