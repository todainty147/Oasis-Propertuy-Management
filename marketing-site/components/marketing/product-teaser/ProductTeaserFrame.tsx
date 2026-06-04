import type { ReactNode } from "react";

import { TeaserBrowserChrome } from "./TeaserBrowserChrome";

export function ProductTeaserFrame({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`product-teaser-frame${compact ? " product-teaser-frame--compact" : ""}`}>
      <TeaserBrowserChrome title={title} />
      <div className="product-teaser-frame__body">{children}</div>
    </div>
  );
}
