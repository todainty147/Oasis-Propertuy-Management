type Faq = {
  question: string;
  answer: string;
};

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>Frequently asked questions</h2>
        </div>
        <div className="grid">
          {items.map((item) => (
            <article key={item.question} className="card faq-item">
              <h3>{item.question}</h3>
              <p className="muted">{item.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
