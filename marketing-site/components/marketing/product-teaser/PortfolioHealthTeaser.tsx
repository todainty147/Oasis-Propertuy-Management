"use client";

import { portfolioHealthMetrics, portfolioHealthQueue } from "./demoTeaserData";
import { ProductTeaserFrame } from "./ProductTeaserFrame";
import { TeaserMetricCard } from "./TeaserMetricCard";
import { TeaserQueueItem } from "./TeaserQueueItem";
import { useTeaserSequence } from "./useTeaserSequence";

export function PortfolioHealthTeaser({ compact = false }: { compact?: boolean }) {
  const sequence = useTeaserSequence(portfolioHealthQueue.length, 3200);

  return (
    <ProductTeaserFrame title="Portfolio Health" compact={compact}>
      <div className="portfolio-teaser">
        <div className="portfolio-teaser__score" aria-label="Portfolio health score 82">
          <svg viewBox="0 0 120 120" role="presentation" aria-hidden="true">
            <circle cx="60" cy="60" r="48" />
            <circle className="portfolio-teaser__score-progress" cx="60" cy="60" r="48" />
          </svg>
          <div>
            <span>82</span>
            <small>Health score</small>
          </div>
        </div>

        <div className="portfolio-teaser__content">
          <div className="portfolio-teaser__heading">
            <span className="product-teaser__eyebrow">Portfolio Health</span>
            <h3>Pressure made visible before it becomes noise</h3>
          </div>

          <div className="portfolio-teaser__metrics">
            {portfolioHealthMetrics.map((metric) => (
              <TeaserMetricCard key={metric.label} metric={metric} />
            ))}
          </div>

          <ol className="teaser-queue teaser-queue--compact" aria-label="Portfolio Health demo queue">
            {portfolioHealthQueue.map((item, index) => (
              <TeaserQueueItem key={item.title} item={item} active={index === sequence.activeIndex} />
            ))}
          </ol>
        </div>
      </div>
    </ProductTeaserFrame>
  );
}
