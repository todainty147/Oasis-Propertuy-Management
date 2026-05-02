export function IncludedFeatures({
  title,
  bullets,
}: {
  title: string;
  bullets: string[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card content-block">
          <h2>{title}</h2>
          <ul className="included-list">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
