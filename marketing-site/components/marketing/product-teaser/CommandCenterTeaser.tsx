"use client";

import { commandCenterMetrics, commandCenterQueue } from "./demoTeaserData";
import { ProductTeaserFrame } from "./ProductTeaserFrame";
import { TeaserMetricCard } from "./TeaserMetricCard";
import { TeaserQueueItem } from "./TeaserQueueItem";
import { useTeaserSequence } from "./useTeaserSequence";

export function CommandCenterTeaser({ compact = false }: { compact?: boolean }) {
  const sequence = useTeaserSequence(commandCenterQueue.length, 2800);

  return (
    <ProductTeaserFrame title="Command Center" compact={compact}>
      <div className="command-teaser">
        <div className="command-teaser__header">
          <div>
            <span className="product-teaser__eyebrow">Today</span>
            <h2>Command Center</h2>
          </div>
          <span className="command-teaser__pill">Landlord controlled</span>
        </div>

        <div className="command-teaser__metrics">
          {commandCenterMetrics.map((metric) => (
            <TeaserMetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <div className="command-teaser__split">
          <div className="command-teaser__briefing">
            <span className="product-teaser__eyebrow">Daily AI summary</span>
            <p>
              Two items need owner approval before anything moves: one quote, one arrears follow-up.
            </p>
          </div>
          <ol className="teaser-queue" aria-label="Command Center demo queue">
            {commandCenterQueue.map((item, index) => (
              <TeaserQueueItem key={item.title} item={item} active={index === sequence.activeIndex} />
            ))}
          </ol>
        </div>
      </div>
    </ProductTeaserFrame>
  );
}
