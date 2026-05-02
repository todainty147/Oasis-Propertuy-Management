type BenefitItem = {
  title: string;
  body: string;
};

export function BenefitGrid({
  title,
  items,
}: {
  title: string;
  items: BenefitItem[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
        </div>
        <div className="grid grid-2">
          {items.map((item) => (
            <article key={item.title} className="card benefit-card">
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
