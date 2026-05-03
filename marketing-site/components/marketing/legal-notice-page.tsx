import type { Locale } from "../../lib/i18n";
import { legalNoticeContentByLocale } from "../../content/legal";

export function LegalNoticePage({ locale }: { locale: Locale }) {
  const content = legalNoticeContentByLocale[locale];

  return (
    <main>
      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <div className="eyebrow">{content.eyebrow}</div>
          <h1>{content.title}</h1>
          <p className="muted" style={{ marginTop: "1rem", maxWidth: 760 }}>
            {content.intro}
          </p>

          <div style={{ marginTop: "2rem", display: "grid", gap: "1.5rem" }}>
            {content.sections.map((section) => (
              <article key={section.title} className="card" style={{ padding: "1.5rem" }}>
                <h2 style={{ marginBottom: "0.75rem" }}>{section.title}</h2>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="muted">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
