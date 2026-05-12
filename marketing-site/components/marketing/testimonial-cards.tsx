type TestimonialItem = { quote: string; name: string; context: string };

type TestimonialCardsProps = {
  title: string;
  disclaimer: string;
  items: TestimonialItem[];
};

export function TestimonialCards({ title, disclaimer, items }: TestimonialCardsProps) {
  return (
    <section className="section testimonial-cards-section">
      <div className="container">
        <div className="section-title" style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h2>{title}</h2>
        </div>
        <div className="testimonial-cards__grid">
          {items.map((item) => (
            <blockquote key={item.name} className="card testimonial-card-rich">
              <p className="testimonial-card-rich__quote">&ldquo;{item.quote}&rdquo;</p>
              <footer className="testimonial-card-rich__footer">
                <span className="testimonial-card-rich__name">{item.name}</span>
                <span className="testimonial-card-rich__context muted">{item.context}</span>
              </footer>
            </blockquote>
          ))}
        </div>
        <p className="testimonial-cards__disclaimer muted">{disclaimer}</p>
      </div>
    </section>
  );
}
