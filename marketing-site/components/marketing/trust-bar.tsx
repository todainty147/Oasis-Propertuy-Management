type TrustBarProps = {
  title: string;
  body: string;
  badges: Array<{ label: string }>;
  disclaimer: string;
};

export function TrustBar({ title, body, badges, disclaimer }: TrustBarProps) {
  return (
    <section className="trust-bar section">
      <div className="container">
        <div className="section-title" style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2>{title}</h2>
          <p className="muted" style={{ maxWidth: 600, margin: "0.75rem auto 0" }}>{body}</p>
        </div>
        <div className="trust-bar__grid">
          {badges.map((badge) => (
            <div key={badge.label} className="trust-bar__badge">
              <span className="trust-bar__icon" aria-hidden="true">✓</span>
              <span>{badge.label}</span>
            </div>
          ))}
        </div>
        <p className="trust-bar__disclaimer muted">{disclaimer}</p>
      </div>
    </section>
  );
}
