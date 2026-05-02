export function TestimonialStrip({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="section testimonials">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
        </div>
        <div className="grid grid-3">
          {items.map((item) => (
            <blockquote key={item} className="card testimonial-card">
              <p>{item}</p>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
