// App Tease — a static mini-dashboard mockup that gives landlords the feel of
// OASIS without logging in. Pure CSS animations, no external dependencies.

type AppTeaseProps = {
  eyebrow?: string;
  title: string;
  body: string;
};

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill="var(--accent)" />
      <path d="M4 7.2l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill="#f59e0b" />
      <path d="M7 4v3.5M7 9.5v.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="var(--muted)" strokeWidth="1.4" />
      <path d="M7 4v3l2 1.5" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2" y="1" width="9" height="12" rx="1.5" stroke="var(--brand)" strokeWidth="1.4" />
      <path d="M4 5h6M4 7.5h6M4 10h3.5" stroke="var(--brand)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function AppTease({ eyebrow, title, body }: AppTeaseProps) {
  return (
    <section className="section app-tease-section">
      <div className="container app-tease-layout">
        {/* Left: copy */}
        <div className="app-tease-copy">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          <p className="muted" style={{ marginTop: "0.75rem", lineHeight: 1.7 }}>{body}</p>
        </div>

        {/* Right: animated mini-dashboard */}
        <div className="app-tease-shell card" role="img" aria-label="OASIS dashboard preview showing rent status and maintenance actions">
          {/* Window chrome */}
          <div className="app-tease-topbar">
            <span className="app-tease-dot app-tease-dot--red" />
            <span className="app-tease-dot app-tease-dot--amber" />
            <span className="app-tease-dot app-tease-dot--green" />
            <span className="app-tease-title">OASIS — Command Center</span>
          </div>

          {/* Dashboard rows */}
          <div className="app-tease-body">
            <p className="app-tease-date muted">Today&rsquo;s action queue</p>

            {/* Row 1 — rent received */}
            <div className="app-tease-row app-tease-row--animate-1">
              <CheckIcon />
              <div className="app-tease-row-content">
                <span className="app-tease-row-label">Rent received</span>
                <span className="app-tease-row-meta muted">Flat 2B &middot; £1,250 &middot; on time</span>
              </div>
              <span className="app-tease-badge app-tease-badge--green">Paid</span>
            </div>

            {/* Row 2 — maintenance resolved */}
            <div className="app-tease-row app-tease-row--animate-2">
              <CheckIcon />
              <div className="app-tease-row-content">
                <span className="app-tease-row-label">Maintenance resolved</span>
                <span className="app-tease-row-meta muted">Boiler service &middot; 14 Maple St &middot; contractor confirmed</span>
              </div>
              <span className="app-tease-badge app-tease-badge--green">Closed</span>
            </div>

            {/* Row 3 — action pending */}
            <div className="app-tease-row app-tease-row--animate-3">
              <AlertIcon />
              <div className="app-tease-row-content">
                <span className="app-tease-row-label">Expected charge — post to Finance?</span>
                <span className="app-tease-row-meta muted">June rent &middot; £1,250 &middot; approval required</span>
              </div>
              <span className="app-tease-badge app-tease-badge--amber">Review</span>
            </div>

            {/* Row 4 — lease expiry */}
            <div className="app-tease-row app-tease-row--animate-4">
              <ClockIcon />
              <div className="app-tease-row-content">
                <span className="app-tease-row-label">Lease renewal — 18 days</span>
                <span className="app-tease-row-meta muted">Flat 4A &middot; Sara T. &middot; renewal not confirmed</span>
              </div>
              <span className="app-tease-badge app-tease-badge--outline">Upcoming</span>
            </div>

            {/* Row 5 — document ready */}
            <div className="app-tease-row app-tease-row--animate-5">
              <DocIcon />
              <div className="app-tease-row-content">
                <span className="app-tease-row-label">Document requested &amp; received</span>
                <span className="app-tease-row-meta muted">Right-to-rent check &middot; 22 Brook Lane &middot; tenant upload</span>
              </div>
              <span className="app-tease-badge app-tease-badge--green">Stored</span>
            </div>

            {/* Summary bar */}
            <div className="app-tease-summary">
              <div className="app-tease-stat">
                <span className="app-tease-stat-value">3</span>
                <span className="app-tease-stat-label muted">Properties</span>
              </div>
              <div className="app-tease-stat">
                <span className="app-tease-stat-value" style={{ color: "var(--accent)" }}>£3,750</span>
                <span className="app-tease-stat-label muted">Rent tracked</span>
              </div>
              <div className="app-tease-stat">
                <span className="app-tease-stat-value" style={{ color: "#f59e0b" }}>1</span>
                <span className="app-tease-stat-label muted">Actions needed</span>
              </div>
            </div>

            <p className="app-tease-disclaimer muted">
              Illustrative preview. Real data appears after setup.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
