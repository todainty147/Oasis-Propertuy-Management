import Link from "next/link";

type HeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  support: string;
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
          <div className="hero__mock card">
            <div className="mock-window">
              <div className="mock-topbar">
                <span className="mock-dot" />
                <span className="mock-dot" />
                <span className="mock-dot" />
              </div>
              <div className="mock-content">
                <div className="mock-stat mock-stat--large">
                  <strong>Portfolio dashboard</strong>
                  <p className="muted">Overdue rent, active maintenance, and property status in one view.</p>
                  <div className="mock-bars">
                    <span className="mock-bar mock-bar--teal" />
                    <span className="mock-bar mock-bar--amber" />
                    <span className="mock-bar mock-bar--slate" />
                  </div>
                </div>
                <div className="mock-grid">
                  <div className="mock-stat">
                    <strong>Maintenance requests</strong>
                    <p className="muted">Track open work, assignments, and repairs needing action.</p>
                  </div>
                  <div className="mock-stat">
                    <strong>Property status</strong>
                    <p className="muted">See tenant context, rent status, and linked records quickly.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
