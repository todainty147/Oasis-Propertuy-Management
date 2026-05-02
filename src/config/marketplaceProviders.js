export const marketplaceProviders = {
  checkatrade: {
    providerKey: "checkatrade",
    countryCode: "GB",
    label: "Checkatrade",
    mode: "api",
    description: "Find a vetted UK trade via Checkatrade.",
    websiteUrl: "https://www.checkatrade.com",
  },
  fixly: {
    providerKey: "fixly",
    countryCode: "PL",
    label: "Fixly",
    mode: "manual",
    description: "Prepare a Fixly handoff for Polish properties.",
    websiteUrl: "https://fixly.pl",
  },
  myhammer: {
    providerKey: "myhammer",
    countryCode: "DE",
    label: "MyHammer",
    mode: "manual",
    description: "Prepare a MyHammer handoff for German properties.",
    websiteUrl: "https://www.my-hammer.de",
  },
};

export function listMarketplaceProviders() {
  return Object.values(marketplaceProviders);
}

export function inferMarketplaceProviderFromCountry(countryCode) {
  const raw = String(countryCode || "").trim().toUpperCase();
  if (raw === "GB" || raw === "UK") return "checkatrade";
  if (raw === "PL" || raw === "POLAND") return "fixly";
  if (raw === "DE" || raw === "GERMANY") return "myhammer";
  return null;
}
