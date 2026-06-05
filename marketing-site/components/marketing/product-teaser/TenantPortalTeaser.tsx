"use client";

import { tenantPortalMetrics, tenantPortalQueue } from "./demoTeaserData";
import { ProductTeaserFrame } from "./ProductTeaserFrame";
import { TeaserMetricCard } from "./TeaserMetricCard";
import { TeaserQueueItem } from "./TeaserQueueItem";
import { useTeaserSequence } from "./useTeaserSequence";

export function TenantPortalTeaser({ compact = false }: { compact?: boolean }) {
  const sequence = useTeaserSequence(tenantPortalQueue.length, 3400);

  return (
    <ProductTeaserFrame title="Tenant Portal" compact={compact}>
      <div className="tenant-portal-teaser">
        <div className="tenant-portal-teaser__header">
          <span className="product-teaser__eyebrow">My home</span>
          <h3>Flat 4, Clifton</h3>
          <p>Repair updates, rent visibility, and shared documents in one tenant-facing view.</p>
        </div>

        <div className="tenant-portal-teaser__metrics">
          {tenantPortalMetrics.map((metric) => (
            <TeaserMetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <ol className="teaser-queue teaser-queue--compact" aria-label="Tenant Portal demo timeline">
          {tenantPortalQueue.map((item, index) => (
            <TeaserQueueItem key={item.title} item={item} active={index === sequence.activeIndex} />
          ))}
        </ol>
      </div>
    </ProductTeaserFrame>
  );
}
