import Image from "next/image";
import Link from "next/link";

import type { Locale } from "../../lib/i18n";
import { getLocalizedMarketingHref } from "../../lib/i18n";

export function PageHero({
  locale = "en",
  eyebrow,
  title,
  body,
  cta,
  imageSrc,
  imageAlt,
}: {
  locale?: Locale;
  eyebrow?: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  imageSrc?: string;
  imageAlt?: string;
}) {
  return (
    <section className="page-hero">
      <div className={`container ${imageSrc ? "page-hero__layout" : ""}`}>
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          <p className="muted" style={{ maxWidth: 760, marginTop: "1.25rem" }}>
            {body}
          </p>
          {cta ? (
            <div className="button-row">
              <Link
                href={getLocalizedMarketingHref(locale, cta.href)}
                className="button button-primary"
              >
                {cta.label}
              </Link>
            </div>
          ) : null}
        </div>
        {imageSrc ? (
          <div className="page-hero__shot card">
            <Image
              src={imageSrc}
              alt={imageAlt || title}
              className="page-hero__image"
              width={1600}
              height={1000}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
