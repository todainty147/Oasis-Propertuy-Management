"use client";

export function trackMarketingEvent(eventName: string) {
  if (typeof window === "undefined") return;
  const marketingWindow = window as Window & {
    plausible?: (eventName: string) => void;
    dataLayer?: Array<Record<string, string>>;
  };
  if (typeof marketingWindow.plausible === "function") marketingWindow.plausible(eventName);
  if (Array.isArray(marketingWindow.dataLayer)) marketingWindow.dataLayer.push({ event: eventName });
  window.dispatchEvent(new CustomEvent("tenaqo:marketing-event", { detail: { eventName } }));
}
