import Image from "next/image";
import Link from "next/link";

import type { Locale } from "../../lib/i18n";
import { getLocalizedMarketingHref } from "../../lib/i18n";
import { CommandCenterTeaser, ProductWalkthroughModal } from "./product-teaser";

type HeroProps = {
  locale?: Locale;
  eyebrow: string;
  title: string;
  body: string;
  emphasis?: string;
  support: string;
  imageSrc?: string;
  imageAlt?: string;
  productTeaser?: boolean;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

export function HeroSection(props: HeroProps) {
  const locale = props.locale || "en";

  return (
    <section className="hero" data-home-section="hero">
      <div className="container hero__layout">
        <div>
          <span className="eyebrow">{props.eyebrow}</span>
          <h1>{props.title}</h1>
          <p className="muted" style={{ maxWidth: 680, marginTop: "1.25rem" }}>
            {props.body}
          </p>
          {props.emphasis ? (
            <p
              style={{
                marginTop: "1rem",
                maxWidth: 620,
                color: "#bdf6ec",
                font: "700 0.98rem/1.5 var(--font-sans)",
              }}
            >
              {props.emphasis}
            </p>
          ) : null}
          <div className="button-row">
            <Link
              href={getLocalizedMarketingHref(locale, props.primaryCta.href)}
              className="button button-primary"
            >
              {props.primaryCta.label}
            </Link>
            {props.productTeaser ? (
              <ProductWalkthroughModal label="Watch product preview" />
            ) : props.secondaryCta ? (
              <Link
                href={getLocalizedMarketingHref(locale, props.secondaryCta.href)}
                className="button button-secondary"
              >
                {props.secondaryCta.label}
              </Link>
            ) : null}
          </div>
          <p className="muted" style={{ marginTop: "1rem", maxWidth: 620 }}>
            {props.support}
          </p>
        </div>
        <div className="hero__panel">
          {props.productTeaser ? (
            <CommandCenterTeaser />
          ) : props.imageSrc && props.imageAlt ? (
            <div className="hero__shot card">
              <Image
                src={props.imageSrc}
                alt={props.imageAlt}
                className="hero__shot-image"
                width={1600}
                height={1000}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
