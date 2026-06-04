export function TeaserBrowserChrome({ title = "Tenaqo" }: { title?: string }) {
  return (
    <div className="product-teaser__chrome" aria-hidden="true">
      <span className="product-teaser__dot" />
      <span className="product-teaser__dot" />
      <span className="product-teaser__dot" />
      <span className="product-teaser__chrome-title">{title}</span>
    </div>
  );
}
