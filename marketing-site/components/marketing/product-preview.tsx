type PreviewItem = {
  title: string;
  body: string;
  points: string[];
  label: string;
};

export function ProductPreview({
  title,
  body,
  items,
}: {
  title: string;
  body: string;
  items: PreviewItem[];
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
            <article key={item.title} className="card preview-card">
              <div className="preview-shot" aria-hidden="true">
                <div className="preview-shot__header">
                  <span>{item.label}</span>
                </div>
                <div className="preview-shot__body">
                  <div className="preview-shot__chart" />
                  <div className="preview-shot__row" />
                  <div className="preview-shot__row preview-shot__row--short" />
                  <div className="preview-shot__tiles">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
              <ul className="feature-list">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
