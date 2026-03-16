type SectionItem = {
  title: string;
  body: string;
};

export function ContentSection({
  eyebrow,
  title,
  body,
  items,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  items?: SectionItem[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card content-block content-section">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {body ? <p className="muted">{body}</p> : null}
          {items?.length ? (
            <div className="grid grid-2 content-section__grid">
              {items.map((item) => (
                <article key={item.title} className="content-section__item">
                  <h3>{item.title}</h3>
                  <p className="muted">{item.body}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
