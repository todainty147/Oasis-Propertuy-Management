type PreviewItem = {
  title: string;
  body: string;
  points: string[];
  label: string;
  imageSrc: string;
  imageAlt: string;
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
              <div className="preview-shot">
                <div className="preview-shot__header">
                  <span>{item.label}</span>
                </div>
                <img src={item.imageSrc} alt={item.imageAlt} className="preview-shot__image" />
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
