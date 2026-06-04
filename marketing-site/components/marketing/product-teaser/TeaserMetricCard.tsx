import type { TeaserMetric } from "./demoTeaserData";

export function TeaserMetricCard({ metric }: { metric: TeaserMetric }) {
  return (
    <div className={`teaser-metric teaser-metric--${metric.tone || "neutral"}`}>
      <span className="teaser-metric__label">{metric.label}</span>
      <strong>{metric.value}</strong>
      {metric.detail ? <span className="teaser-metric__detail">{metric.detail}</span> : null}
    </div>
  );
}
