type FeatureItem = {
  title: string;
  body: string;
};

export function FeatureGrid({
  title,
  body,
  items,
}: {
  title: string;
  body: string;
  items: FeatureItem[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
          <p className="muted">{body}</p>
        </div>
        <div className="grid grid-3">
          {items.map((item) => (
            <article key={item.title} className="card feature-card">
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
