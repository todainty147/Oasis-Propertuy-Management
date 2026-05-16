import Link from "next/link";

type ComparisonRow = { feature: string; oasis: string; agent: string };

type AgentComparisonProps = {
  title: string;
  body: string;
  rows: ComparisonRow[];
  disclaimer: string;
  cta: { label: string; href: string };
};

export function AgentComparison({
  title,
  body,
  rows,
  disclaimer,
  cta,
}: AgentComparisonProps) {
  return (
    <section id="agent-comparison" className="section agent-comparison">
      <div className="container">
        <div className="section-title" style={{ maxWidth: 720, marginBottom: "2.5rem" }}>
          <h2>{title}</h2>
          <p className="muted" style={{ marginTop: "0.75rem" }}>{body}</p>
        </div>

        {/* Desktop table — visually hidden on mobile via CSS display:none (removes from a11y tree) */}
        <div className="agent-comparison__table-wrap" aria-label="Tenaqo vs Traditional Agents comparison">
          <table className="agent-comparison__table">
            <thead>
              <tr>
                <th scope="col" className="agent-comparison__th agent-comparison__th--feature">Feature</th>
                <th scope="col" className="agent-comparison__th agent-comparison__th--oasis">Tenaqo</th>
                <th scope="col" className="agent-comparison__th agent-comparison__th--agent">Traditional Agents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="agent-comparison__row">
                  <td className="agent-comparison__td agent-comparison__td--feature">{row.feature}</td>
                  <td className="agent-comparison__td agent-comparison__td--oasis">
                    <span className="agent-comparison__check" aria-hidden="true">✓</span>
                    {row.oasis}
                  </td>
                  <td className="agent-comparison__td agent-comparison__td--agent">{row.agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards — display:none on desktop removes this from a11y tree correctly.
            No aria-hidden needed: whichever version is display:block is the one screen readers see. */}
        <div className="agent-comparison__mobile">
          {rows.map((row) => (
            <div key={row.feature} className="card agent-comparison__mobile-card">
              <p className="agent-comparison__mobile-feature">{row.feature}</p>
              <div className="agent-comparison__mobile-row">
                <span className="agent-comparison__mobile-label agent-comparison__mobile-label--oasis">Tenaqo</span>
                <p className="agent-comparison__mobile-text">
                  <span className="agent-comparison__check" aria-hidden="true">✓</span>
                  {row.oasis}
                </p>
              </div>
              <div className="agent-comparison__mobile-row">
                <span className="agent-comparison__mobile-label">Traditional Agents</span>
                <p className="agent-comparison__mobile-text muted">{row.agent}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="agent-comparison__disclaimer muted">{disclaimer}</p>

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <p className="agent-comparison__cta-prompt" style={{ marginBottom: "1rem" }}>
            Want the visibility without the traditional admin?
          </p>
          <Link href={cta.href} className="button button-primary">
            {cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
