import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  emphasis?: string;
  support: string;
  highlights?: Array<string | { label: string; href?: string }>;
  microcopy?: string[];
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
          {props.emphasis ? (
            <p
              style={{
                marginTop: "1rem",
                maxWidth: 620,
                color: "var(--brand-strong)",
                font: "700 0.98rem/1.5 var(--font-sans)",
              }}
            >
              {props.emphasis}
            </p>
          ) : null}
          <div className="button-row">
            <Link href={props.primaryCta.href} className="button button-primary">
              {props.primaryCta.label}
            </Link>
            <Link href={props.secondaryCta.href} className="button button-secondary">
              {props.secondaryCta.label}
            </Link>
          </div>
          {props.highlights?.length ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.65rem",
                marginTop: "1rem",
              }}
            >
              {props.highlights.map((item) => {
                const next = typeof item === "string" ? { label: item } : item;
                const commonStyle = {
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--line)",
                  background: "var(--surface-strong)",
                  color: "var(--brand-strong)",
                  font: "700 0.82rem/1 var(--font-sans)",
                } as const;

                if (next.href) {
                  return (
                    <Link
                      key={next.label}
                      href={next.href}
                      style={commonStyle}
                    >
                      {next.label}
                    </Link>
                  );
                }

                return (
                  <span key={next.label} style={commonStyle}>
                    {next.label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {props.microcopy?.length ? (
            <ul
              style={{
                margin: "1rem 0 0",
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.45rem",
                maxWidth: 620,
              }}
            >
              {props.microcopy.map((item) => (
                <li
                  key={item}
                  className="muted"
                  style={{ fontSize: "0.94rem", lineHeight: 1.45 }}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="muted" style={{ marginTop: "1rem", maxWidth: 620 }}>
            {props.support}
          </p>
        </div>
        <div className="hero__panel">
          <div className="hero__shot card">
            <Image
              src={props.imageSrc}
              alt={props.imageAlt}
              className="hero__shot-image"
              width={1600}
              height={1000}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
