import type { TeaserQueueItem as TeaserQueueItemType } from "./demoTeaserData";

export function TeaserQueueItem({ item, active = false }: { item: TeaserQueueItemType; active?: boolean }) {
  return (
    <li className={`teaser-queue-item teaser-queue-item--${item.tone || "neutral"}${active ? " is-active" : ""}`}>
      <div>
        <strong>{item.title}</strong>
        <span>{item.meta}</span>
      </div>
      <em>{item.status}</em>
    </li>
  );
}
