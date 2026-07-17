// Polish and any other locale variants of this comparison page redirect
// permanently to the English route. The comparison page is English-only:
// no Polish translation exists and no pl hreflang is emitted on the
// canonical English page.
//
// Redirect behaviour (per WP4C route decision):
//   /pl/compare/tenaqo-vs-landlord-management-apps → 308 →
//   /compare/tenaqo-vs-landlord-management-apps
//
// German marketing routes remain withdrawn (WP1).
import { permanentRedirect } from "next/navigation";

export default function LocalizedComparisonRedirect() {
  permanentRedirect("/compare/tenaqo-vs-landlord-management-apps");
}
