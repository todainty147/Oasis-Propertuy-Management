import Link from "next/link";

import { siteConfig } from "../../content/site";

type Plan = {
  name: string;
  price: string;
  description: string;
  bullets: string[];
  highlight?: boolean;
  tag?: string;
};

export function PricingCards({ plans }: { plans: Plan[] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="grid grid-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`card pricing-card ${plan.highlight ? "pricing-highlight" : ""}`}
            >
              {plan.tag ? <span className="pricing-tag">{plan.tag}</span> : null}
              <h3>{plan.name}</h3>
              <p className="price">{plan.price}</p>
              <p className="muted">{plan.description}</p>
              <ul className="feature-list">
                {plan.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <div className="button-row">
                <Link href={siteConfig.appUrl} className="button button-primary">
                  Start Free
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
